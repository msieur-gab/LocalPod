# LocalPod Service Template - Implementation Roadmap

This roadmap outlines the complete implementation of a reference service that integrates with LocalPod for authentication and content publishing.

**Repository:** `LocalPod-Service-Template`
**Purpose:** Provide a complete, production-ready template for services that want to integrate LocalPod authentication and allow users to publish content to their own IPFS storage.

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│  Service Frontend (React/Vue/Vanilla)   │
│  - User interface                       │
│  - Content creation UI                  │
│  - Grant management                     │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│  Service Backend (Node.js/Express)      │
│  - Authentication endpoints             │
│  - Content index/feed                   │
│  - Grant verification                   │
└──────────────┬──────────────────────────┘
               ↓
        ┌─────────────┐
        │   Database  │
        │   (Index)   │
        └─────────────┘

               ↕ (DID Auth Flow)
               ↕ (Capability Grants)

┌─────────────────────────────────────────┐
│  LocalPod (User's Browser)              │
│  - SDK for signing                      │
│  - IPFS upload with credentials         │
│  - Grant issuance                       │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│  User's IPFS Storage (Filebase)         │
│  - Actual content data                  │
│  - User-owned and portable              │
└─────────────────────────────────────────┘
```

---

## Phase 1: Project Setup & Authentication

### 1.1 Repository Structure

```
LocalPod-Service-Template/
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   └── auth-callback.html       # OAuth-style callback
│   ├── src/
│   │   ├── components/
│   │   │   ├── LoginButton.js
│   │   │   ├── UserProfile.js
│   │   │   └── GrantManager.js
│   │   ├── services/
│   │   │   ├── auth.js              # LocalPod auth integration
│   │   │   └── api.js               # Backend API calls
│   │   └── App.js
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js              # /api/auth/*
│   │   │   ├── content.js           # /api/content/*
│   │   │   └── grants.js            # /api/grants/*
│   │   ├── middleware/
│   │   │   ├── auth.js              # JWT verification
│   │   │   └── grants.js            # Grant validation
│   │   ├── services/
│   │   │   ├── challengeService.js
│   │   │   ├── grantService.js
│   │   │   └── ipfsService.js       # IPFS interactions
│   │   └── server.js
│   ├── db/
│   │   └── schema.sql               # Content index schema
│   └── package.json
├── docs/
│   ├── INTEGRATION_GUIDE.md
│   └── API_REFERENCE.md
└── README.md
```

### 1.2 Authentication Flow Implementation

**Backend: Challenge Generation Endpoint**

```javascript
// backend/src/routes/auth.js
import express from 'express';
import crypto from 'crypto';

const router = express.Router();

// In-memory challenge storage (use Redis in production)
const challenges = new Map();

/**
 * POST /api/auth/challenge
 * Generate authentication challenge for LocalPod
 */
router.post('/challenge', (req, res) => {
  const challenge = crypto.randomBytes(32).toString('base64');
  const serviceDid = process.env.SERVICE_DID; // Your service's DID

  challenges.set(challenge, {
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });

  // Cleanup old challenges
  for (const [key, value] of challenges.entries()) {
    if (Date.now() > value.expiresAt) {
      challenges.delete(key);
    }
  }

  res.json({
    challenge,
    serviceDid,
    authUrl: `${process.env.LOCALPOD_AUTH_URL}?challenge=${encodeURIComponent(challenge)}&service_did=${encodeURIComponent(serviceDid)}&callback_url=${encodeURIComponent(process.env.SERVICE_CALLBACK_URL)}`,
  });
});

/**
 * POST /api/auth/verify
 * Verify signed challenge and create session
 *
 * Body: { did, signature, challenge, publicKey, encryptionPublicKey, issuedAt }
 */
router.post('/verify', async (req, res) => {
  const { did, signature, challenge, publicKey, encryptionPublicKey } = req.body;

  try {
    // 1. Validate challenge exists and not expired
    const challengeData = challenges.get(challenge);
    if (!challengeData) {
      return res.status(400).json({ error: 'Invalid or expired challenge' });
    }
    if (Date.now() > challengeData.expiresAt) {
      challenges.delete(challenge);
      return res.status(400).json({ error: 'Challenge expired' });
    }

    // 2. Verify signature (import ed25519 from @noble/curves)
    const { ed25519 } = await import('@noble/curves/ed25519');
    const publicKeyBytes = extractPublicKeyFromDid(did); // Helper function
    const signatureBytes = Buffer.from(signature, 'base64');
    const challengeBytes = Buffer.from(challenge, 'utf-8');

    const isValid = ed25519.verify(signatureBytes, challengeBytes, publicKeyBytes);
    if (!isValid) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    // 3. Delete used challenge
    challenges.delete(challenge);

    // 4. Create session JWT
    const jwt = await import('jsonwebtoken');
    const token = jwt.sign(
      {
        did,
        publicKey,
        encryptionPublicKey,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 5. Store user in database (or update if exists)
    await db.query(
      `INSERT INTO users (did, public_key, encryption_key, last_login)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (did) DO UPDATE SET last_login = NOW()`,
      [did, publicKey, encryptionPublicKey]
    );

    res.json({
      token,
      user: { did, publicKey, encryptionPublicKey },
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

export default router;
```

**Helper Function: Extract Public Key from DID**

```javascript
// backend/src/utils/did.js
import { base58 } from '@scure/base';

const MULTICODEC_ED25519_PUB = new Uint8Array([0xed, 0x01]);

export function extractPublicKeyFromDid(did) {
  if (!did || !did.startsWith('did:key:z')) {
    throw new Error('Invalid DID format');
  }

  const encoded = did.slice(9); // Remove 'did:key:z'
  const identifierBytes = base58.decode(encoded);

  if (
    identifierBytes.length !== MULTICODEC_ED25519_PUB.length + 32 ||
    identifierBytes[0] !== MULTICODEC_ED25519_PUB[0] ||
    identifierBytes[1] !== MULTICODEC_ED25519_PUB[1]
  ) {
    throw new Error('Unsupported DID key type (expected Ed25519)');
  }

  return identifierBytes.slice(MULTICODEC_ED25519_PUB.length);
}
```

**Frontend: Login Flow**

```javascript
// frontend/src/services/auth.js
class LocalPodAuth {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Initiate LocalPod authentication
   */
  async login() {
    // 1. Request challenge from service backend
    const response = await fetch(`${this.apiBaseUrl}/auth/challenge`, {
      method: 'POST',
    });
    const { authUrl } = await response.json();

    // 2. Redirect to LocalPod auth
    window.location.href = authUrl;
  }

  /**
   * Handle callback after LocalPod authentication
   * Called on auth-callback.html page
   */
  async handleCallback() {
    // LocalPod redirects back with signed payload in URL hash
    const hash = window.location.hash.slice(1);
    const payload = JSON.parse(decodeURIComponent(hash));

    // Send to backend for verification
    const response = await fetch(`${this.apiBaseUrl}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const { token, user } = await response.json();

    // Store token
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user', JSON.stringify(user));

    // Redirect to main app
    window.location.href = '/';
  }

  /**
   * Get current user from localStorage
   */
  getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  /**
   * Logout
   */
  logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    window.location.href = '/';
  }
}

export default new LocalPodAuth(process.env.REACT_APP_API_URL);
```

---

## Phase 2: Capability Grant Request Flow

### 2.1 Grant Request UI

**Frontend: Grant Request Component**

```javascript
// frontend/src/components/GrantManager.js
import React, { useState } from 'react';

function GrantManager({ userDid }) {
  const [grantStatus, setGrantStatus] = useState(null);

  const requestGrant = async () => {
    setGrantStatus('requesting');

    // Open LocalPod in popup to request grant
    const grantRequest = {
      serviceDid: process.env.REACT_APP_SERVICE_DID,
      resourceId: `ipfs://${userDid}/blog/*`,
      rights: ['write', 'read'],
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
    };

    // Encode request as URL params
    const params = new URLSearchParams({
      action: 'request_grant',
      service_did: grantRequest.serviceDid,
      resource_id: grantRequest.resourceId,
      rights: grantRequest.rights.join(','),
      expires_at: grantRequest.expiresAt,
      callback_url: `${window.location.origin}/grant-callback`,
    });

    // Open LocalPod grant issuance page
    const grantUrl = `${process.env.REACT_APP_LOCALPOD_URL}/grant.html?${params}`;

    // Open in popup
    const popup = window.open(grantUrl, 'LocalPod Grant', 'width=600,height=700');

    // Listen for grant response
    window.addEventListener('message', async (event) => {
      if (event.origin !== process.env.REACT_APP_LOCALPOD_URL) return;

      if (event.data.type === 'grant_issued') {
        const grant = event.data.grant;

        // Submit grant to service backend
        await fetch('/api/grants/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          },
          body: JSON.stringify({ grant }),
        });

        setGrantStatus('granted');
        popup.close();
      }
    });
  };

  return (
    <div className="grant-manager">
      {!grantStatus && (
        <button onClick={requestGrant}>
          Grant Upload Permission
        </button>
      )}
      {grantStatus === 'requesting' && <p>Waiting for grant...</p>}
      {grantStatus === 'granted' && <p>✅ Permission granted!</p>}
    </div>
  );
}

export default GrantManager;
```

### 2.2 Grant Storage & Validation

**Backend: Grant Management**

```javascript
// backend/src/routes/grants.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/grants/submit
 * Store capability grant from user
 */
router.post('/submit', authMiddleware, async (req, res) => {
  const { grant } = req.body;
  const userDid = req.user.did;

  try {
    // Validate grant structure
    if (!grant.signature || !grant.payload) {
      return res.status(400).json({ error: 'Invalid grant format' });
    }

    // Verify grant was issued by the authenticated user
    if (grant.payload.granterDid !== userDid) {
      return res.status(403).json({ error: 'Grant not issued by authenticated user' });
    }

    // Store grant in database
    await db.query(
      `INSERT INTO capability_grants (
        id, granter_did, subject_did, resource_id, rights,
        expires_at, signature, payload, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
      [
        grant.payload.id,
        grant.payload.granterDid,
        grant.payload.subjectDid,
        grant.payload.resourceId,
        grant.payload.rights,
        grant.payload.expiresAt,
        grant.signature,
        JSON.stringify(grant.payload),
      ]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Grant submission error:', error);
    res.status(500).json({ error: 'Failed to store grant' });
  }
});

/**
 * GET /api/grants/list
 * List grants for current user
 */
router.get('/list', authMiddleware, async (req, res) => {
  const userDid = req.user.did;

  const result = await db.query(
    `SELECT * FROM capability_grants
     WHERE granter_did = $1 AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC`,
    [userDid]
  );

  res.json({ grants: result.rows });
});

/**
 * POST /api/grants/revoke/:grantId
 * Revoke a capability grant
 */
router.post('/revoke/:grantId', authMiddleware, async (req, res) => {
  const { grantId } = req.params;
  const userDid = req.user.did;

  await db.query(
    `DELETE FROM capability_grants
     WHERE id = $1 AND granter_did = $2`,
    [grantId, userDid]
  );

  res.json({ success: true });
});

export default router;
```

**Grant Validation Middleware**

```javascript
// backend/src/middleware/grants.js
import { ed25519 } from '@noble/curves/ed25519';
import { extractPublicKeyFromDid } from '../utils/did.js';

export async function validateGrant(req, res, next) {
  const { grantId } = req.body;
  const userDid = req.user.did;

  try {
    // Fetch grant from database
    const result = await db.query(
      `SELECT * FROM capability_grants
       WHERE id = $1 AND granter_did = $2`,
      [grantId, userDid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Grant not found' });
    }

    const grant = result.rows[0];

    // Check expiration
    if (grant.expires_at && new Date(grant.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Grant expired' });
    }

    // Verify signature
    const publicKey = extractPublicKeyFromDid(grant.granter_did);
    const payloadStr = JSON.stringify(grant.payload);
    const payloadBytes = Buffer.from(payloadStr, 'utf-8');
    const signatureBytes = Buffer.from(grant.signature, 'base64');

    const isValid = ed25519.verify(signatureBytes, payloadBytes, publicKey);
    if (!isValid) {
      return res.status(403).json({ error: 'Invalid grant signature' });
    }

    // Attach grant to request
    req.grant = grant;
    next();
  } catch (error) {
    console.error('Grant validation error:', error);
    res.status(500).json({ error: 'Grant validation failed' });
  }
}
```

---

## Phase 3: Content Publishing with Grants

### 3.1 Content Creation Flow

**Frontend: Content Editor**

```javascript
// frontend/src/components/ContentEditor.js
import React, { useState } from 'react';
import api from '../services/api';

function ContentEditor({ userDid, onPublish }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [publishing, setPublishing] = useState(false);

  const handlePublish = async (e) => {
    e.preventDefault();
    setPublishing(true);

    try {
      // Create content payload
      const content = {
        title,
        body,
        author: userDid,
        timestamp: new Date().toISOString(),
        type: 'blog-post',
      };

      // Request LocalPod to upload to user's IPFS
      // This opens LocalPod SDK in popup or iframe
      const uploadRequest = {
        action: 'upload',
        path: `/blog/${Date.now()}.json`,
        data: content,
        grantId: localStorage.getItem('active_grant_id'),
      };

      // Open LocalPod upload interface
      const result = await window.localPodUpload(uploadRequest);

      // Submit content reference to service
      await api.post('/content/publish', {
        cid: result.cid,
        title,
        grantId: uploadRequest.grantId,
      });

      onPublish();
      setTitle('');
      setBody('');
    } catch (error) {
      console.error('Publish error:', error);
      alert('Failed to publish: ' + error.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <form onSubmit={handlePublish}>
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <textarea
        placeholder="Write your post..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <button type="submit" disabled={publishing}>
        {publishing ? 'Publishing...' : 'Publish to My IPFS'}
      </button>
    </form>
  );
}

export default ContentEditor;
```

### 3.2 Backend Content Index

**Backend: Content Management**

```javascript
// backend/src/routes/content.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { validateGrant } from '../middleware/grants.js';

const router = express.Router();

/**
 * POST /api/content/publish
 * Index published content (CID + metadata)
 */
router.post('/publish', authMiddleware, async (req, res) => {
  const { cid, title, grantId } = req.body;
  const userDid = req.user.did;

  try {
    // Verify grant allows write to this resource
    const grant = await db.query(
      `SELECT * FROM capability_grants
       WHERE id = $1 AND granter_did = $2
       AND 'write' = ANY(rights)
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [grantId, userDid]
    );

    if (grant.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid or expired grant' });
    }

    // Store content reference
    const result = await db.query(
      `INSERT INTO content (
        author_did, cid, title, grant_id, published_at
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING id`,
      [userDid, cid, title, grantId]
    );

    res.json({
      success: true,
      contentId: result.rows[0].id,
      cid,
    });
  } catch (error) {
    console.error('Content publish error:', error);
    res.status(500).json({ error: 'Failed to publish content' });
  }
});

/**
 * GET /api/content/feed
 * Get public content feed
 */
router.get('/feed', async (req, res) => {
  const { limit = 20, offset = 0 } = req.query;

  const result = await db.query(
    `SELECT c.*, u.did as author_did
     FROM content c
     JOIN users u ON c.author_did = u.did
     ORDER BY c.published_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  res.json({ posts: result.rows });
});

/**
 * GET /api/content/:cid
 * Fetch content from IPFS
 */
router.get('/:cid', async (req, res) => {
  const { cid } = req.params;

  try {
    // Fetch from IPFS gateway
    const ipfsGateway = process.env.IPFS_GATEWAY || 'https://gateway.filebase.io/ipfs';
    const response = await fetch(`${ipfsGateway}/${cid}`);
    const content = await response.json();

    res.json(content);
  } catch (error) {
    console.error('IPFS fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

/**
 * GET /api/content/user/:did
 * Get all content by a specific user
 */
router.get('/user/:did', async (req, res) => {
  const { did } = req.params;

  const result = await db.query(
    `SELECT * FROM content
     WHERE author_did = $1
     ORDER BY published_at DESC`,
    [did]
  );

  res.json({ posts: result.rows });
});

export default router;
```

### 3.3 Database Schema

```sql
-- backend/db/schema.sql

CREATE TABLE users (
  did VARCHAR(255) PRIMARY KEY,
  public_key VARCHAR(255) NOT NULL,
  encryption_key VARCHAR(255),
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE capability_grants (
  id VARCHAR(255) PRIMARY KEY,
  granter_did VARCHAR(255) NOT NULL REFERENCES users(did),
  subject_did VARCHAR(255) NOT NULL,
  resource_id TEXT NOT NULL,
  rights TEXT[] NOT NULL,
  expires_at TIMESTAMP,
  signature TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE content (
  id SERIAL PRIMARY KEY,
  author_did VARCHAR(255) NOT NULL REFERENCES users(did),
  cid VARCHAR(255) NOT NULL,
  title TEXT NOT NULL,
  grant_id VARCHAR(255) REFERENCES capability_grants(id),
  published_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

CREATE INDEX idx_content_author ON content(author_did);
CREATE INDEX idx_content_published ON content(published_at DESC);
CREATE INDEX idx_grants_granter ON capability_grants(granter_did);
CREATE INDEX idx_grants_expires ON capability_grants(expires_at);
```

---

## Phase 4: LocalPod Upload Interface

### 4.1 LocalPod Grant Issuance Page

**Create in LocalPod repo: `grant.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Grant Permission - LocalPod</title>
</head>
<body>
  <h1>Grant Permission Request</h1>
  <div id="grant-request"></div>
  <button id="approve-btn">Approve & Issue Grant</button>
  <button id="deny-btn">Deny</button>

  <script type="module">
    import { IdentityPlatform } from './sdk/index.js';

    const platform = new IdentityPlatform();
    await platform.init();

    // Parse grant request from URL
    const params = new URLSearchParams(window.location.search);
    const grantRequest = {
      serviceDid: params.get('service_did'),
      resourceId: params.get('resource_id'),
      rights: params.get('rights').split(','),
      expiresAt: params.get('expires_at'),
      callbackUrl: params.get('callback_url'),
    };

    // Display request
    document.getElementById('grant-request').innerHTML = `
      <p>Service: <code>${grantRequest.serviceDid}</code></p>
      <p>Resource: <code>${grantRequest.resourceId}</code></p>
      <p>Rights: ${grantRequest.rights.join(', ')}</p>
      <p>Expires: ${new Date(grantRequest.expiresAt).toLocaleString()}</p>
    `;

    // Approve handler
    document.getElementById('approve-btn').addEventListener('click', async () => {
      const identity = platform.getUnlockedIdentity();
      if (!identity) {
        alert('Please unlock your account first');
        return;
      }

      // Issue grant using SDK
      const grant = await platform.issueCapabilityGrant({
        subjectDid: grantRequest.serviceDid,
        subjectEncryptionPublicKey: null, // Service doesn't need encrypted grants
        resourceId: grantRequest.resourceId,
        rights: grantRequest.rights,
        expiresAt: grantRequest.expiresAt,
      });

      // Send grant back to service
      if (window.opener) {
        window.opener.postMessage({
          type: 'grant_issued',
          grant,
        }, grantRequest.callbackUrl);
        window.close();
      } else {
        // Redirect if not popup
        window.location.href = `${grantRequest.callbackUrl}#${encodeURIComponent(JSON.stringify(grant))}`;
      }
    });

    document.getElementById('deny-btn').addEventListener('click', () => {
      if (window.opener) {
        window.opener.postMessage({ type: 'grant_denied' }, grantRequest.callbackUrl);
        window.close();
      } else {
        window.location.href = grantRequest.callbackUrl;
      }
    });
  </script>
</body>
</html>
```

### 4.2 LocalPod Upload Interface

**Create in LocalPod repo: `upload.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Upload to IPFS - LocalPod</title>
</head>
<body>
  <h1>Upload Content to Your IPFS</h1>
  <div id="upload-info"></div>
  <button id="confirm-btn">Confirm Upload</button>
  <button id="cancel-btn">Cancel</button>

  <script type="module">
    import { IdentityPlatform } from './sdk/index.js';
    import { SimpleStorage } from './storage.js';
    import { config } from './config.js';

    const platform = new IdentityPlatform({
      remoteStorage: new SimpleStorage(config.filebase)
    });
    await platform.init();

    // Parse upload request
    const params = new URLSearchParams(window.location.search);
    const uploadRequest = {
      path: params.get('path'),
      data: JSON.parse(decodeURIComponent(params.get('data'))),
      grantId: params.get('grant_id'),
      callbackUrl: params.get('callback_url'),
    };

    // Display info
    document.getElementById('upload-info').innerHTML = `
      <p>Path: <code>${uploadRequest.path}</code></p>
      <p>Size: ${JSON.stringify(uploadRequest.data).length} bytes</p>
      <pre>${JSON.stringify(uploadRequest.data, null, 2)}</pre>
    `;

    // Confirm upload
    document.getElementById('confirm-btn').addEventListener('click', async () => {
      const identity = platform.getUnlockedIdentity();
      if (!identity) {
        alert('Please unlock your account first');
        return;
      }

      try {
        // Upload to user's IPFS
        const storage = platform.remoteStorage;
        const key = `${identity.publicKey}${uploadRequest.path}`;

        await storage.uploadObject(key, uploadRequest.data);

        // Get CID (this is simplified - actual implementation may vary)
        const cid = generateCIDFromKey(key);

        // Send result back
        const result = { success: true, cid, path: uploadRequest.path };

        if (window.opener) {
          window.opener.postMessage({
            type: 'upload_complete',
            result,
          }, uploadRequest.callbackUrl);
          window.close();
        } else {
          window.location.href = `${uploadRequest.callbackUrl}#${encodeURIComponent(JSON.stringify(result))}`;
        }
      } catch (error) {
        alert('Upload failed: ' + error.message);
      }
    });

    document.getElementById('cancel-btn').addEventListener('click', () => {
      if (window.opener) {
        window.opener.postMessage({ type: 'upload_cancelled' }, uploadRequest.callbackUrl);
        window.close();
      } else {
        window.location.href = uploadRequest.callbackUrl;
      }
    });
  </script>
</body>
</html>
```

---

## Phase 5: Testing & Deployment

### 5.1 Environment Variables

```bash
# backend/.env
SERVICE_DID=did:key:z6Mkf5m1X5iYtuoXLiWcZ3t6kYQpo6sDiM8JY2J2RvE5D6Yz
JWT_SECRET=your-secret-key-here
DATABASE_URL=postgresql://user:pass@localhost:5432/service_db
LOCALPOD_AUTH_URL=http://localhost:5500/auth.html
SERVICE_CALLBACK_URL=http://localhost:3000/auth/callback
IPFS_GATEWAY=https://gateway.filebase.io/ipfs
```

```bash
# frontend/.env
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_SERVICE_DID=did:key:z6Mkf5m1X5iYtuoXLiWcZ3t6kYQpo6sDiM8JY2J2RvE5D6Yz
REACT_APP_LOCALPOD_URL=http://localhost:5500
```

### 5.2 Testing Checklist

- [ ] User can authenticate via LocalPod DID
- [ ] JWT token properly generated and validated
- [ ] User can issue capability grant
- [ ] Grant stored and validated correctly
- [ ] Grant expiration handled
- [ ] Content upload to user's IPFS works
- [ ] Content indexed in service database
- [ ] Content feed displays correctly
- [ ] Content retrieval from IPFS works
- [ ] User can revoke grants
- [ ] Expired grants rejected
- [ ] Error handling for all edge cases

### 5.3 Deployment

**Backend (Node.js)**
- Deploy to: Railway, Render, or Heroku
- Database: PostgreSQL on Railway/Supabase
- Environment variables configured

**Frontend**
- Deploy to: Vercel, Netlify, or Cloudflare Pages
- Static build optimized
- Environment variables set

**LocalPod Integration**
- Update callback URLs to production domains
- Update CORS settings
- Test full flow in production

---

## Phase 6: Documentation

### 6.1 Integration Guide

Create `docs/INTEGRATION_GUIDE.md` covering:
- How to set up authentication
- How to request grants
- How to upload content
- Error handling
- Best practices

### 6.2 API Reference

Create `docs/API_REFERENCE.md` documenting:
- All API endpoints
- Request/response formats
- Authentication headers
- Error codes

---

## Next Steps

1. **Create LocalPod-Service-Template repository**
2. **Set up basic project structure**
3. **Implement Phase 1 (Authentication)**
4. **Test authentication flow end-to-end**
5. **Implement Phase 2 (Grants)**
6. **Implement Phase 3 (Content Publishing)**
7. **Add LocalPod grant/upload pages**
8. **Complete integration testing**
9. **Write documentation**
10. **Deploy and test in production**

---

## Technical Stack

**Frontend:**
- React (or Vue/Vanilla JS)
- Fetch API for requests
- LocalStorage for token management

**Backend:**
- Node.js + Express
- PostgreSQL database
- JWT for sessions
- @noble/curves for signature verification
- @scure/base for DID parsing

**Integration:**
- LocalPod SDK for signing/grants
- Filebase/IPFS for storage
- OAuth-style redirect flow

---

## Success Metrics

- ✅ Users can authenticate with LocalPod DID
- ✅ Users can grant upload permissions
- ✅ Content stored in user's IPFS (user-owned)
- ✅ Service indexes content for discovery
- ✅ Users can revoke permissions anytime
- ✅ Content portable across services
- ✅ No vendor lock-in (user owns data)
