// Serverless function for AI-based training plan generation using Gemini API
// This keeps API keys secure on the server side

// Configuration constants
const ALLOWED_ORIGINS = [
  'https://eray464646.github.io',
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1:8000'
];

// Simple rate limiting (in-memory, resets on function cold start)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20; // Max 20 requests per minute per IP

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
        message: 'Zu viele Anfragen. Bitte warte eine Minute.'
      });
    }

    // Get API key from environment OR from request body
    const { key: userProvidedKey, age, gender, height, weight, level, goal, frequency, equipment } = req.body;
    
    let apiKey = userProvidedKey || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('No API key provided');
      return res.status(400).json({ 
        error: 'API key required',
        message: 'Bitte gib einen API Key an oder konfiguriere den Server'
      });
    }

    // Validate API key format (basic check)
    if (!apiKey.startsWith('AIza')) {
      return res.status(400).json({ 
        error: 'Invalid API key format',
        message: 'Ungültiges API Key Format'
      });
    }

    // Validate required parameters
    if (!age || !gender || !height || !weight || !level || !goal || !frequency || !equipment) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        message: 'Fehlende Parameter für Trainingsplan-Generierung'
      });
    }

    console.log(`Generating training plan for: age=${age}, gender=${gender}, goal=${goal}, level=${level}, frequency=${frequency}`);

    // Create AI prompt for training plan generation
    const prompt = `Du bist ein professioneller Fitnesstrainer und erstellst individualisierte Trainingspläne.

NUTZERDATEN:
- Alter: ${age} Jahre
- Geschlecht: ${gender}
- Größe: ${height} cm
- Gewicht: ${weight} kg
- Trainingslevel: ${level}
- Ziel: ${goal}
- Trainingsfrequenz: ${frequency}x pro Woche
- Verfügbare Geräte: ${equipment}

AUFGABE:
Erstelle einen strukturierten, realistischen Trainingsplan der GENAU auf diese Person zugeschnitten ist.

WICHTIGE ANFORDERUNGEN:
1. Berücksichtige das Trainingslevel (Anfänger brauchen einfachere Übungen, weniger Volumen)
2. Passe die Übungen an die verfügbaren Geräte an
3. Das Ziel muss sich im Plan widerspiegeln (z.B. mehr Volumen für Muskelaufbau, mehr Intensität/Intervalle für Fettabbau)
4. Die Anzahl der Trainingstage muss EXAKT ${frequency} sein
5. Jede Übung MUSS konkrete Sätze und Wiederholungen enthalten

AUSGABEFORMAT (NUR JSON, kein Markdown):
{
  "days": [
    {
      "day": "Montag",
      "focus": "Ganzkörper",
      "exercises": [
        {
          "name": "Kniebeugen",
          "sets": 4,
          "reps": "8-10",
          "rest": 90
        },
        {
          "name": "Liegestütze",
          "sets": 3,
          "reps": "12-15",
          "rest": 60
        }
      ]
    }
  ],
  "notes": "Kurzer Hinweis zur Progression oder Technik"
}

BEISPIEL-LOGIK:
- Anfänger: 2-3 Sätze, höhere Wiederholungen (12-15), längere Pausen (90-120s)
- Mittel: 3-4 Sätze, mittlere Wiederholungen (8-12), mittlere Pausen (60-90s)
- Fortgeschritten: 4-5 Sätze, variable Wiederholungen (6-12), kürzere Pausen (45-75s)

ÜBUNGSAUSWAHL:
- Körpergewicht: Kniebeugen, Liegestütze, Ausfallschritte, Planks, Bulgarian Split Squats, Pike Push-ups, etc.
- Kurzhanteln: Goblet Squats, Kurzhantel-Bankdrücken, Rudern, Schulterdrücken, Rumänisches Kreuzheben, etc.
- Studio: Kniebeugen mit Langhantel, Bankdrücken, Kreuzheben, Klimmzüge, Rudern am Kabel, Beinpresse, etc.

Antworte NUR mit dem JSON-Objekt, kein zusätzlicher Text!`;

    // Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2000
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}));
      const status = geminiResponse.status;
      
      console.error('Gemini API error:', {
        status: status,
        statusText: geminiResponse.statusText,
        error: errorData.error?.message?.substring(0, 100)
      });
      
      let errorMessage = 'API request failed';
      let userMessage = 'Fehler bei der Trainingsplan-Generierung';
      
      if (status === 400) {
        errorMessage = 'Invalid API request';
        userMessage = 'Ungültige Anfrage';
      } else if (status === 429) {
        errorMessage = 'API rate limit exceeded';
        userMessage = 'API-Limit erreicht. Bitte später erneut versuchen.';
      } else if (status === 403 || status === 401) {
        errorMessage = 'API authentication failed';
        userMessage = 'API-Authentifizierung fehlgeschlagen';
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        message: userMessage,
        apiStatus: status
      });
    }

    const data = await geminiResponse.json();
    
    // Extract text from Gemini response
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('Invalid Gemini response structure:', JSON.stringify(data).substring(0, 200));
      return res.status(500).json({ 
        error: 'Invalid API response',
        message: 'Ungültige API-Antwort'
      });
    }
    
    const content = data.candidates[0].content.parts[0].text;
    console.log('Gemini response text:', content.substring(0, 300));

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
            error: 'Could not parse AI response',
            message: 'KI-Antwort konnte nicht verarbeitet werden',
            rawResponse: content.substring(0, 500)
          });
        }
      }
    }

    // Validate result structure
    if (!result.days || !Array.isArray(result.days) || result.days.length === 0) {
      console.error('Invalid training plan structure:', result);
      return res.status(500).json({ 
        error: 'Invalid plan structure',
        message: 'Ungültiger Trainingsplan'
      });
    }

    // Validate each day has required fields
    for (const day of result.days) {
      if (!day.day || !day.focus || !day.exercises || !Array.isArray(day.exercises)) {
        console.error('Invalid day structure:', day);
        return res.status(500).json({ 
          error: 'Invalid day structure',
          message: 'Ungültige Tagesstruktur im Plan'
        });
      }
      
      // Validate each exercise has required fields
      for (const exercise of day.exercises) {
        if (!exercise.name || !exercise.sets || !exercise.reps) {
          console.error('Invalid exercise structure:', exercise);
          return res.status(500).json({ 
            error: 'Invalid exercise structure',
            message: 'Ungültige Übungsstruktur im Plan'
          });
        }
      }
    }

    console.log('Successfully generated training plan with', result.days.length, 'days');

    // Return the validated training plan
    return res.status(200).json({
      success: true,
      plan: result,
      metadata: {
        age,
        gender,
        height,
        weight,
        level,
        goal,
        frequency,
        equipment
      }
    });

  } catch (error) {
    console.error('Training plan generation error:', error.message);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'Interner Serverfehler'
    });
  }
};
