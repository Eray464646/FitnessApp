// Serverless function for food scanning using Gemini Vision API
// This keeps API keys secure on the server side
//
// Platform Compatibility:
// - Vercel: Supports CommonJS (module.exports) - RECOMMENDED
// - Netlify: Supports CommonJS (module.exports)
// - AWS Lambda: Supports CommonJS (module.exports)
//
// Note: Using CommonJS syntax for maximum compatibility across serverless platforms
//
// NEW: Also supports user-provided API keys (passed in request, not persisted)

// Configuration constants
const CONFIDENCE_THRESHOLD = 40;  // Minimum confidence percentage to accept detection (lowered for better detection)
const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB max image size
const ALLOWED_ORIGINS = [
  'https://eray464646.github.io',
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1:8000'
];

// Simple rate limiting (in-memory, resets on function cold start)
// NOTE: This is a basic implementation suitable for light usage.
// For production with heavy traffic, consider using:
// - Redis/Upstash for persistent rate limiting
// - Vercel Edge Config for distributed state
// - External rate limiting service (e.g., Cloudflare)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, []);
  }
  
  const requests = rateLimitMap.get(key).filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  requests.push(now);
  rateLimitMap.set(key, requests);
  return true;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.referer || '';
  
  // Enable CORS for allowed origins only
  if (ALLOWED_ORIGINS.some(allowed => origin.includes(allowed) || allowed === '*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || ALLOWED_ORIGINS[0]);
  } else {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]); // Fallback to GitHub Pages
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Rate limiting
    const clientIp = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      console.warn(`Rate limit exceeded for IP: ${clientIp}`);
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        detected: false,
        message: 'Zu viele Anfragen. Bitte warte eine Minute.'
      });
    }

    // Get API key from environment OR from request body
    // Priority: user-provided key > server environment variable
    const { key: userProvidedKey, imageBase64, mimeType, prompt, image } = req.body;
    
    let apiKey = userProvidedKey || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('No API key provided');
      return res.status(400).json({ 
        error: 'API key required',
        detected: false,
        message: 'Bitte gib einen API Key an oder konfiguriere den Server'
      });
    }

    // Validate API key format (basic check)
    if (!apiKey.startsWith('AIza')) {
      return res.status(400).json({ 
        error: 'Invalid API key format',
        detected: false,
        message: 'Ungültiges API Key Format'
      });
    }

    // Parse image data (support both new and old format)
    let base64Data, imageMimeType;
    
    if (imageBase64 && mimeType) {
      // New format: separate base64 and mimeType
      base64Data = imageBase64;
      imageMimeType = mimeType;
    } else if (image) {
      // Old format: data URL
      const matches = image.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ 
          error: 'Invalid image format',
          detected: false 
        });
      }
      imageMimeType = matches[1] || 'image/jpeg';
      base64Data = matches[2];
    } else {
      return res.status(400).json({ 
        error: 'Missing image data',
        detected: false 
      });
    }

    // Validate mime type
    if (!['image/jpeg', 'image/png'].includes(imageMimeType)) {
      return res.status(400).json({ 
        error: 'Invalid image type',
        detected: false,
        message: 'Nur JPEG und PNG werden unterstützt'
      });
    }

    // Check image size (rough estimate: base64 is ~4/3 of binary size)
    const estimatedSize = (base64Data.length * 3) / 4;
    if (estimatedSize > MAX_IMAGE_SIZE) {
      return res.status(400).json({ 
        error: 'Image too large',
        detected: false,
        message: 'Bild zu groß. Maximal 4MB erlaubt.'
      });
    }

    console.log(`Processing food scan request, MIME: ${imageMimeType}, size: ~${Math.round(estimatedSize / 1024)}KB`);

    // Use provided prompt or default
    const defaultPrompt = `Analysiere dieses Bild und identifiziere ALLE Lebensmittel und Getränke.

WICHTIG: 
- Erkenne Lebensmittel aus ALLEN Kategorien: Obst, Gemüse, Fleisch, Fisch, Reis, Pasta, Brot, Milchprodukte, Snacks, Desserts, Getränke
- Bei mehreren Lebensmitteln auf einem Teller/Foto: Liste ALLE auf
- Bei gemischten Gerichten (z.B. Bowl, Teller, Salat, Sandwich, Pasta-Gericht): Erkenne die Hauptkomponenten
- Wenn ein Lebensmittel offensichtlich zu sehen ist, setze detected=true, auch bei niedriger Confidence
- Nur wenn definitiv KEIN Essen im Bild ist, setze detected=false

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in folgendem Format (kein Markdown, kein Text drumherum):

{
  "detected": true,
  "items": [
    {
      "label": "Lebensmittel 1",
      "confidence": 85,
      "portion": {"unit": "g", "value": 120},
      "macros": {"protein": 1.3, "fat": 0.4, "carbs": 27.0},
      "calories": 105
    }
  ],
  "totals": {"calories": 105, "protein": 1.3, "fat": 0.4, "carbs": 27.0},
  "notes": "Kurze Erklärung"
}

Confidence-Logik:
- Wenn eindeutig Essen sichtbar: confidence 70-100, detected=true
- Wenn unsicher aber wahrscheinlich Essen: confidence 40-69, detected=true, notes="Unsicher – bitte bestätigen"
- Wenn definitiv kein Essen: detected=false

Schätze realistische Nährwerte für typische Portionen.`;

    const finalPrompt = prompt || defaultPrompt;

    // Call Gemini Vision API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: finalPrompt },
            {
              inlineData: {
                mimeType: imageMimeType,
                data: base64Data
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.4,
          topK: 32,
          topP: 1,
          maxOutputTokens: 1000
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}));
      const status = geminiResponse.status;
      
      console.error('Gemini API error:', {
        status: status,
        statusText: geminiResponse.statusText,
        error: errorData.error?.message?.substring(0, 100) // Log truncated error, never log API key
      });
      
      // Handle specific error cases with detailed messages
      let errorMessage = 'API request failed';
      let userMessage = 'Fehler bei der Bilderkennung';
      
      if (status === 400) {
        errorMessage = 'Invalid API request - check payload format';
        userMessage = 'Ungültiges Bildformat';
      } else if (status === 429) {
        errorMessage = 'API rate limit exceeded';
        userMessage = 'API-Limit erreicht. Bitte später erneut versuchen.';
      } else if (status === 403 || status === 401) {
        errorMessage = 'API authentication failed - check API key';
        userMessage = 'API-Authentifizierung fehlgeschlagen';
      } else if (status === 404) {
        errorMessage = 'API endpoint not found - check model name';
        userMessage = 'API-Endpunkt nicht gefunden';
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        message: userMessage,
        detected: false,
        apiStatus: status
      });
    }

    const data = await geminiResponse.json();
    
    // Extract text from Gemini response
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('Invalid Gemini response structure:', JSON.stringify(data).substring(0, 200));
      return res.status(500).json({ 
        error: 'Invalid API response',
        detected: false 
      });
    }
    
    const content = data.candidates[0].content.parts[0].text;
    console.log('Gemini response text:', content.substring(0, 200));

    // Try to extract JSON from the response
    let result;
    try {
      // Try to parse as direct JSON
      result = JSON.parse(content);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON object in the text
        const objectMatch = content.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          result = JSON.parse(objectMatch[0]);
        } else {
          console.error('Could not extract JSON from response:', content);
          // Fallback: assume food detected
          result = {
            detected: true,
            items: [{ label: 'Lebensmittel erkannt', confidence: 50, calories: 0, macros: { protein: 0, fat: 0, carbs: 0 } }],
            totals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
            notes: content.substring(0, 200),
            lowConfidence: true
          };
        }
      }
    }

    // Apply confidence gating using defined threshold
    if (result.detected) {
      // Calculate average confidence from items
      const avgConfidence = result.items && result.items.length > 0
        ? result.items.reduce((sum, item) => sum + (item.confidence || 70), 0) / result.items.length
        : result.confidence || 70;
      
      if (avgConfidence < CONFIDENCE_THRESHOLD) {
        console.log(`Low confidence (${avgConfidence}%), marking as uncertain`);
        result.detected = false;
        result.message = 'Unsicher – bitte bestätigen oder klareres Foto verwenden';
        result.lowConfidence = true;
      } else if (avgConfidence < 60) {
        result.message = 'Unsicher – bitte bestätigen';
        result.lowConfidence = true;
      }
    }
    
    if (!result.detected && !result.message) {
      // Ensure there's a message when no food is detected
      result.message = result.notes || result.reasoning || 'Kein Essen erkannt';
    }

    // Ensure all required fields are present for backward compatibility
    if (result.detected) {
      // Convert new format to legacy format if needed
      const totals = result.totals || {};
      const firstItem = result.items && result.items[0] || {};
      
      result.label = result.items && result.items.length > 0 
        ? result.items.map(i => i.label).join(', ')
        : 'Unbekanntes Lebensmittel';
      result.calories = Math.round(totals.calories || firstItem.calories || 0);
      result.protein = Math.round(totals.protein || firstItem.macros?.protein || 0);
      result.carbs = Math.round(totals.carbs || firstItem.macros?.carbs || 0);
      result.fat = Math.round(totals.fat || firstItem.macros?.fat || 0);
      result.confidence = Math.round(firstItem.confidence || 70);
    }

    console.log('Processed result:', { 
      detected: result.detected, 
      label: result.label,
      confidence: result.confidence,
      items: result.items?.length || 0
    });

    // Return structured response
    return res.status(200).json(result);

  } catch (error) {
    console.error('Food scan error:', error.message);
    return res.status(500).json({ 
      error: 'Internal server error',
      detected: false,
      message: 'Interner Serverfehler'
    });
  }
};
