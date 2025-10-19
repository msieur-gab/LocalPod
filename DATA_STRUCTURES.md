# User & Profile Data Structures

Complete documentation of how users, accounts, and profiles are stored in the Identity Platform SDK.

---

## Overview

The SDK stores data in **two layers**:

1. **Local Storage** (IndexedDB) - Private, encrypted, local-only
2. **Remote Storage** (Filebase S3) - **Unified user files** with public + encrypted private data

### Key Innovation: Unified User Files

Each user has a **single file** on S3 containing:
- **Public data** (username, displayName, avatar, bio) - readable by anyone
- **Private data** (encrypted private key) - password-protected

This enables **automatic profile discovery** when adding collaborators by public key!

---

## 1. Account Record

**Storage**: IndexedDB only (never shared publicly)
**Table**: `accounts`
**Primary Key**: `username`

### Structure

```javascript
{
  // Identity
  username: "alice",                    // Unique username (primary key)
  did: "did:key:z8mwaSFJ7pq...",       // Decentralized Identifier
  publicKey: "z8mwaSFJ7pq...",         // Base58-encoded public key (33 bytes compressed secp256k1)

  // Encrypted Private Key
  encryptedPrivateKey: "kL9m3x...",   // Base64-encoded encrypted private key
  encryptionIv: "xQ2w5t...",           // Base64-encoded IV (12 bytes)
  salt: "p4K8n2...",                   // Base64-encoded salt (16 bytes)
  iterations: 600000,                   // PBKDF2 iterations

  // Metadata
  createdAt: "2025-10-18T12:00:00.000Z",
  updatedAt: "2025-10-18T14:30:00.000Z"
}
```

### Real Example

```json
{
  "username": "alice",
  "did": "did:key:z8mwaSFJ7pqNxKW9fT4vXh3C2sRe6jL8mQ1nP5dY7wB3kU",
  "publicKey": "z8mwaSFJ7pqNxKW9fT4vXh3C2sRe6jL8mQ1nP5dY7wB3kU",
  "encryptedPrivateKey": "kL9m3xQ2w5tP8n6K4mR7vB1yU3jH5lF9cX8sT2nM6pQ4wE7rY0uI",
  "encryptionIv": "xQ2w5tP8n6K4mR7v",
  "salt": "p4K8n2L6mQ9xT5wY3rE1",
  "iterations": 600000,
  "createdAt": "2025-10-18T12:00:00.000Z",
  "updatedAt": "2025-10-18T12:00:00.000Z"
}
```

### Security Notes

- **Private key** is encrypted with user's password using PBKDF2 (600k iterations) + AES-256-GCM
- **Salt** is random, 16 bytes, stored with account
- **IV** is random, 12 bytes, unique per encryption
- **Never stored in plaintext**
- **Only decrypted in memory when account is unlocked**

---

## 2. Unified User File (Remote Storage)

**Storage**: S3/Filebase (remote, public + encrypted private)
**File**: `s3://bucket/users/{publicKey}.json`

This is the **core innovation** - one file containing both public and private user data.

### Complete Structure

```json
{
  "version": 1,
  "publicKey": "z8mwaSFJ7pqNxKW9fT4vXh3C2sRe6jL8mQ1nP5dY7wB3kU",

  "public": {
    "username": "alice",
    "displayName": "Alice Wonderland",
    "avatar": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...",
    "bio": "Web3 developer and privacy advocate",
    "updatedAt": "2025-10-18T14:30:00.000Z"
  },

  "private": {
    "cipher": "kL9m3xQ2w5tP8n6K4mR7vB1yU3jH5lF9cX8sT2nM6pQ4wE7rY0uI",
    "iv": "xQ2w5tP8n6K4mR7v",
    "salt": "p4K8n2L6mQ9xT5wY3rE1",
    "iterations": 600000
  }
}
```

### Public Section (Readable by Anyone)

Anyone who knows your public key can fetch and read:
- `username` - Your chosen username
- `displayName` - Your display name
- `avatar` - Profile picture (data URI)
- `bio` - Optional bio/description
- `updatedAt` - Last update timestamp

### Private Section (Encrypted, Password-Protected)

Contains encrypted data (same encryption as local accounts):
- `cipher` - Encrypted private key blob (Base64)
- `iv` - AES-GCM initialization vector (Base64)
- `salt` - PBKDF2 salt (Base64)
- `iterations` - Key derivation iterations (600,000)

**Decryption requires**: User's password
**Encryption algorithm**: AES-256-GCM + PBKDF2

