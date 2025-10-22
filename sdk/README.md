# Identity Platform SDK

> A decentralized identity foundation for building encrypted, collaborative applications

## Overview

The **Identity Platform SDK** provides a complete foundation for building decentralized applications with:

- 🔐 **DID-based Authentication** - did:key method using Ed25519
- 👤 **User Profiles** - Display names and avatars
- 🤝 **Collaborator Management** - Trust network and public key registry
- 🔒 **End-to-End Encryption** - ECDH key agreement + AES-GCM
- 💾 **Local-First Storage** - IndexedDB with optional cloud sync
- 🌐 **Zero Backend Required** - Runs entirely in the browser

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                        │
│  (Collaborative Writer, Music Playlists, Recipe Exchange)    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Uses SDK API
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              IDENTITY PLATFORM SDK (THIS)                    │
│  - Account Management    - Profile Management                │
│  - Collaborator Registry - Encryption Utilities              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Stores in
                         ↓
┌─────────────────────────────────────────────────────────────┐
│            LOCAL STORAGE (IndexedDB)                         │
│  - accounts  - collaborators  - profiles  - backups          │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Browser (ES Modules)

```html
<script type="module">
  import { IdentityPlatform } from './sdk/index.js';

  const platform = new IdentityPlatform();
  await platform.init();
</script>
```

### With Import Maps

```html
<script type="importmap">
{
  "imports": {
    "@localPod/identity-platform": "./sdk/index.js",
    "dexie": "https://cdn.jsdelivr.net/npm/dexie@3.2.3/+esm",
    "@noble/curves/ed25519": "https://esm.sh/@noble/curves@1.4.0/ed25519",
    "@scure/base": "https://cdn.jsdelivr.net/npm/@scure/base@1.1.1/+esm"
  }
}
</script>
```

## Quick Start

### 1. Initialize the Platform

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';

const platform = new IdentityPlatform({
  remoteStorage: null  // Optional: provide Filebase/S3 client
});

await platform.init();
```

### 2. Create an Account

```javascript
const identity = await platform.createAccount({
  username: 'alice',
  password: 'securePassword123'
});

console.log(identity);
// {
//   username: 'alice',
//   did: 'did:key:z8mwaSF...',
//   publicKey: 'z8mwaSF...',
//   privateKey: '...',  // Base64 (keep secret!)
//   createdAt: '2025-10-18T12:00:00Z'
// }
```

### 3. Unlock an Account

```javascript
const identity = await platform.unlock({
  username: 'alice',
  password: 'securePassword123'
});

console.log('Unlocked:', identity.username);
```

### 4. Manage Profiles

```javascript
// Save your profile
await platform.saveProfile({
  publicKey: identity.publicKey,
  displayName: 'Alice Wonderland',
  avatar: 'data:image/png;base64,...'
}, { syncRemote: false });

// Get a profile
const profile = await platform.getProfile(identity.publicKey);
console.log(profile.displayName); // "Alice Wonderland"
```

### 5. Add Collaborators

```javascript
// Add Bob as a collaborator
await platform.addCollaborator({
  publicKey: 'z8bobPublicKey...',
  name: 'Bob'
});

// List all collaborators
const collaborators = await platform.listCollaborators();
console.log(collaborators);
// [{ id: 'z8bob...', publicKey: 'z8bob...', name: 'Bob', addedAt: '...' }]
```

## API Reference

### IdentityPlatform

Main SDK class that orchestrates all services.

#### Constructor

```javascript
new IdentityPlatform(options)
```

**Options:**
- `remoteStorage` (Object, optional): Remote storage provider (e.g., Filebase S3 client)

#### Methods

##### Account Management

```javascript
await platform.listAccounts()
await platform.createAccount({ username, password })
await platform.unlock({ username, password })
platform.lock()
platform.isUnlocked()
platform.getIdentity()
await platform.deleteAccount(username)
await platform.importAccountFromBackup({ username, password, backup })
```

##### Profile Management

```javascript
await platform.getProfile(publicKey, options)
await platform.saveProfile(profile, options)
await platform.updateProfile(publicKey, updates, options)
await platform.deleteProfile(publicKey)
await platform.listProfiles()
await platform.ensureProfiles(publicKeys)
```

##### Collaborator Management

```javascript
await platform.listCollaborators()
await platform.getCollaborator(id)
await platform.addCollaborator(collaborator, options)
await platform.removeCollaborator(id, options)
await platform.listCollaboratorsWithProfiles()
await platform.searchCollaborators(query)
await platform.isTrustedCollaborator(publicKey)
```

##### Event System

```javascript
// Subscribe to events
const unsubscribe = platform.on('account-unlocked', (identity) => {
  console.log('Unlocked:', identity.username);
});

// Available events:
// - 'initialized'
// - 'account-created'
// - 'account-unlocked'
// - 'account-locked'
// - 'account-deleted'
// - 'account-imported'
// - 'profile-updated'
// - 'profile-deleted'
// - 'collaborator-added'
// - 'collaborator-removed'

// Unsubscribe
unsubscribe();
```

##### Utilities

```javascript
await platform.getStats()
platform.clearCaches()
platform.removeAllListeners()
```

### Individual Services

You can also use services directly:

```javascript
import { AccountService, ProfileService, CollaboratorService } from '@localPod/identity-platform';

