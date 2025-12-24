// Serverless function for food scanning using Gemini Vision API
// This keeps API keys secure on the server side
//
// Platform Compatibility:
// - Vercel: Supports CommonJS (module.exports) - RECOMMENDED
// - Netlify: Supports CommonJS (module.exports)
// - AWS Lambda: Supports CommonJS (module.exports)
//
// Note: Using CommonJS syntax for maximum compatibility across serverless platforms

// Configuration constants
const CONFIDENCE_THRESHOLD = 60;  // Minimum confidence percentage to accept detection

module.exports = async (req, res) => {
  // Enable CORS for frontend requests
  res.setHeader('Access-Control-Allow-Origin', '*');
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
    // Get API key from environment variable (NEVER from frontend)
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('GEMINI_API_KEY not configured');
      return res.status(500).json({ 
        error: 'Server configuration error',
        detected: false,
        message: 'API key not configured on server'
      });
    }

    // Parse request body
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ 
        error: 'Missing image data',
        detected: false 
      });
    }

    // Extract base64 data and MIME type from data URL
    const matches = image.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ 
        error: 'Invalid image format',
        detected: false 
      });
    }

    const mimeType = matches[1] || 'image/jpeg';
    const base64Data = matches[2];

    console.log(`Processing food scan request, MIME: ${mimeType}, size: ${base64Data.length} bytes`);

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
            {
              text: "Analysiere dieses Bild und identifiziere alle Lebensmittel. Gib die Antwort als JSON zurück mit folgendem Format: {\"detected\": true/false, \"items\": [\"item1\", \"item2\"], \"label\": \"Hauptgericht Name\", \"confidence\": 0-100, \"calories\": Zahl, \"protein\": Zahl, \"carbs\": Zahl, \"fat\": Zahl, \"reasoning\": \"kurze Erklärung\"}. Wenn kein Essen erkennbar ist, setze detected auf false und gib eine hilfreiche Nachricht im reasoning-Feld. Schätze realistische Nährwerte für eine typische Portion. Antworte NUR mit dem JSON-Objekt, ohne zusätzlichen Text oder Markdown-Formatierung."
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.4,
          topK: 32,
          topP: 1,
          maxOutputTokens: 500
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}));
      console.error('Gemini API error:', {
        status: geminiResponse.status,
        statusText: geminiResponse.statusText,
        error: errorData
      });
      
      // Handle specific error cases with detailed messages
      let errorMessage = 'API request failed';
      let userMessage = 'Fehler bei der Bilderkennung';
      
      if (geminiResponse.status === 400) {
        errorMessage = 'Invalid API request - check payload format';
        userMessage = 'Ungültiges Bildformat';
      } else if (geminiResponse.status === 429) {
        errorMessage = 'API rate limit exceeded';
        userMessage = 'API-Limit erreicht. Bitte später erneut versuchen.';
      } else if (geminiResponse.status === 403) {
        errorMessage = 'API authentication failed - check API key';
        userMessage = 'API-Authentifizierung fehlgeschlagen';
      } else if (geminiResponse.status === 404) {
        errorMessage = 'API endpoint not found - check model name';
        userMessage = 'API-Endpunkt nicht gefunden';
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        message: userMessage,
        detected: false,
        apiStatus: geminiResponse.status
      });
    }

    const data = await geminiResponse.json();
    
    // Extract text from Gemini response
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('Invalid Gemini response structure:', data);
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
          return res.status(500).json({ 
            error: 'Could not parse API response',
            detected: false 
          });
        }
      }
    }

    // Apply confidence gating using defined threshold
    if (result.detected && result.confidence < CONFIDENCE_THRESHOLD) {
      console.log(`Low confidence (${result.confidence}%), marking as uncertain`);
      result.detected = false;
      result.message = 'Unsicher – bitte bestätigen oder klareres Foto verwenden';
      result.lowConfidence = true;
    } else if (!result.detected && !result.message) {
      // Ensure there's a message when no food is detected
      result.message = result.reasoning || 'Kein Essen erkannt';
    }

    // Ensure all required fields are present
    if (result.detected) {
      result.label = result.label || 'Unbekanntes Lebensmittel';
      result.items = result.items || [result.label];
      result.calories = Math.round(result.calories || 0);
      result.protein = Math.round(result.protein || 0);
      result.carbs = Math.round(result.carbs || 0);
      result.fat = Math.round(result.fat || 0);
      result.confidence = Math.round(result.confidence || 70);
    }

    console.log('Processed result:', { 
      detected: result.detected, 
      label: result.label,
      confidence: result.confidence 
    });

    // Return structured response
    return res.status(200).json(result);

  } catch (error) {
    console.error('Food scan error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      detected: false,
      message: error.message 
    });
  }
};
