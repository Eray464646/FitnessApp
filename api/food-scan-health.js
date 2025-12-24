// Health check endpoint for food scanning API
// Tests if Gemini API key is configured and accessible
//
// Platform Compatibility:
// - Vercel: Supports CommonJS (module.exports)
// - Netlify: Supports CommonJS (module.exports)
// - AWS Lambda: Supports CommonJS (module.exports)

module.exports = async (req, res) => {
  // Enable CORS for frontend requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if API key is configured
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(200).json({
        status: 'error',
        configured: false,
        message: 'API-Schlüssel nicht konfiguriert',
        details: 'Bitte GEMINI_API_KEY als Environment Variable setzen'
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

    // Optional: Test API connectivity with a minimal request
    // This is a lightweight check that doesn't consume quota significantly
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
      
      let message = 'API-Verbindung fehlgeschlagen';
      let details = 'Unbekannter Fehler';
      
      if (testResponse.status === 403) {
        message = 'API-Authentifizierung fehlgeschlagen';
        details = 'Bitte API-Schlüssel überprüfen';
      } else if (testResponse.status === 429) {
        message = 'API-Limit erreicht';
        details = 'Quotenbegrenzung überschritten';
      } else if (testResponse.status === 400) {
        message = 'Ungültige API-Anfrage';
        details = 'Modell-Endpunkt nicht erreichbar';
      }
      
      return res.status(200).json({
        status: 'error',
        configured: true,
        reachable: false,
        message: message,
        details: details,
        apiStatus: testResponse.status
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