const accountService = new AccountService();
const profileService = new ProfileService(remoteStorage);
const collaboratorService = new CollaboratorService(profileService);
```

### Core Utilities

#### DID Operations

```javascript
import { didFromPublicKey, publicKeyFromDid, generateKeyPair } from '@localPod/identity-platform';

// Generate key pair
const { privateKey, publicKey } = generateKeyPair();

// Create DID
const did = didFromPublicKey(publicKey);
// "did:key:z8mwaSF..."

// Extract public key from DID
const extractedKey = publicKeyFromDid(did);
```

#### Encryption

```javascript
import {
  generateDocumentKey,
  encryptWithKey,
  decryptWithKey,
  encryptForRecipient,
  decryptFromSender
} from '@localPod/identity-platform';

// Generate document encryption key
const docKey = generateDocumentKey(); // 256-bit AES key

// Encrypt for a recipient (ECDH)
const { ciphertext, iv } = await encryptForRecipient(
  'Secret message',
  recipientPublicKey,
  senderPrivateKey
);

// Decrypt from sender
const plaintext = await decryptFromSender(
  ciphertext,
  iv,
  senderPublicKey,
  recipientPrivateKey
);
```

#### Encoding

```javascript
import { bytesToBase58, base58ToBytes, bytesToBase64, base64ToBytes } from '@localPod/identity-platform';

const bytes = new Uint8Array([1, 2, 3, 4]);
const base58 = bytesToBase58(bytes);
const base64 = bytesToBase64(bytes);
```

## Database Schema

The SDK creates an IndexedDB database named `identityPlatform` with the following tables:

### `accounts`
- Primary key: `username`
- Indexes: `publicKey`, `createdAt`
- Fields: `username`, `did`, `publicKey`, `encryptedPrivateKey`, `encryptionIv`, `salt`, `iterations`, `createdAt`, `updatedAt`

### `collaborators`
- Primary key: `id`
- Indexes: `publicKey`, `addedAt`
- Fields: `id`, `publicKey`, `name`, `addedAt`

### `profiles`
- Primary key: `publicKey`
- Indexes: `updatedAt`
- Fields: `publicKey`, `displayName`, `avatar`, `updatedAt`

### `backups`
- Primary key: `publicKey`
- Indexes: `updatedAt`
- Fields: `publicKey`, `cipher`, `iv`, `salt`, `iterations`, `updatedAt`

## Security Best Practices

1. **Password Requirements**
   - Minimum 8 characters (enforced by SDK)
   - Recommend 12+ characters with mixed case, numbers, symbols

2. **Private Key Storage**
   - Private keys are encrypted with PBKDF2 (600,000 iterations)
   - Never log or transmit private keys in plaintext
   - Keys only exist in memory when account is unlocked

3. **Public Key Validation**
   - Always validate public keys before adding collaborators
   - SDK automatically validates format and curve membership

4. **Event Listeners**
   - Clean up event listeners when components unmount
   - Use the returned unsubscribe function

## Building Applications

### Example: Collaborative Document App

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';

class DocumentApp {
  constructor() {
    this.platform = new IdentityPlatform();
    this.documents = [];
  }

  async init() {
    await this.platform.init();

    // Listen for auth events
    this.platform.on('account-unlocked', (identity) => {
      this.loadDocuments();
    });

    this.platform.on('collaborator-added', () => {
      this.refreshCollaboratorList();
    });
  }

  async shareDocument(docId, collaboratorPublicKeys) {
    // Your app encrypts the document
    // Platform provides the collaborator public keys
    const collaborators = await this.platform.listCollaborators();

    // ... encryption logic using platform.ensureProfiles() for names
  }
}
```

## Migration from Monolithic App

If you're migrating from the original monolithic app:

1. **Replace crypto.js imports:**
   ```javascript
   // Before
   import { SimpleDID, encoding } from './crypto.js';

   // After
   import { IdentityPlatform, bytesToBase58 } from '@localPod/identity-platform';
   ```

2. **Replace SimpleDID calls:**
   ```javascript
   // Before
   const identity = await SimpleDID.createAccount({ username, password });

   // After
   const platform = new IdentityPlatform();
   const identity = await platform.createAccount({ username, password });
   ```

3. **Database migration:** The SDK uses a separate database (`identityPlatform`) to avoid conflicts.

## Development

### Project Structure

```
sdk/
├── index.js                 # Main export
├── src/
│   ├── IdentityPlatform.js  # Main SDK class
│   ├── core/
│   │   ├── DID.js           # DID operations
│   │   └── crypto.js        # Encryption utilities
│   ├── services/
│   │   ├── AccountService.js
│   │   ├── ProfileService.js
│   │   └── CollaboratorService.js
│   ├── storage/
│   │   └── PlatformDatabase.js
│   ├── components/          # (Future: Lit components)
│   └── utils/
│       └── encoding.js
└── README.md
```

### Running Tests

(TODO: Add tests)

```bash
npm test
```

## Roadmap

- [ ] Unit tests for all services
- [ ] Lit web components (account-gate, identity-card, etc.)
- [ ] Remote storage sync service
- [ ] TypeScript type definitions
- [ ] Conflict resolution for profiles
- [ ] Rate limiting for authentication
- [ ] Account recovery flow
- [ ] Multi-device sync

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
