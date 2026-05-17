/* ============================================================
   /api/files.js
   Vercel Serverless Function — List Files

   Returns all uploaded file records from MongoDB,
   sorted newest first.

   HOW TO CALL:
     GET /api/files
     Header: x-auth-token: <token>
============================================================ */

const { verifyToken, getFilesCollection } = require('./_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify the auth token
  const token = req.headers['x-auth-token'];
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const collection = await getFilesCollection();

    // Fetch all files, newest first
    const files = await collection
      .find({})
      .sort({ uploadedAt: -1 }) // -1 = descending = newest first
      .toArray();

    return res.status(200).json({ success: true, files });

  } catch (err) {
    console.error('MongoDB fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch files' });
  }
};
