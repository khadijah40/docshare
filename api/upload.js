/* ============================================================
   /api/upload.js
   Vercel Serverless Function — File Upload

   Flow:
   1. Receive multipart form data (the file)
   2. Verify auth token
   3. Upload file to Cloudinary
   4. Save file metadata (name, url, date) to MongoDB
   5. Return success

   ENV VARS NEEDED:
     CLOUDINARY_CLOUD_NAME
     CLOUDINARY_API_KEY
     CLOUDINARY_API_SECRET
     MONGODB_URI
     DOCSHARE_SECRET
============================================================ */

// formidable parses multipart/form-data (file uploads) in serverless functions
const formidable = require('formidable');
const fs         = require('fs');
const path       = require('path');
const https      = require('https');
const crypto     = require('crypto');

const { verifyToken, getFilesCollection } = require('./_utils');

/* ──────────────────────────────────────────────
   Tell Vercel NOT to parse the body automatically.
   We need to handle the raw multipart stream ourselves
   so formidable can parse the uploaded file.
────────────────────────────────────────────── */
module.exports.config = {
  api: { bodyParser: false },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Check auth token ──
  const token = req.headers['x-auth-token'];
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── 2. Parse the multipart form data ──
  let file;
  try {
    file = await parseForm(req);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to parse file: ' + err.message });
  }

  // ── 3. Validate file type ──
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  ];
  if (!allowedTypes.includes(file.mimetype)) {
    return res.status(400).json({ error: 'File type not allowed' });
  }

  // ── 4. Upload to Cloudinary ──
  let cloudinaryResult;
  try {
    cloudinaryResult = await uploadToCloudinary(file);
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    return res.status(500).json({ error: 'Failed to upload to storage' });
  }

  // ── 5. Save metadata to MongoDB ──
  try {
    const collection = await getFilesCollection();
    await collection.insertOne({
      fileName:   file.originalFilename || file.newFilename,
      fileUrl:    cloudinaryResult.secure_url,  // HTTPS URL from Cloudinary
      publicId:   cloudinaryResult.public_id,   // Cloudinary ID (used for deletion)
      uploadedAt: new Date(),
    });
  } catch (err) {
    console.error('MongoDB insert error:', err);
    return res.status(500).json({ error: 'Failed to save file record' });
  }

  return res.status(200).json({ success: true });
};


/* ────────────────────────────────────────────
   HELPER: Parse multipart form data
   Returns the first file from the upload.
──────────────────────────────────────────── */
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10 MB
      keepExtensions: true,
    });

    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);

      // 'file' is the field name used in app.js: formData.append('file', ...)
      const uploaded = files.file;
      if (!uploaded) return reject(new Error('No file received'));

      // formidable v3 returns arrays
      const fileObj = Array.isArray(uploaded) ? uploaded[0] : uploaded;
      resolve(fileObj);
    });
  });
}


/* ────────────────────────────────────────────
   HELPER: Upload a file to Cloudinary
   Uses the Cloudinary REST API directly (no SDK needed).
   Returns the Cloudinary response object.
──────────────────────────────────────────── */
async function uploadToCloudinary(file) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Missing Cloudinary environment variables');
  }

  // Read file bytes from temp path
  const fileBuffer = fs.readFileSync(file.filepath);
  const base64File = fileBuffer.toString('base64');
  const dataUri    = `data:${file.mimetype};base64,${base64File}`;

  // Build upload signature (required for authenticated uploads)
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder    = 'docshare';

  // Parameters to sign (must be sorted alphabetically)
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash('sha256')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  // Build the POST body
  const body = new URLSearchParams({
    file:      dataUri,
    timestamp,
    signature,
    api_key:   apiKey,
    folder,
    // Preserve original filename as the public display name
    use_filename:        'true',
    unique_filename:     'true',
    resource_type:       'auto', // auto-detect image vs raw (pdf, docx, etc.)
  });

  // POST to Cloudinary upload endpoint
  return new Promise((resolve, reject) => {
    const postData = body.toString();
    const options  = {
      hostname: 'api.cloudinary.com',
      path:     `/v1_1/${cloudName}/auto/upload`,
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
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed);
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
