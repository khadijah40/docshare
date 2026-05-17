/* ============================================================
   /api/delete.js
   Vercel Serverless Function — Delete a File

   Flow:
   1. Verify auth token
   2. Find the file record in MongoDB (to get Cloudinary publicId)
   3. Delete from Cloudinary
   4. Delete from MongoDB
   5. Return success

   HOW TO CALL:
     DELETE /api/delete
     Header: x-auth-token: <token>
     Body:   { "fileId": "<mongodb _id>" }
============================================================ */

const https  = require('https');
const crypto = require('crypto');

// MongoDB helper from ObjectId
const { MongoClient, ObjectId } = require('mongodb');
const { verifyToken, getFilesCollection } = require('./_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify auth token
  const token = req.headers['x-auth-token'];
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { fileId } = req.body;

  if (!fileId || typeof fileId !== 'string') {
    return res.status(400).json({ error: 'fileId is required' });
  }

  // Validate that fileId is a valid MongoDB ObjectId format
  if (!ObjectId.isValid(fileId)) {
    return res.status(400).json({ error: 'Invalid fileId' });
  }

  try {
    const collection = await getFilesCollection();

    // ── 1. Find the file record ──
    const fileRecord = await collection.findOne({ _id: new ObjectId(fileId) });
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found' });
    }

    // ── 2. Delete from Cloudinary ──
    // (If Cloudinary deletion fails, we still proceed to remove from MongoDB
    //  so the UI stays consistent. The file may linger on Cloudinary but
    //  users won't see it anymore.)
    if (fileRecord.publicId) {
      try {
        await deleteFromCloudinary(fileRecord.publicId);
      } catch (err) {
        console.error('Cloudinary delete warning:', err.message);
        // Non-fatal: continue with MongoDB deletion
      }
    }

    // ── 3. Delete from MongoDB ──
    await collection.deleteOne({ _id: new ObjectId(fileId) });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ error: 'Failed to delete file' });
  }
};


/* ────────────────────────────────────────────
   HELPER: Delete an asset from Cloudinary
   Uses the Cloudinary Destroy API.
──────────────────────────────────────────── */
async function deleteFromCloudinary(publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Build signature
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash('sha256')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp,
    signature,
    api_key:   apiKey,
  });

  return new Promise((resolve, reject) => {
    const postData = body.toString();
    const options  = {
      hostname: 'api.cloudinary.com',
      path:     `/v1_1/${cloudName}/auto/destroy`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.result === 'ok' || parsed.result === 'not found') {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error?.message || 'Cloudinary delete failed'));
          }
        } catch {
          reject(new Error('Invalid Cloudinary response'));
        }
      });
    });

    request.on('error', reject);
    request.write(postData);
    request.end();
  });
}
