# Identity Platform SDK - Architecture

## Overview

The Identity Platform SDK is a **layered, service-oriented architecture** designed to be the foundation for decentralized, encrypted applications.

```
┌─────────────────────────────────────────────────────────────────┐
│                        SDK PUBLIC API                            │
│                     (IdentityPlatform class)                     │
└────────────┬────────────────────────────────────────────────────┘
             │
             ├─────────────────────────────────────────────────────┐
             │                                                      │
    ┌────────▼────────┐  ┌────────────────┐  ┌─────────────────┐ │
    │ AccountService  │  │ ProfileService │  │ Collaborator    │ │
    │                 │  │                │  │ Service         │ │
    │ - Create        │  │ - Save         │  │ - Add/Remove    │ │
    │ - Unlock        │  │ - Update       │  │ - Search        │ │
    │ - Lock          │  │ - Cache        │  │ - Validate      │ │
    │ - Backup        │  │ - Sync         │  │ - Trust Network │ │
    └────────┬────────┘  └────────┬───────┘  └─────────┬───────┘ │
             │                    │                     │          │
             │                    │                     │          │
    ┌────────▼────────────────────▼─────────────────────▼───────┐ │
    │                  STORAGE LAYER                             │ │
    │                 (PlatformDatabase)                         │ │
    │                                                             │ │
    │  ┌─────────┐  ┌───────────┐  ┌─────────┐  ┌─────────┐   │ │
    │  │accounts │  │collabor-  │  │profiles │  │backups  │   │ │
    │  │         │  │ators      │  │         │  │         │   │ │
    │  └─────────┘  └───────────┘  └─────────┘  └─────────┘   │ │
    │                   IndexedDB (Dexie)                        │ │
    └─────────────────────────────────────────────────────────── │
             │                                                      │
    ┌────────▼────────────────────────────────────────────────┐ │
    │                     CORE MODULES                          │ │
    │                                                            │ │
    │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │ │
    │  │ DID         │  │ Crypto       │  │ Encoding       │  │ │
    │  │             │  │              │  │                │  │ │
    │  │ - Generate  │  │ - ECDH       │  │ - Base58       │  │ │
    │  │ - Validate  │  │ - AES-GCM    │  │ - Base64       │  │ │
    │  │ - Parse     │  │ - PBKDF2     │  │ - Bytes        │  │ │
    │  └─────────────┘  └──────────────┘  └────────────────┘  │ │
    └──────────────────────────────────────────────────────────┘ │
             │                                                      │
    ┌────────▼────────────────────────────────────────────────┐ │
    │             BROWSER APIS & DEPENDENCIES                   │ │
    │                                                            │ │
    │  - Web Crypto API (native)                                │ │
    │  - IndexedDB (native)                                     │ │
    │  - @noble/secp256k1 (external)                            │ │
    │  - @scure/base (external)                                 │ │
    │  - Dexie (external)                                       │ │
    └────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. **Separation of Concerns**
Each layer has a single, well-defined responsibility:
- **Core**: Low-level cryptography and DID operations
- **Storage**: Data persistence abstraction
- **Services**: Business logic for accounts, profiles, collaborators
- **Platform**: High-level orchestration and public API

### 2. **Dependency Injection**
Services accept dependencies via constructor:
```javascript
const profileService = new ProfileService(remoteStorage);
const collaboratorService = new CollaboratorService(profileService);
```

This enables:
- Easy testing with mocks
- Flexible storage backends
- Optional features (e.g., remote sync)

### 3. **Event-Driven Communication**
The platform emits events for state changes:
```javascript
platform.on('account-unlocked', (identity) => {
  // React to authentication
});
```

This enables:
- Loose coupling between app and SDK
- Multiple listeners per event
- Clean lifecycle management

### 4. **Stateless Services**
Services don't hold application state (except for caching):
- All persistent state goes in IndexedDB
- In-memory state limited to performance optimization
- Easy to serialize/deserialize

### 5. **Progressive Enhancement**
Features work with or without optional dependencies:
- Works without remote storage (local-only)
- Caching is optional
- Profile sync is opt-in

## Data Flow

### Account Creation Flow

```
User Input (username, password)
         │
         ▼
┌────────────────────┐
│ IdentityPlatform   │
│  .createAccount()  │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ AccountService     │
│  1. Validate input │
│  2. Generate keys  │ ──────> generateKeyPair() [DID.js]
│  3. Encrypt keys   │ ──────> encryptPrivateKey() [crypto.js]
│  4. Save account   │ ──────> saveAccount() [PlatformDatabase.js]
│  5. Save backup    │ ──────> saveBackup() [PlatformDatabase.js]
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ Return identity    │
│ {                  │
│   username,        │
│   did,             │
│   publicKey,       │
│   privateKey       │
│ }                  │
└────────────────────┘
         │
         ▼
   Emit 'account-created'
```

### Profile Sync Flow

```
User updates profile (displayName, avatar)
         │
         ▼
┌────────────────────┐
│ IdentityPlatform   │
│  .saveProfile()    │
└────────┬───────────┘
         │
         ▼
┌────────────────────────────┐
│ ProfileService             │
│  1. Validate publicKey     │
│  2. Save to local DB       │ ──> saveProfile() [PlatformDatabase.js]
│  3. Invalidate cache       │
│  4. Sync to remote?        │
│     ├─ Yes: Upload to S3   │ ──> remoteStorage.upsertProfile()
│     └─ No: Done            │
└────────┬───────────────────┘
         │
         ▼
   Emit 'profile-updated'
```

### Collaborator Discovery Flow

```
User shares document with Bob
         │
         ▼
Document metadata stored in S3
  └─> indexes/{bob-publicKey}.json
         │
         ▼
Bob unlocks his account
         │
         ▼
