const { IncomingForm } = require('formidable');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { verifyToken, getFilesCollection } = require('./_utils');

module.exports.config = {
  api: { bodyParser: false },
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-auth-token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers['x-auth-token'];
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  let file;
  try {
    file = await parseForm(req);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to parse file: ' + err.message });
  }

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

  let cloudinaryResult;
  try {
    cloudinaryResult = await uploadToCloudinary(file);
  } catch (err) {
    console.error('Cloudinary error:', err);
    return res.status(500).json({ error: 'Failed to upload to storage' });
  }

  try {
    const collection = await getFilesCollection();
    await collection.insertOne({
      fileName: file.originalFilename || file.newFilename,
      fileUrl: cloudinaryResult.secure_url,
      publicId: cloudinaryResult.public_id,
      uploadedAt: new Date(),
    });
  } catch (err) {
    console.error('MongoDB error:', err);
    return res.status(500).json({ error: 'Failed to save file record' });
  }

  return res.status(200).json({ success: true });
};

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      maxFileSize: 10 * 1024 * 1024,
      keepExtensions: true,
    });

    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      const uploaded = files.file;
      if (!uploaded) return reject(new Error('No file received'));
      const fileObj = Array.isArray(uploaded) ? uploaded[0] : uploaded;
      resolve(fileObj);
    });
  });
}

async function uploadToCloudinary(file) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Missing Cloudinary env vars');
  }

  const fileBuffer = fs.readFileSync(file.filepath);
  const base64File = fileBuffer.toString('base64');
  const dataUri = `data:${file.mimetype};base64,${base64File}`;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = 'docshare';

  // ✅ FIX 1: params must be alphabetically sorted
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;

  // ✅ FIX 2: Cloudinary requires SHA-1, not SHA-256
  const signature = crypto
    .createHash('sha1')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  // ✅ FIX 3: resource_type removed from body (it belongs in the URL path only)
  const body = new URLSearchParams({
    file: dataUri,
    timestamp,
    signature,
    api_key: apiKey,
    folder,
    use_filename: 'true',
    unique_filename: 'true',
  });

  return new Promise((resolve, reject) => {
    const postData = body.toString();
    const options = {
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${cloudName}/auto/upload`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
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
