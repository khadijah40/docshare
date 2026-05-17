/* ============================================================
   /api/_utils.js
   Shared helpers used by all API routes.
   (Files starting with _ are NOT treated as routes by Vercel.)
============================================================ */

const crypto   = require('crypto');
const { MongoClient } = require('mongodb');

/* ──────────────────────────────────────────────
   TOKEN VERIFICATION
   Checks the token from the x-auth-token header.
────────────────────────────────────────────── */

/**
 * Verifies the HMAC token issued by /api/auth.
 * Returns true if valid, false otherwise.
 *
 * @param {string} token - "timestamp:hmac" string from the header
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;

  const secret = process.env.DOCSHARE_SECRET;
  if (!secret) return false;

  const [timestamp, hmac] = token.split(':');
  if (!timestamp || !hmac) return false;

  // Recompute the HMAC and compare (timing-safe comparison prevents timing attacks)
  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac,     'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

/* ──────────────────────────────────────────────
   MONGODB CONNECTION
   Reuses an existing connection when possible
   (important for serverless — connections are expensive).
────────────────────────────────────────────── */

// Cached connection (persists across warm function invocations)
let cachedClient = null;

/**
 * Returns a connected MongoDB client.
 * Caches the connection so we don't reconnect on every request.
 */
async function getMongoClient() {
  if (cachedClient) return cachedClient;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGODB_URI environment variable');

  const client = new MongoClient(uri);
  await client.connect();
  cachedClient = client;
  return client;
}

/**
 * Convenience: returns the "docshare" database's "files" collection.
 */
async function getFilesCollection() {
  const client = await getMongoClient();
  return client.db('docshare').collection('files');
}

module.exports = { verifyToken, getFilesCollection };
