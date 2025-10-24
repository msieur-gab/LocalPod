# UCAN-Based Capability Architecture Roadmap

## Executive Summary

**Goal:** Enable third-party services to access user's LocalPod storage (IPFS/Filebase) with **fine-grained permissions**, **no shared secrets**, and **no multi-window coordination**.

**Current Problem:** The broker-based architecture requires complex multi-window communication (postMessage), services must be launched from demo.html, and UX is poor (users must always have demo.html open).

**Solution:** Replace broker with **UCAN (User-Controlled Authorization Networks)** tokens + **presigned Filebase URLs**. Services prove authorization through cryptographically signed capability tokens instead of runtime broker communication.

---

## Why UCAN? (The Reasoning)

### Problems with Previous Approaches

#### ❌ **Password-per-operation (original)**
- Required 3 password prompts: auth, grant, and each IPFS operation
- Terrible UX, users complained
- Services needed direct access to private keys (security risk)

#### ❌ **Session-based broker (attempted)**
- Reduced to 1 password prompt (good!)
- BUT: Required multi-window coordination via postMessage
- Services had to be launched FROM demo.html
- Didn't work for standalone services (no window.parent/opener)
- Complex fallback logic (BroadcastChannel, lazy sync)
- Fighting against the web platform instead of working with it

### ✅ **UCAN Advantages**

1. **Offline-first:** Services don't need live connection to user's identity system
2. **Cryptographic proof:** Capabilities are signed tokens that services can verify independently
3. **Fine-grained delegation:** Specify exact resources, actions, and time limits
4. **Revocation via TTLs:** Short-lived tokens + renewal flow (no complex revocation registry needed initially)
5. **Standards-based:** UCAN is an emerging standard for decentralized authorization
6. **Works with web architecture:** No multi-window hacks, services work standalone

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER'S DEVICE                            │
│  ┌────────────────┐                                             │
│  │  demo.html     │  User's Identity Dashboard                  │
│  │  (LocalPod)    │  - Manages accounts, DIDs, keys             │
│  │                │  - Reviews grant requests                   │
│  └────────────────┘  - Signs UCAN tokens                        │
│         ↓                                                        │
│  ┌────────────────┐                                             │
│  │  grant.html    │  Capability Signing                         │
│  │                │  - Shows service request                    │
│  │                │  - User enters password ONCE                │
│  │                │  - Signs UCAN token with user's private key │
│  │                │  - Generates presigned Filebase URL         │
│  └────────────────┘  - Returns both to service                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    (UCAN token + presigned URL)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    THIRD-PARTY SERVICE                           │
│  ┌────────────────┐                                             │
│  │  notes.html    │  Any Third-Party App                        │
│  │  (or any       │  - Stores UCAN in localStorage              │
│  │   service)     │  - Uses presigned URL to upload to Filebase │
│  │                │  - Requests new presigned URL when expired  │
│  └────────────────┘  - Re-requests UCAN when it expires         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                         FILEBASE (IPFS)                          │
│  - Accepts uploads via presigned URLs                           │
│  - Content is encrypted client-side (envelope encryption)       │
│  - UCAN metadata stored alongside content                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Components

### 1. UCAN Token Structure

```javascript
{
  // Standard JWT headers
  "header": {
    "alg": "EdDSA",           // Ed25519 signatures (we already use @noble/curves)
    "typ": "JWT"
  },

  // UCAN payload
  "payload": {
    "iss": "did:key:z6Mk...",      // Issuer: User's DID
    "aud": "did:key:z6Mk...",      // Audience: Service's DID
    "nbf": 1234567890,              // Not before (Unix timestamp)
    "exp": 1234567890,              // Expiration (Unix timestamp)

    // Attenuations (permissions)
    "att": [
      {
        "with": "ipfs://userPublicKey/notes/*",  // Resource pattern
        "can": "storage/write"                     // Capability
      },
      {
        "with": "ipfs://userPublicKey/notes/*",
        "can": "storage/read"
      }
    ],

    // Proof chain (for delegation)
    "prf": [],  // Empty for direct user-to-service grants

    // Custom metadata
    "meta": {
      "serviceName": "LocalPod Notes",
      "grantedAt": "2025-10-24T12:00:00Z"
    }
  },

  // Signature (signed with user's Ed25519 private key)
  "signature": "..."
}
```

### 2. Presigned Filebase URLs

- **Purpose:** Allow service to upload to Filebase without having Filebase API keys
- **Lifetime:** 1 hour (configurable)
- **Generation:** Client-side in grant.html using user's Filebase credentials
- **Renewal:** Service requests new presigned URL when current one expires (no password needed if UCAN still valid)