### Benefits

✅ **One network request** - Get both public profile AND encrypted backup
✅ **Automatic discovery** - Add collaborator by public key → profile loads automatically
✅ **Atomic updates** - Public and private data stay in sync
✅ **Same security** - Private data uses battle-tested encryption
✅ **Simpler architecture** - Replaces 3 separate files (profile, backup, account mapping)

---

## 3. Profile Record (Local Cache)

**Storage**: IndexedDB (local cache only)
**Table**: `profiles`
**Primary Key**: `publicKey`

### Local Structure (IndexedDB)

```javascript
{
  publicKey: "z8mwaSFJ7pq...",         // Base58 public key (primary key)
  username: "alice",                   // Username (from unified file)
  displayName: "Alice Wonderland",     // Human-readable name
  avatar: "data:image/png;base64,...", // Base64-encoded image data URI (or null)
  bio: "Web3 developer...",            // User bio
  updatedAt: "2025-10-18T14:30:00.000Z"
}
```

**Note**: This is now a **cache** of the public section from the unified user file.


### Avatar Format

The avatar is stored as a **data URI**:

```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...
│    │     │    │     └─ Base64-encoded image data
│    │     │    └─ Encoding type
│    │     └─ Image format (png, jpeg, gif, etc.)
│    └─ Media type
└─ Data URI scheme
```

**Size Impact**:
- Original image: 500 KB
- Base64 encoded: ~667 KB (+33% overhead)
- Total JSON size: ~670 KB

---

## 4. Collaborator Record

**Storage**: IndexedDB only (private contact list)
**Table**: `collaborators`
**Primary Key**: `id`

### Structure

```javascript
{
  id: "550e8400-e29b-41d4-a716-446655440000", // UUID or publicKey
  publicKey: "z8bobPublicKey...",              // Collaborator's public key
  name: "Bob Smith",                           // Display name (optional)
  addedAt: "2025-10-18T13:00:00.000Z"
}
```

### Real Example

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "publicKey": "z8bobPublicKeyKW9fT4vXh3C2sRe6jL8mQ1nP5dY7wB3kU",
  "name": "Bob Smith",
  "addedAt": "2025-10-18T13:00:00.000Z"
}
```

### Relationship to Profiles

When you add a collaborator:

1. **Collaborator record** is created (your private contact)
2. **Profile record** is created/updated (display name saved locally)
3. Later: Remote profile is fetched from S3 if available

```javascript
// Collaborator record (private)
{
  id: "uuid-123",
  publicKey: "z8bob...",
  name: "Bob",  // Your nickname for them
  addedAt: "..."
}

// Profile record (public, may differ)
{
  publicKey: "z8bob...",
  displayName: "Robert Williams",  // Their chosen name
  avatar: "...",
  updatedAt: "..."
}
```

---

## 5. Backup Record (Local Cache)

**Storage**: IndexedDB only (local cache of private section)
**Table**: `backups`
**Primary Key**: `publicKey`

### Local Structure

```javascript
{
  publicKey: "z8mwaSFJ7pq...",
  cipher: "kL9m3xQ2w5tP8n6K4mR7vB1yU3jH5lF9...", // Encrypted private key
  iv: "xQ2w5tP8n6K4mR7v",
  salt: "p4K8n2L6mQ9xT5wY3rE1",
  iterations: 600000,
  updatedAt: "2025-10-18T12:00:00.000Z"
}
```

### Purpose

Local cache of the encrypted private key for quick access. The authoritative backup is now stored in the **private section of the unified user file**.

---

## 6. Account Lookup Mapping (Remote)

**Storage**: S3 only (lightweight index)
**File**: `s3://bucket/accounts/{username}.json`

### Structure

```json
{
  "version": 1,
  "username": "alice",
  "publicKey": "z8mwaSFJ7pqNxKW9fT4vXh3C2sRe6jL8mQ1nP5dY7wB3kU",
  "updatedAt": "2025-10-18T12:00:00.000Z"
}
```

### Purpose

Lightweight index for **username → publicKey** lookup. Once you have the publicKey, you can fetch the complete unified user file.

**Recovery flow**:
1. User enters username + password
2. SDK fetches account mapping → gets publicKey
3. SDK fetches unified user file → gets encrypted backup
4. Decrypts private key using password
5. Restores account locally

---

## Complete Data Flow

### Account Creation

