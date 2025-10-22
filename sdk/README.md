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
await platform.addCollaborator({
  publicKey: 'z8bob...',
  encryptionPublicKey: 'encryptionKey...',
  name: 'Bob'
});

const collaborators = await platform.listCollaborators();
console.log(collaborators.length);
```

### 6. Share Documents

```javascript
const docId = 'doc-123';

await platform.saveSharedKey(docId, {
  collaboratorPublicKey: 'z8bob...',
  encryptedKey: 'MIIBIjANBg...'
});
```

## SDK Modules

| Module | Description |
|--------|-------------|
| `IdentityPlatform` | Main entry point with account, profile, collaborator APIs |
| `AccountService` | Handles DID creation, backups, passkey registration |
| `ProfileService` | Manages profile caching and remote sync |
| `CollaboratorService` | Collaborator registry, capability grants, backups |
| `PlatformDatabase` | IndexedDB wrapper via Dexie |
| `crypto` | Encryption utilities (Ed25519, X25519, AES-GCM) |
| `encoding` | Base58/Base64 utilities |

## Key Features

- DID account creation (`createAccount`, `unlock`)
- Passkey support (WebAuthn) for passwordless login
- Encrypted backups with remote sync support
- Collaborator registry with capability grants
- Local-first architecture with optional remote syncing
- Modular design (import what you need)

## API Reference

### IdentityPlatform

```javascript
const platform = new IdentityPlatform({ remoteStorage });
await platform.init();

await platform.createAccount({ username, password });
await platform.unlock({ username, password });
platform.lock();

await platform.saveProfile(profile, { syncRemote: true });
const profile = await platform.getProfile(publicKey);
await platform.updateProfile(publicKey, updates);

await platform.addCollaborator({ publicKey, encryptionPublicKey, name });
await platform.removeCollaborator(collaboratorId);
const collaborators = await platform.listCollaborators();
```

### AccountService

```javascript
const accountService = new AccountService();

await accountService.createAccount({ username, password });
await accountService.unlock({ username, password });
accountService.lock();

const identity = accountService.getUnlockedIdentity();
const backupPayload = accountService.getBackupPayload();

const passkey = await accountService.registerPasskey({ displayName: 'MacBook Pro' });
await accountService.removePasskey(passkey.credentialId);
```

### ProfileService

```javascript
const profileService = new ProfileService(remoteStorage);

await profileService.saveProfile({ publicKey, displayName, avatar });
const profile = await profileService.getProfile(publicKey, {
  useCache: true,
  fetchRemote: true
});
await profileService.updateProfile(publicKey, { displayName: 'New Name' });
```

### CollaboratorService

```javascript
const collaboratorService = new CollaboratorService(profileService, accountService);

await collaboratorService.addCollaborator({
  publicKey: 'z8bob...',
  encryptionPublicKey: 'encryptionKey...',
  name: 'Bob'
});

const collaborators = await collaboratorService.listCollaborators();
await collaboratorService.syncCollaboratorProfiles();
```

### Remote Storage Interface

Implement your own remote storage by providing an object with these methods:

```javascript
const remoteStorage = {
  async upsertProfile(publicKey, profile) {},
  async loadProfile(publicKey) {},
  async saveIdentityBackup(publicKey, backup) {},
  async loadIdentityBackup(publicKey) {},
  async saveCollaboratorBackup(publicKey, payload) {},
  async loadCollaboratorBackup(publicKey) {},
};

const platform = new IdentityPlatform({ remoteStorage });
```

## Configuration

```javascript
import { SimpleStorage } from '../storage.js';
import { config } from '../config.js';

const storage = new SimpleStorage(config.filebase);

const platform = new IdentityPlatform({
  remoteStorage: storage,
});
```

## Sample Flow

```javascript
const platform = new IdentityPlatform({ remoteStorage });

await platform.init();

const account = await platform.createAccount({ username: 'alice', password: 'securePassword123!' });

await platform.saveProfile({
  publicKey: account.publicKey,
  displayName: 'Alice',
  avatar: 'https://avatars.dicebear.com/api/identicon/alice.svg',
});

await platform.addCollaborator({
  publicKey: 'z8bob...',
  encryptionPublicKey: 'encryptionKey...',
  name: 'Bob',
});
```

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

See `TODO.md` in the repository root for the active task list.

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