```javascript
// Presigned URL structure (S3-compatible)
{
  "url": "https://s3.filebase.com/bucket/userPublicKey/notes/doc123.json?...",
  "method": "PUT",
  "expiresAt": "2025-10-24T13:00:00Z",
  "headers": {
    "x-amz-content-sha256": "...",
    "x-amz-date": "..."
  }
}
```

### 3. Grant Request Flow

```
Service                  grant.html                  User
   |                         |                         |
   |--- (1) Redirect ------->|                         |
   |    with grant request   |                         |
   |                         |<----- (2) Reviews -----|
   |                         |       request & enters |
   |                         |       password         |
   |                         |                         |
   |                         |--- (3) Unlocks keys ---|
   |                         |                         |
   |                         |--- (4) Signs UCAN -----|
   |                         |                         |
   |                         |-- (5) Generates -------|
   |                         |    presigned URL       |
   |                         |                         |
   |<--- (6) Redirect -------|                         |
   |    with UCAN + URL      |                         |
   |                         |                         |
   |--- (7) Stores tokens ---|                         |
   |    in localStorage      |                         |
   |                         |                         |
   |--- (8) Uses presigned --|                         |
   |    URL to upload        |                         |
```

### 4. Renewal Flow (Presigned URL Expired)

```
Service                  grant.html                  User
   |                         |                         |
   |--- (1) Redirect ------->|                         |
   |    with UCAN token      |                         |
   |                         |                         |
   |                         |--- (2) Validates -------|
   |                         |    UCAN signature      |
   |                         |    & expiration        |
   |                         |                         |
   |                         |-- (3) NO PASSWORD! ----|
   |                         |    Just generates new  |
   |                         |    presigned URL       |
   |                         |                         |
   |<--- (4) Returns new ----|                         |
   |    presigned URL        |                         |
```

### 5. Re-authorization Flow (UCAN Expired)

```
Service                  grant.html                  User
   |                         |                         |
   |--- (1) Redirect ------->|                         |
   |    UCAN expired         |                         |
   |                         |<----- (2) Reviews -----|
   |                         |       & enters         |
   |                         |       password         |
   |                         |                         |
   |                         |--- (3) Signs new ------|
   |                         |    UCAN + presigned    |
   |                         |    URL                 |
   |                         |                         |
   |<--- (4) Returns --------|                         |
   |    new tokens           |                         |
```

---

## Implementation Plan

### Phase 1: Core UCAN Infrastructure ✅ **[CURRENT]**

#### 1.1 Add UCAN Library
- **Library:** Use `@ucanto` (Fission's UCAN implementation) or implement minimal JWT signing
- **Alternative:** Use existing `@noble/curves/ed25519` for signing + manual JWT encoding
- **Decision:** Start with manual implementation (we already have Ed25519 signing)

```javascript
// sdk/src/services/CapabilityService.js
import { signMessage } from '@noble/curves/ed25519';

class CapabilityService {
  async createUCAN({
    issuerDid,        // User's DID
    issuerPrivateKey, // User's signing private key
    audienceDid,      // Service's DID
    attenuations,     // Array of {with, can} permissions
    expiresIn,        // Duration in seconds (default: 7 days)
    proofs = []       // Proof chain (empty for direct grants)
  }) {
    // 1. Build JWT payload
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: issuerDid,
      aud: audienceDid,
      nbf: now,
      exp: now + expiresIn,
      att: attenuations,
      prf: proofs,
      meta: {
        grantedAt: new Date().toISOString()
      }
    };

    // 2. Encode header + payload
    const header = { alg: 'EdDSA', typ: 'JWT' };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));

    // 3. Sign
    const message = `${encodedHeader}.${encodedPayload}`;
    const signature = await signMessage(issuerPrivateKey, message);
    const encodedSignature = base64UrlEncode(signature);

    // 4. Return JWT
    return `${message}.${encodedSignature}`;
  }

  async validateUCAN(ucanToken) {
    // 1. Parse JWT
    const [encodedHeader, encodedPayload, encodedSignature] = ucanToken.split('.');

    // 2. Verify signature using issuer's public key (from DID)
    // 3. Check expiration
    // 4. Return parsed claims
  }
}
```

#### 1.2 Add Presigned URL Generation
- **Location:** `storage.js` (SimpleStorage class)
- **Method:** `generatePresignedUploadUrl(key, expiresIn = 3600)`

```javascript
// storage.js
class SimpleStorage {
  generatePresignedUploadUrl(key, expiresIn = 3600) {
    const expiration = Math.floor(Date.now() / 1000) + expiresIn;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    // Generate S3 presigned URL (similar to putObject but GET instead)
    // Include X-Amz-Signature, X-Amz-Credential, X-Amz-Expires

    return {
      url: `https://s3.filebase.com/${this.bucket}/${key}?...`,
      method: 'PUT',
      expiresAt: new Date(expiration * 1000).toISOString(),
      headers: {
        'Content-Type': 'application/json',
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD'
      }
    };
  }
}
```

#### 1.3 Update SDK Index
- Export CapabilityService from `sdk/index.js`
- Add to IdentityPlatform initialization

```javascript
// sdk/src/IdentityPlatform.js
import { CapabilityService } from './services/CapabilityService.js';

