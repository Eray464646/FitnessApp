// Health check endpoint for training plan generation API

const ALLOWED_ORIGINS = [
  'https://eray464646.github.io',
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1:8000'
];

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.referer || '';
  
  // Enable CORS for allowed origins only - consistent with main endpoint
  const isAllowed = ALLOWED_ORIGINS.some(allowed => {
    const checkOrigin = origin.startsWith('http') ? origin : '';
    return checkOrigin === allowed;
  });
  
  if (isAllowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  
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

  // Check if API key is configured
  const isConfigured = !!process.env.GEMINI_API_KEY;

  return res.status(200).json({
    ok: true,
    configured: isConfigured,
    service: 'training-plan',
    timestamp: new Date().toISOString()
  });
};