```javascript
// 1. User submits form
{ username: "alice", password: "secret123" }

// 2. SDK generates keys
{
  privateKey: Uint8Array[32],  // Raw bytes (in-memory only)
  publicKey: Uint8Array[33]     // Compressed secp256k1
}

// 3. Generate DID
did = "did:key:z" + base58(multicodec + publicKey)

// 4. Encrypt private key
{
  encryptedPrivateKey: base64(...),
  encryptionIv: base64(...),
  salt: base64(...),
  iterations: 600000
}

// 5. Save to IndexedDB (accounts table)
{
  username: "alice",
  did: "did:key:z8mwa...",
  publicKey: "z8mwa...",
  encryptedPrivateKey: "...",
  encryptionIv: "...",
  salt: "...",
  iterations: 600000,
  createdAt: "...",
  updatedAt: "..."
}

// 6. Save backup to IndexedDB (backups table)
{
  publicKey: "z8mwa...",
  cipher: "...",
  iv: "...",
  salt: "...",
  iterations: 600000,
  updatedAt: "..."
}

// 7. Create default profile (profiles table)
{
  publicKey: "z8mwa...",
  displayName: "alice",
  avatar: null,
  updatedAt: "..."
}

// 8. Upload unified user file to S3
// - s3://bucket/users/{publicKey}.json (contains public + private sections)
// - s3://bucket/accounts/alice.json (lightweight username→publicKey mapping)
```

### Profile Update

```javascript
// 1. User uploads avatar
File { name: "avatar.png", size: 524288 }

// 2. Convert to base64
avatar = "data:image/png;base64,iVBORw0KGgo..."

// 3. Update profile
{
  publicKey: "z8mwa...",
  displayName: "Alice Wonderland",
  avatar: "data:image/png;base64,...",
  updatedAt: "2025-10-18T14:30:00.000Z"
}

// 4. Save to IndexedDB
db.profiles.put({ ... })

// 5. (Optional) Sync to S3 unified user file
// Updates only the public section, keeps private section intact
PUT s3://bucket/users/{publicKey}.json
```

### Collaborator Discovery (NEW: Automatic!)

```javascript
// Scenario: Bob adds Alice as a collaborator using her public key

// 1. Bob calls addCollaborator
await platform.addCollaborator({
  publicKey: "z8alice...",
  name: "Alice"  // Optional fallback name
});

// 2. SDK automatically fetches unified user file
GET s3://bucket/users/z8alice.json
{
  "version": 1,
  "publicKey": "z8alice...",
  "public": {
    "username": "alice",
    "displayName": "Alice Wonderland",
    "avatar": "data:image/png;base64,...",
    "bio": "Web3 developer",
    "updatedAt": "..."
  },
  "private": { ... }  // Ignored (Bob doesn't have password)
}

// 3. SDK extracts public section and caches locally
db.profiles.put({
  publicKey: "z8alice...",
  username: "alice",
  displayName: "Alice Wonderland",
  avatar: "...",
  bio: "Web3 developer",
  updatedAt: "..."
})

// 4. UI displays "Alice Wonderland" with avatar automatically!
// No manual profile fetch needed - it's automatic!
```

**Key Improvement**: In the old system, you'd need to manually call `getProfile(publicKey, { fetchRemote: true })`. Now it happens automatically when adding a collaborator!

---

## Size Estimates

### Account Record
- **Without avatar**: ~500 bytes
- **JSON overhead**: ~600 bytes
- **Total**: ~1.1 KB

### Profile Record (No Avatar)
- **Metadata only**: ~200 bytes
- **JSON**: ~250 bytes

### Profile Record (With Avatar)
- **Metadata**: ~200 bytes
- **500KB image as base64**: ~667 KB
- **Total**: ~667 KB

### Recommended Limits
- **Avatar file size**: < 500 KB
- **Display name**: < 100 characters
- **Total profile**: < 1 MB

---

## Browser Storage Quotas

### IndexedDB Limits

| Browser | Quota |
|---------|-------|
| Chrome | 60% of available disk space |
| Firefox | 50% of available disk space |
| Safari | 1 GB (asks user for more) |

### Practical Limits

```
Accounts (no avatars):
- 1,000 accounts × 1 KB = 1 MB

Profiles (with avatars):
- 100 profiles × 500 KB = 50 MB
- 1,000 profiles × 500 KB = 500 MB
```

---

## Inspect Your Data

### Chrome DevTools

1. Open DevTools (F12)
2. Go to **Application** tab
3. Expand **IndexedDB** → `identityPlatform`
4. Click on table:
   - `accounts` - See encrypted keys
   - `profiles` - See display names & avatars
   - `collaborators` - See your contacts
   - `backups` - See backup data