class IdentityPlatform {
  constructor({ remoteStorage, serviceManifest = [] }) {
    // ... existing services ...

    this.capabilityService = new CapabilityService({
      accountService: this.accountService,
      remoteStorage: this.remoteStorage
    });
  }
}
```

---

### Phase 2: Update Grant Flow

#### 2.1 Modify grant.html
**Current behavior:** Saves grant to IndexedDB, relies on broker for IPFS sync

**New behavior:**
1. User reviews service request
2. Enters password to unlock signing key
3. Client generates UCAN token (signed with user's Ed25519 key)
4. Client generates presigned Filebase URL (1 hour expiry)
5. Redirects back to service with both tokens

```javascript
// grant.html (pseudocode)
async function handleGrantApproval() {
  // 1. Unlock account
  const identity = await platform.unlock({ username, password });

  // 2. Parse service request
  const { serviceDid, resourcePattern, rights, callbackUrl } = grantRequest;

  // 3. Generate UCAN
  const ucan = await platform.capabilityService.createUCAN({
    issuerDid: identity.did,
    issuerPrivateKey: identity.signingPrivateKey,
    audienceDid: serviceDid,
    attenuations: [
      {
        with: resourcePattern,
        can: `storage/${rights.join(',')}`
      }
    ],
    expiresIn: 7 * 24 * 60 * 60  // 7 days
  });

  // 4. Generate presigned URL
  const presignedUrl = platform.remoteStorage.generatePresignedUploadUrl(
    `${identity.publicKey}/...`,
    3600  // 1 hour
  );

  // 5. Save grant to IndexedDB (for user's reference in demo.html)
  await DatabaseOps.saveCapabilityGrant({
    id: `grant:${identity.did}:${serviceDid}`,
    granterDid: identity.did,
    subjectDid: serviceDid,
    resourceId: resourcePattern,
    rights: rights,
    ucanToken: ucan,  // Store UCAN for renewal
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });

  // 6. Redirect back to service
  const payload = {
    grantApproved: true,
    ucan: ucan,
    presignedUrl: presignedUrl,
    userDid: identity.did,
    userPublicKey: identity.publicKey
  };

  window.location.href = `${callbackUrl}#grant=${encodeURIComponent(JSON.stringify(payload))}`;
}
```

#### 2.2 Add Presigned URL Renewal Endpoint
**New file:** `renew-presigned-url.html`

```javascript
// renew-presigned-url.html
// Lightweight page that:
// 1. Receives UCAN token from service
// 2. Validates UCAN signature and expiration
// 3. Generates new presigned URL (NO PASSWORD NEEDED)
// 4. Returns to service

async function handleRenewal() {
  const { ucan, resourcePath, callbackUrl } = request;

  // Validate UCAN
  const isValid = await platform.capabilityService.validateUCAN(ucan);
  if (!isValid) {
    throw new Error('Invalid or expired UCAN token');
  }

  // Extract user public key from UCAN issuer DID
  const userPublicKey = extractPublicKeyFromDid(ucan.iss);

  // Generate new presigned URL (no password needed!)
  const presignedUrl = platform.remoteStorage.generatePresignedUploadUrl(
    resourcePath,
    3600
  );

  // Return to service
  window.location.href = `${callbackUrl}#renewed=${encodeURIComponent(JSON.stringify({ presignedUrl }))}`;
}
```

---

### Phase 3: Update Service Implementation

#### 3.1 Update notes.html (Example Service)

**Remove:**
- ❌ IdentityBroker client
- ❌ postMessage communication
- ❌ Broker sync attempts

**Add:**
- ✅ UCAN token storage
- ✅ Presigned URL storage
- ✅ Direct Filebase upload using presigned URL
- ✅ Renewal flow when presigned URL expires

```javascript
// notes.html (pseudocode)
class NotesService {
  constructor() {
    this.ucan = localStorage.getItem('localpod_notes_ucan');
    this.presignedUrl = JSON.parse(localStorage.getItem('localpod_notes_presigned') || 'null');
    this.userPublicKey = localStorage.getItem('localpod_notes_user_publickey');
  }

