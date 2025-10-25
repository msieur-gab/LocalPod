/**
 * Netlify Function: Generate Presigned URLs for S3/Filebase
 *
 * Endpoint: /.netlify/functions/presigned-url
 * Method: POST
 *
 * Request Body:
 * {
 *   "ucan": "eyJ...",                    // UCAN token
 *   "resourcePath": "simple-service/123.json",
 *   "method": "PUT" | "GET",
 *   "userPublicKey": "z8mwa..."
 * }
 *
 * Response:
 * {
 *   "presignedUrl": {
 *     "url": "https://s3.filebase.com/...",
 *     "method": "PUT",
 *     "expiresAt": "2025-10-24T...",
 *     "headers": { "Content-Type": "application/json" }
 *   }
 * }
 */

// Import crypto for AWS signature
const crypto = require('crypto');

// AWS Signature V4 helpers
const encoder = new TextEncoder();

const toUint8Array = (input) => {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof input === 'string') return encoder.encode(input);
  throw new Error('Unsupported payload type');
};

const bufferToHex = (buffer) => {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const sha256Hex = async (data) => {
  const hash = await crypto.subtle.digest('SHA-256', toUint8Array(data));
  return bufferToHex(hash);
};

const hmac = async (key, data) => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return new Uint8Array(signature);
};

const getSignatureKey = async (secretKey, dateStamp, region, service) => {
  const kDate = await hmac(encoder.encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  return kSigning;
};

const canonicalUri = (bucket, key) => {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/${bucket}/${encodedKey}`;
};

// Generate presigned URL
async function generatePresignedUrl(key, method, accessKey, secretKey, bucket, region = 'us-east-1') {
  const host = 's3.filebase.com';
  const baseUrl = `https://${host}`;

  // Calculate expiration
  const now = new Date();
  const expiresIn = 3600; // 1 hour
  const expirationDate = new Date(now.getTime() + expiresIn * 1000);
  const expiresAt = expirationDate.toISOString();

  // AWS4 signature date format
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // Build canonical request
  const uri = canonicalUri(bucket, key);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${accessKey}/${credentialScope}`;

  // Query parameters (alphabetically sorted)
  const queryParams = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiresIn}`,
    `X-Amz-SignedHeaders=host`
  ].join('&');

  // Canonical request for presigned URL
  const canonicalRequest = [
    method,
    uri,
    queryParams,
    `host:${host}`,
    '',
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');

  // String to sign
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(encoder.encode(canonicalRequest))
  ].join('\n');

  // Calculate signature
  const signingKey = await getSignatureKey(secretKey, dateStamp, region, 's3');
  const signature = bufferToHex(await hmac(signingKey, stringToSign));

  // Build final presigned URL
  const presignedUrl = `${baseUrl}${uri}?${queryParams}&X-Amz-Signature=${signature}`;

  const result = {
    url: presignedUrl,
    method: method,
    expiresAt
  };

  if (method === 'PUT') {
    result.headers = {
      'Content-Type': 'application/json'
    };
  }

  return result;
}

// Simple UCAN validation (you can expand this)
function validateUCAN(ucan) {
  if (!ucan || typeof ucan !== 'string') {
    return { valid: false, error: 'Missing or invalid UCAN token' };
  }

  try {
    // Parse JWT
    const parts = ucan.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid UCAN format' };
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'UCAN token expired' };
    }

    // Check not before
    if (payload.nbf && payload.nbf > now) {
      return { valid: false, error: 'UCAN token not yet valid' };
    }

    // TODO: Verify signature with issuer's public key
    // For now, we'll trust it if the structure is valid

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: `UCAN validation failed: ${error.message}` };
  }
}

// Netlify Function Handler
exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    const { ucan, resourcePath, method, userPublicKey } = JSON.parse(event.body);

    // Validate required fields
    if (!ucan || !resourcePath || !method || !userPublicKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required fields: ucan, resourcePath, method, userPublicKey'
        })
      };
    }

    // Validate UCAN token
    const validation = validateUCAN(ucan);
    if (!validation.valid) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: validation.error })
      };
    }

    // Get credentials from environment variables
    const accessKey = process.env.FILEBASE_ACCESS_KEY;
    const secretKey = process.env.FILEBASE_SECRET_KEY;
    const bucket = process.env.FILEBASE_BUCKET || 'markdown-collab';

    if (!accessKey || !secretKey) {
      console.error('Missing Filebase credentials in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Generate presigned URL
    const s3Path = `${userPublicKey}/${resourcePath}`;
    const presignedUrl = await generatePresignedUrl(
      s3Path,
      method,
      accessKey,
      secretKey,
      bucket
    );

    console.log(`Generated ${method} presigned URL for: ${s3Path}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ presignedUrl })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