### View Profile JSON

```javascript
// In browser console
import { getProfile } from './sdk/storage/PlatformDatabase.js';

const profile = await getProfile('z8mwaSFJ7pq...');
console.log(JSON.stringify(profile, null, 2));
```

### View All Profiles

```javascript
import { listProfiles } from './sdk/storage/PlatformDatabase.js';

const profiles = await listProfiles();
console.table(profiles.map(p => ({
  publicKey: p.publicKey.slice(0, 20) + '...',
  displayName: p.displayName,
  hasAvatar: !!p.avatar,
  updatedAt: p.updatedAt
})));
```

---

## Privacy & Security

### Unified File Security Model

The unified user file combines public and private data securely:

**Public Section** (unencrypted):
- ⚠️ Username, display name, avatar, bio
- ⚠️ Visible to anyone who knows your public key
- ⚠️ This is **intentional** - enables profile discovery and collaboration

**Private Section** (encrypted):
- ✅ Encrypted private key (AES-256-GCM + PBKDF2)
- ✅ Requires your password to decrypt
- ✅ 600,000 PBKDF2 iterations = expensive to brute-force
- ✅ Same security as local-only encryption

### Is This Secure?

**Yes!** Here's why:

1. **Public data is meant to be public** - no change from before
2. **Private data uses battle-tested encryption** - AES-256-GCM is industry standard
3. **Password required** - attacker needs both the file AND your password
4. **High iteration count** - 600k PBKDF2 iterations make brute-forcing impractical
5. **No plaintext leakage** - private key never appears unencrypted in the file

### What's Private?
- ✅ Account records (local IndexedDB only)
- ✅ Encrypted private keys (password required to decrypt)
- ✅ Collaborator list (your private contact book)
- ✅ Private section of unified file (encrypted, password-protected)

### What's Public?
- ⚠️ Public section of unified file (username, display name, avatar, bio)
- ⚠️ Account mappings (username → public key index)

### Important Notes

1. **Public profiles enable collaboration** - this is by design
2. **Don't put sensitive info** in display name or bio
3. **Avatars are visible** to anyone who knows your public key
4. **Username mappings** are public for account recovery
5. **Private keys are always encrypted** - even in the unified file!

---

## JSON Schema Reference

### Unified User File Schema (Remote)

```typescript
interface UnifiedUserFile {
  version: number;               // File format version (1)
  publicKey: string;             // Base58-encoded public key

  public: {
    username: string | null;     // User's username
    displayName: string | null;  // Human-readable name
    avatar: string | null;       // Data URI or null
    bio: string | null;          // User bio/description
    updatedAt: string;           // ISO 8601
  };

  private: {
    cipher: string;              // Base64-encoded encrypted private key
    iv: string;                  // Base64-encoded IV (12 bytes)
    salt: string;                // Base64-encoded salt (16 bytes)
    iterations: number;          // PBKDF2 iterations (600000)
  } | null;
}
```

### Account Schema (Local)

```typescript
interface Account {
  username: string;              // Primary key
  did: string;                   // DID format: "did:key:z{base58}"
  publicKey: string;             // Base58-encoded
  encryptedPrivateKey: string;   // Base64-encoded
  encryptionIv: string;          // Base64-encoded
  salt: string;                  // Base64-encoded
  iterations: number;            // PBKDF2 iterations
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

### Profile Schema (Local Cache)

```typescript
interface Profile {
  publicKey: string;             // Primary key, Base58
  username: string | null;       // Username (from unified file)
  displayName: string | null;    // Human-readable name
  avatar: string | null;         // Data URI or null
  bio: string | null;            // User bio/description
  updatedAt: string;             // ISO 8601
}
```

### Collaborator Schema

```typescript
interface Collaborator {
  id: string;                    // Primary key, UUID
  publicKey: string;             // Base58-encoded
  name: string | null;           // Optional display name
  addedAt: string;               // ISO 8601
}
```

### Backup Schema

```typescript
interface Backup {
  publicKey: string;             // Primary key, Base58
  cipher: string;                // Base64-encoded encrypted key
  iv: string;                    // Base64-encoded
  salt: string;                  // Base64-encoded
  iterations: number;            // PBKDF2 iterations
  updatedAt: string;             // ISO 8601
}
```

---

This documentation should give you a complete picture of how user and profile data is structured! Let me know if you need clarification on any part.
