/* ============================================================
   /api/auth.js
   Vercel Serverless Function — Password Check

   This function receives a password from the frontend,
   compares it to the one stored in environment variables,
   and returns a simple token if it matches.

   HOW TO CALL:
     POST /api/auth
     Body: { "password": "your-password" }

   ENV VARS NEEDED:
     DOCSHARE_PASSWORD  — the shared password
     DOCSHARE_SECRET    — a random string used to "sign" the token
                          (generate with: openssl rand -hex 32)
============================================================ */

// Node.js built-in — used to create a simple HMAC token
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;

  // Basic validation
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }

  // Compare submitted password with the one in environment variables
  // process.env reads from .env.local (local dev) or Vercel dashboard (production)
  const correctPassword = process.env.DOCSHARE_PASSWORD;
  const secret          = process.env.DOCSHARE_SECRET;

  if (!correctPassword || !secret) {
    console.error('Missing environment variables: DOCSHARE_PASSWORD or DOCSHARE_SECRET');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  if (password !== correctPassword) {
    // Wrong password — don't give any hints
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  }

  // Correct! Generate a simple HMAC token.
  // This is NOT a full JWT — just a signed string good enough for this use-case.
  // Format: timestamp:hmac
  const timestamp = Date.now().toString();
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(timestamp)
    .digest('hex');

  const token = `${timestamp}:${hmac}`;

  return res.status(200).json({ success: true, token });
};