  async saveNote(noteContent) {
    // Check if presigned URL expired
    if (!this.presignedUrl || new Date(this.presignedUrl.expiresAt) < new Date()) {
      // Request new presigned URL
      await this.renewPresignedUrl();
    }

    // Upload directly to Filebase using presigned URL
    const response = await fetch(this.presignedUrl.url, {
      method: this.presignedUrl.method,
      headers: this.presignedUrl.headers,
      body: JSON.stringify({
        content: noteContent,
        ucan: this.ucan,  // Include UCAN as metadata
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error('Failed to upload to Filebase');
    }

    return response;
  }

  async renewPresignedUrl() {
    // Redirect to renewal endpoint with current UCAN
    const renewUrl = new URL('./renew-presigned-url.html', window.location.origin);
    renewUrl.searchParams.set('ucan', this.ucan);
    renewUrl.searchParams.set('resource_path', `${this.userPublicKey}/notes/data.json`);
    renewUrl.searchParams.set('callback_url', window.location.href);

    window.location.href = renewUrl.toString();
  }

  async handleRenewalCallback() {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const renewed = params.get('renewed');

    if (renewed) {
      const { presignedUrl } = JSON.parse(decodeURIComponent(renewed));
      this.presignedUrl = presignedUrl;
      localStorage.setItem('localpod_notes_presigned', JSON.stringify(presignedUrl));

      // Clear hash and continue
      window.location.hash = '';
    }
  }
}
```

---

### Phase 4: Connected Services Management

#### 4.1 Update demo.html Service List
- Load service grants from IndexedDB
- Display UCAN expiration dates
- Show presigned URL status
- Revoke button → deletes grant from IndexedDB + optionally notifies service

```javascript
// demo.js
async function renderServices() {
  const grants = await DatabaseOps.listCapabilityGrantsByGranter(currentIdentity.did);

  grants.forEach(grant => {
    // Parse UCAN to get expiration
    const ucan = parseUCAN(grant.ucanToken);
    const expiresAt = new Date(ucan.exp * 1000);
    const isExpired = expiresAt < new Date();

    // Render service card
    renderServiceCard({
      serviceName: grant.metadata.serviceName,
      serviceDid: grant.subjectDid,
      permissions: grant.rights,
      resourcePattern: grant.resourceId,
      expiresAt: expiresAt,
      isExpired: isExpired,
      onRevoke: () => revokeService(grant.id)
    });
  });
}
```

---

## Security Considerations

### 1. Private Key Protection
- ✅ User's signing private key NEVER leaves their device
- ✅ Private keys only unlocked when user enters password
- ✅ Keys cleared from memory after UCAN signing

### 2. Token Lifetimes
- **UCAN:** 7 days default (configurable per service)
- **Presigned URL:** 1 hour (short-lived by design)
- **Rationale:** Balance between UX (fewer password prompts) and security (limited blast radius)

### 3. Revocation Strategy
- **Immediate:** User deletes grant from IndexedDB → stops renewing presigned URLs
- **Grace period:** Existing presigned URL valid for up to 1 hour
- **Future:** Implement revocation registry for instant revocation (Phase 5)

### 4. UCAN Validation
- ✅ Signature verification using issuer's public key (from DID)
- ✅ Expiration check
- ✅ Resource pattern matching (service can only access granted paths)
- ✅ Proof chain validation (for delegated capabilities)

### 5. Filebase Credentials
- ✅ User's Filebase API keys stored only in their browser (config.js or encrypted in IndexedDB)
- ✅ Services never see Filebase credentials (only presigned URLs)
- ✅ Presigned URLs are scope-limited (specific path + HTTP method)

---

## Migration Path from Current System

### Step 1: Keep Session-Based Auth (auth.html)
- ✅ Already working well
- ✅ Creates 1-hour session for password-less operations
- ✅ Doesn't conflict with UCAN approach

### Step 2: Replace grant.html Broker Logic
- ❌ Remove broker sync calls
- ✅ Add UCAN token generation
- ✅ Add presigned URL generation

### Step 3: Update notes.html
- ❌ Remove IdentityBroker client
- ✅ Add UCAN token handling
- ✅ Add direct Filebase upload

### Step 4: Create Test Service Template
- ✅ Minimal example showing UCAN flow
- ✅ Clear documentation for third-party developers

---

## Success Criteria

### User Experience
- ✅ **1 password prompt** for initial grant
- ✅ **0 password prompts** for presigned URL renewal (within 7 day UCAN lifetime)
- ✅ Services work **standalone** (no need to launch from demo.html)
- ✅ Services work **offline** (once UCAN + presigned URL obtained)
- ✅ Clear expiration indicators in demo.html

### Developer Experience
- ✅ **Simple service integration** (no complex broker setup)
- ✅ **Works with standard web APIs** (fetch, localStorage, URL hash navigation)
- ✅ **Clear documentation** with working examples
- ✅ **Standard JWT format** for UCAN tokens (easy to debug)

### Security
- ✅ **Private keys never leave user's device**
- ✅ **Fine-grained permissions** (path-based resource patterns)
- ✅ **Time-limited capabilities** (7 day UCAN, 1 hour presigned URL)
- ✅ **User-controlled revocation** via demo.html

### Technical
- ✅ **No multi-window coordination**
- ✅ **No persistent broker process**
- ✅ **Works with existing SDK architecture**
- ✅ **Compatible with envelope encryption** (content still encrypted client-side)

---

## Future Enhancements (Post-MVP)

### Phase 5: Advanced Features
1. **Delegation chains:** User → Service A → Service B
2. **Revocation registry:** Instant revocation without waiting for token expiry
3. **Capability marketplace:** Discover and request capabilities from other users
4. **Cross-device sync:** Sync UCAN tokens across user's devices via encrypted IPFS backup

### Phase 6: Standards Compliance
1. **Full UCAN spec compliance:** Use `@ucanto` library
2. **W3C DID methods:** Support did:web, did:plc beyond did:key
3. **ZCAP-LD support:** Alternative to UCAN for RDF-based systems

### Phase 7: Developer Tools
1. **UCAN token inspector:** Browser extension for debugging
2. **Service manifest generator:** UI tool for creating service manifests with UCAN templates
3. **Integration testing framework:** Test suite for service developers

---

## Open Questions & Decisions Needed

### Q1: UCAN Library Choice
- **Option A:** Manual implementation using existing @noble/curves
  - ✅ Pros: No dependencies, full control, minimal size
  - ❌ Cons: More code to maintain, potential spec drift

- **Option B:** Use @ucanto library
  - ✅ Pros: Spec-compliant, well-tested, future-proof
  - ❌ Cons: Additional dependency, learning curve

**Decision:** Start with **Option A** (manual), migrate to **Option B** if spec compliance becomes critical

### Q2: Presigned URL Storage
- **Option A:** Store in service's localStorage (current plan)
  - ✅ Pros: Simple, works offline
  - ❌ Cons: Lost on browser clear/incognito

- **Option B:** Store in encrypted IPFS backup
  - ✅ Pros: Survives browser clear, cross-device
  - ❌ Cons: Requires fetch from IPFS (latency)

**Decision:** **Option A** for MVP, **Option B** for Phase 5

### Q3: Revocation UX
- **Option A:** Passive revocation (stop renewing presigned URLs)
  - ✅ Pros: Simple, no infrastructure
  - ❌ Cons: Up to 1 hour grace period

- **Option B:** Active revocation registry
  - ✅ Pros: Instant revocation
  - ❌ Cons: Requires server or blockchain

**Decision:** **Option A** for MVP (acceptable 1-hour grace period)

---

## Current Status

**Branch:** `feat/ucan-capabilities`

**Completed:**
- ✅ Architecture design
- ✅ Clean branch from stable codebase
- ✅ Roadmap documentation

**Next Steps:**
1. Implement CapabilityService (UCAN token generation)
2. Add presigned URL generation to SimpleStorage
3. Update grant.html to use UCAN
4. Test with notes.html

**Blocked:** None

**Timeline Estimate:**
- Phase 1: 2-3 days (Core UCAN infrastructure)
- Phase 2: 1-2 days (Grant flow)
- Phase 3: 1-2 days (Service updates)
- Phase 4: 1 day (Demo UI)
- **Total MVP:** ~5-8 days of development

---

## References

- **UCAN Spec:** https://github.com/ucan-wg/spec
- **@ucanto Library:** https://github.com/web3-storage/ucanto
- **DID Key Method:** https://w3c-ccg.github.io/did-method-key/
- **S3 Presigned URLs:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
- **Filebase S3 API:** https://docs.filebase.com/api-documentation/s3-compatible-api

---

## Changelog

- **2025-10-24:** Initial roadmap created
- Branch `feat/ucan-capabilities` created from `service-redirect-handshake`
- Moved away from broker-based architecture