SDK syncs remote documents
  └─> Finds document owned by Alice
         │
         ▼
┌────────────────────────────┐
│ ProfileService             │
│  .ensureProfiles([Alice])  │
│  1. Check local DB         │ ──> getProfile(alice) [PlatformDatabase.js]
│  2. Not found? Fetch       │ ──> remoteStorage.loadProfile(alice)
│  3. Save to local DB       │ ──> saveProfile(alice) [PlatformDatabase.js]
│  4. Cache in memory        │
└────────────────────────────┘
         │
         ▼
UI displays "Alice Wonderland" instead of "z8mwaSF..."
```

## Security Model

### Key Storage

```
┌──────────────────────────────────────────────────┐
│ Private Key Storage (Encrypted at Rest)          │
├──────────────────────────────────────────────────┤
│                                                   │
│  User Password                                    │
│       │                                          │
│       ▼                                          │
│  PBKDF2 (600k iterations, random salt)           │
│       │                                          │
│       ▼                                          │
│  AES-256-GCM Key                                 │
│       │                                          │
│       ▼                                          │
│  Encrypt Private Key ──────> IndexedDB           │
│                                                   │
│  [Private key NEVER stored in plaintext]         │
│  [Only decrypted in memory when unlocked]        │
└──────────────────────────────────────────────────┘
```

### Authentication States

1. **Locked** (default)
   - No private key in memory
   - Cannot encrypt/decrypt
   - Cannot sign

2. **Unlocked**
   - Private key loaded in memory (as Uint8Array)
   - Can perform cryptographic operations
   - Auto-lock on page unload (future feature)

3. **Secured**
   - Memory cleared explicitly
   - User must re-authenticate

### Trust Model

```
┌─────────────────────────────────────────────┐
│ Collaborator Trust Levels                   │
├─────────────────────────────────────────────┤
│                                              │
│ 1. Trusted Collaborators                    │
│    - Manually added by user                 │
│    - Stored in `collaborators` table        │
│    - Can receive encrypted documents        │
│                                              │
│ 2. Known Profiles                            │
│    - Public profiles synced from S3         │
│    - Stored in `profiles` table             │
│    - NOT automatically trusted              │
│    - Used for display names only            │
│                                              │
│ 3. Unknown Public Keys                       │
│    - No local record                        │
│    - Display as truncated key               │
│    - Cannot interact until added            │
└─────────────────────────────────────────────┘
```

## Performance Optimizations

### 1. Profile Caching

```javascript
// In-memory LRU cache with TTL
cache: Map<publicKey, { profile, timestamp }>
TTL: 5 minutes

// Cache hit: O(1) lookup
// Cache miss: IndexedDB query + possible S3 fetch
```

### 2. Batch Profile Loading

```javascript
// Bad: N sequential queries
for (const key of publicKeys) {
  await getProfile(key);
}

// Good: Parallel batch fetch
await ensureProfiles(publicKeys);
// -> Promise.all() + bulk IndexedDB get
```

### 3. Lazy Loading

```javascript
// Services only load data when needed
// No startup penalty for large datasets
```

## Extensibility Points

### Custom Storage Backends

Implement this interface to add custom remote storage:

```javascript
interface RemoteStorage {
  async upsertProfile(publicKey, profile): Promise<void>
  async loadProfile(publicKey): Promise<Object|null>
  async saveAccountLookup(username, mapping): Promise<void>
  async loadAccountLookup(username): Promise<Object|null>
  async saveIdentityBackup(publicKey, backup): Promise<void>
  async loadIdentityBackup(publicKey): Promise<Object|null>
}
```

### Custom Event Handlers

```javascript
// Application-specific reactions to SDK events
platform.on('collaborator-added', async (collaborator) => {
  // Send welcome notification
  await sendEmail(collaborator.publicKey, 'Welcome!');
});
```

### Custom Validators

```javascript
// Override default validation (future feature)
class CustomAccountService extends AccountService {
  async createAccount({ username, password }) {
    // Add custom validation
    if (!this.isUsernameAllowed(username)) {
      throw new Error('Username reserved');
    }
    return super.createAccount({ username, password });
  }
}
```

## Comparison to Monolithic App

| Aspect | Monolithic App | SDK Architecture |
|--------|---------------|------------------|
| **File Count** | 1 (app.js = 856 lines) | 8 core modules |
| **Responsibility** | Mixed identity + documents | Separated concerns |
| **Reusability** | Zero | High (any app can use SDK) |
| **Testability** | Difficult | Easy (services isolated) |
| **Database** | Single DB for everything | Separated platform DB |
| **State Management** | Global variables | Service-based |
| **Event System** | Manual callbacks | Unified event emitter |
| **Extension** | Modify core code | Implement interfaces |

## Future Roadmap

### Phase 1: Core Stability
- [x] Account management
- [x] Profile system
- [x] Collaborator registry
- [x] Local database
- [ ] Unit tests (90%+ coverage)
- [ ] Integration tests

### Phase 2: Components
- [ ] `<account-gate>` - Login/signup UI
- [ ] `<identity-card>` - Identity display with QR
- [ ] `<profile-editor>` - Profile editing dialog
- [ ] `<collaborator-picker>` - Add collaborators with QR scan

### Phase 3: Remote Sync
- [ ] RemoteStorage abstraction
- [ ] Filebase S3 implementation
- [ ] Conflict resolution
- [ ] Offline queue

### Phase 4: Advanced Features
- [ ] Multi-device sync
- [ ] Account recovery
- [ ] Key rotation
- [ ] Rate limiting
- [ ] Audit logs

### Phase 5: Developer Experience
- [ ] TypeScript definitions
- [ ] React hooks
- [ ] Vue composables
- [ ] CLI tools
- [ ] Playground app

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## License

MIT
