// Test endpoint for food scanning API
// Minimal test to verify API key works without consuming much quota
//
// Platform Compatibility:
// - Vercel: Supports CommonJS (module.exports)
// - Netlify: Supports CommonJS (module.exports)
// - AWS Lambda: Supports CommonJS (module.exports)

const ALLOWED_ORIGINS = [
  'https://eray464646.github.io',
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1:8000'
];

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.referer || '';
  
  // Enable CORS for allowed origins only
  if (ALLOWED_ORIGINS.some(allowed => origin.includes(allowed) || allowed === '*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || ALLOWED_ORIGINS[0]);
  } else {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Accept both GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get API key from request body (POST) or environment (GET)
    let apiKey;
    
    if (req.method === 'POST' && req.body && req.body.key) {
      apiKey = req.body.key;
    } else {
      apiKey = process.env.GEMINI_API_KEY;
    }
    
    if (!apiKey) {
      return res.status(200).json({
        status: 'error',
        configured: false,
        message: 'API-Schlüssel nicht konfiguriert',
        details: 'Bitte GEMINI_API_KEY als Environment Variable setzen oder im Request übergeben'
      });
    }

    // Verify API key format (basic validation)
    if (!apiKey.startsWith('AIza')) {
      return res.status(200).json({
        status: 'warning',
        configured: true,
        message: 'API-Schlüssel hat unerwartetes Format',
        details: 'Gemini API-Schlüssel sollten mit "AIza" beginnen'
      });
    }

    // Test API connectivity with a minimal request
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const testResponse = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: "Test"
          }]
        }],
        generationConfig: {
          maxOutputTokens: 10
        }
      })
    });

    if (!testResponse.ok) {
      const errorData = await testResponse.json().catch(() => ({}));
      const status = testResponse.status;
      
      let message = 'API-Verbindung fehlgeschlagen';
      let details = 'Unbekannter Fehler';
      
      if (status === 403 || status === 401) {
        message = 'API-Authentifizierung fehlgeschlagen';
        details = 'Bitte API-Schlüssel überprüfen';
      } else if (status === 429) {
        message = 'API-Limit erreicht';
        details = 'Quotenbegrenzung überschritten (aber Key ist gültig)';
        // Still return success since the key is valid
        return res.status(200).json({
          status: 'ok',
          configured: true,
          reachable: true,
          rateLimited: true,
          message: message,
          details: details
        });
      } else if (status === 400) {
        message = 'Ungültige API-Anfrage';
        details = 'Modell-Endpunkt nicht erreichbar';
      }
      
      return res.status(200).json({
        status: 'error',
        configured: true,
        reachable: false,
        message: message,
        details: details,
        apiStatus: status
      });
    }

    // API is working correctly
    return res.status(200).json({
      status: 'ok',
      configured: true,
      reachable: true,
      message: 'Food Scanner betriebsbereit',
      details: 'Gemini API verbunden und funktionsfähig'
    });

  } catch (error) {
    console.error('Health check error:', error);
    return res.status(200).json({
      status: 'error',
      configured: false,
      message: 'Fehler beim Überprüfen der Konfiguration',
      details: error.message
    });
  }
};
