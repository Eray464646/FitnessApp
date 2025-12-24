// Health check endpoint for training plan generation API

module.exports = async (req, res) => {
  // Enable CORS
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

  // Check if API key is configured
  const isConfigured = !!process.env.GEMINI_API_KEY;

  return res.status(200).json({
    ok: true,
    configured: isConfigured,
    service: 'training-plan',
    timestamp: new Date().toISOString()
  });
};
