const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, error: 'Password required' });
    }

    const correctPassword = process.env.DOCSHARE_PASSWORD;
    const secret = process.env.DOCSHARE_SECRET;

    console.log('DOCSHARE_PASSWORD set:', !!correctPassword);
    console.log('DOCSHARE_SECRET set:', !!secret);

    if (!correctPassword || !secret) {
      return res.status(500).json({ success: false, error: 'Env vars missing' });
    }

    if (password !== correctPassword) {
      return res.status(401).json({ success: false, error: 'Incorrect password' });
    }

    const timestamp = Date.now().toString();
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(timestamp)
      .digest('hex');

    const token = `${timestamp}:${hmac}`;

    return res.status(200).json({ success: true, token });

  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};
