# Identity Platform SDK - Examples

## Example 1: Simple Authentication

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';

async function main() {
  const platform = new IdentityPlatform();
  await platform.init();

  // Create account
  const identity = await platform.createAccount({
    username: 'alice',
    password: 'mySecurePassword123'
  });

  console.log('Created account:', identity.username);
  console.log('DID:', identity.did);
  console.log('Public Key:', identity.publicKey);

  // Lock account
  platform.lock();
  console.log('Locked:', !platform.isUnlocked());

  // Unlock account
  const unlocked = await platform.unlock({
    username: 'alice',
    password: 'mySecurePassword123'
  });

  console.log('Unlocked:', unlocked.username);
}

main();
```

## Example 2: Profile Management

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';

async function manageProfiles() {
  const platform = new IdentityPlatform();
  await platform.init();

  // Create and unlock account
  const identity = await platform.createAccount({
    username: 'bob',
    password: 'password123'
  });

  // Save profile with display name
  await platform.saveProfile({
    publicKey: identity.publicKey,
    displayName: 'Bob the Builder',
    avatar: null
  });

  // Update profile with avatar
  const avatarDataUri = 'data:image/png;base64,iVBORw0KGgo...';
  await platform.updateProfile(identity.publicKey, {
    avatar: avatarDataUri
  });

  // Get profile
  const profile = await platform.getProfile(identity.publicKey);
  console.log('Profile:', profile);
}

manageProfiles();
```

## Example 3: Collaborator Network (with Auto-Discovery!)

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';
import { SimpleStorage } from './storage'; // S3/Filebase client

async function buildNetwork() {
  // Initialize with remote storage for auto-discovery
  const remoteStorage = new SimpleStorage({
    accessKey: 'your-access-key',
    secretKey: 'your-secret-key',
    bucket: 'your-bucket'
  });

  const platform = new IdentityPlatform({ remoteStorage });
  await platform.init();

  // Create your account
  const alice = await platform.createAccount({
    username: 'alice',
    password: 'secret'
  });

  // Add collaborator by public key
  // 🎉 NEW: Profile is automatically fetched from remote storage!
  await platform.addCollaborator({
    publicKey: 'z8bobsPublicKeyFromQRCode...',
    name: 'Bob'  // Optional fallback name if remote profile not found
  });
  // The SDK automatically:
  // 1. Fetches Bob's unified user file from S3
  // 2. Extracts public section (displayName, avatar, bio)
  // 3. Caches it locally in IndexedDB
  // 4. Bob's real display name and avatar are now available!

  await platform.addCollaborator({
    publicKey: 'z8carolsPublicKey...',
    name: 'Carol'
  });

  // List all collaborators with profiles
  const collaborators = await platform.listCollaboratorsWithProfiles();

  for (const collab of collaborators) {
    console.log(`${collab.name} (${collab.publicKey})`);
    if (collab.profile) {
      console.log(`  Display Name: ${collab.profile.displayName}`);
      console.log(`  Avatar: ${collab.profile.avatar ? 'Yes' : 'No'}`);
      console.log(`  Bio: ${collab.profile.bio || 'N/A'}`);
    }
  }

  // Search collaborators
  const results = await platform.searchCollaborators('bob');
  console.log('Search results:', results);

  // Check if someone is trusted
  const isTrusted = await platform.isTrustedCollaborator('z8bobsPublicKey...');
  console.log('Bob is trusted:', isTrusted);
}

buildNetwork();
```

## Example 4: Event-Driven App

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';

class MyApp {
  constructor() {
    this.platform = new IdentityPlatform();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen for account events
    this.platform.on('account-created', (identity) => {
      console.log('New account created:', identity.username);
      this.showWelcomeMessage(identity);
    });

    this.platform.on('account-unlocked', (identity) => {
      console.log('Account unlocked:', identity.username);
      this.loadUserData(identity);
    });

    this.platform.on('account-locked', () => {
      console.log('Account locked');
      this.clearSensitiveData();
    });

    // Listen for profile events
    this.platform.on('profile-updated', (profile) => {
      console.log('Profile updated:', profile.displayName);
      this.refreshUI();
    });

    // Listen for collaborator events
    this.platform.on('collaborator-added', (collaborator) => {
      console.log('New collaborator:', collaborator.name);
      this.notifyNewConnection(collaborator);
    });
  }

  async init() {
    await this.platform.init();
  }

  showWelcomeMessage(identity) {
    alert(`Welcome, ${identity.username}!`);
  }

  loadUserData(identity) {
    // Load user-specific data
    console.log('Loading data for:', identity.publicKey);
  }

  clearSensitiveData() {
    // Clear any sensitive data from memory
    console.log('Clearing sensitive data...');
  }

  refreshUI() {
    // Update UI to reflect profile changes
    console.log('Refreshing UI...');
  }

  notifyNewConnection(collaborator) {
    // Show notification about new collaborator
    console.log(`${collaborator.name} added to your network!`);
  }
}

// Usage
const app = new MyApp();
app.init();
```

## Example 5: Multi-Account Management

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';

async function manageMultipleAccounts() {
  const platform = new IdentityPlatform();
  await platform.init();

  // Create multiple accounts
  await platform.createAccount({ username: 'alice', password: 'pass1' });
  platform.lock();

  await platform.createAccount({ username: 'bob', password: 'pass2' });
  platform.lock();

  await platform.createAccount({ username: 'carol', password: 'pass3' });
  platform.lock();

  // List all accounts
  const accounts = await platform.listAccounts();
  console.log('All accounts:', accounts.map(a => a.username));

  // Switch between accounts
  console.log('Unlocking Alice...');
  await platform.unlock({ username: 'alice', password: 'pass1' });
  console.log('Current:', platform.getIdentity().username);

  platform.lock();

  console.log('Unlocking Bob...');
  await platform.unlock({ username: 'bob', password: 'pass2' });
  console.log('Current:', platform.getIdentity().username);
}

manageMultipleAccounts();
```

## Example 6: Encryption for Collaborators

```javascript
import { IdentityPlatform, encryptForRecipient, decryptFromSender, base58ToBytes } from '@localPod/identity-platform';

async function encryptedMessaging() {
  const platform = new IdentityPlatform();
  await platform.init();

  // Alice creates account
  const alice = await platform.createAccount({
    username: 'alice',
    password: 'secret'
  });

  // Get Alice's keys as bytes
  const alicePrivateKey = base64ToBytes(alice.privateKey);
  const alicePublicKey = base58ToBytes(alice.publicKey);

  // Bob's public key (from QR code or collaborator list)
  const bobPublicKey = base58ToBytes('z8bobsPublicKey...');

  // Alice encrypts a message for Bob
  const message = 'Hello Bob, this is a secret message!';

  const { ciphertext, iv } = await encryptForRecipient(
    message,
    bobPublicKey,
    alicePrivateKey
  );

  console.log('Encrypted message:', {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv)
  });

  // Later, Bob can decrypt (if he has Alice's public key and his private key)
  // const decrypted = await decryptFromSender(ciphertext, iv, alicePublicKey, bobPrivateKey);
  // console.log('Decrypted:', decrypted);
}

encryptedMessaging();
```

## Example 7: Building a Document App

```javascript
import { IdentityPlatform, generateDocumentKey, encryptWithKey, importAesKey } from '@localPod/identity-platform';

class DocumentApp {
  constructor() {
    this.platform = new IdentityPlatform();
    this.documents = [];
  }

  async init() {
    await this.platform.init();

    // Check for existing accounts
    const accounts = await this.platform.listAccounts();

    if (accounts.length === 0) {
      // Show account creation UI
      this.showAccountGate();
    } else {
      // Show login UI
      this.showLoginGate();
    }
  }

  async createDocument(title, content) {
    const identity = this.platform.getIdentity();
    if (!identity) throw new Error('Not authenticated');

    // Generate document encryption key
    const docKey = generateDocumentKey();

    // Encrypt content
    const aesKey = await importAesKey(docKey);
    const { ciphertext, iv } = await encryptWithKey(
      aesKey,
      stringToBytes(content)
    );

    // Get collaborators
    const collaborators = await this.platform.listCollaborators();

    // Wrap document key for owner + collaborators
    const recipients = [identity.publicKey, ...collaborators.map(c => c.publicKey)];

    // TODO: Wrap docKey for each recipient using ECDH

    const document = {
      id: crypto.randomUUID(),
      title,
      ciphertext: bytesToBase64(ciphertext),
      iv: bytesToBase64(iv),
      ownerPublicKey: identity.publicKey,
      collaborators: recipients,
      createdAt: new Date().toISOString()
    };

    this.documents.push(document);
    return document;
  }

  async shareDocument(docId, newCollaboratorPublicKey) {
    // Add collaborator to platform
    await this.platform.addCollaborator({
      publicKey: newCollaboratorPublicKey,
      name: 'New Collaborator'
    });

    // Re-encrypt document with new recipient
    // TODO: Wrap document key for new collaborator
  }

  showAccountGate() {
    console.log('Please create an account');
  }

  showLoginGate() {
    console.log('Please log in');
  }
}

// Usage
const app = new DocumentApp();
app.init();
```

## Example 8: Platform Statistics

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';

async function showStats() {
  const platform = new IdentityPlatform();
  await platform.init();

  // Create some test data
  await platform.createAccount({ username: 'alice', password: 'pass1' });
  await platform.addCollaborator({ publicKey: 'z8bob...', name: 'Bob' });
  await platform.saveProfile({ publicKey: 'z8bob...', displayName: 'Bob Smith' });

  // Get statistics
  const stats = await platform.getStats();

  console.log('Platform Statistics:');
  console.log('  Accounts:', stats.accounts);
  console.log('  Collaborators:', stats.collaborators);
  console.log('  Profiles:', stats.profiles);
  console.log('  Unlocked:', stats.unlocked);
  console.log('  Cache Stats:', stats.cacheStats);
}

showStats();
```

## Example 9: Error Handling

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';

async function handleErrors() {
  const platform = new IdentityPlatform();
  await platform.init();

  try {
    // Try to create account with weak password
    await platform.createAccount({
      username: 'alice',
      password: 'weak'
    });
  } catch (error) {
    console.error('Account creation failed:', error.message);
    // "Password must be at least 8 characters"
  }

  try {
    // Try to create duplicate username
    await platform.createAccount({ username: 'alice', password: 'strongpass123' });
    await platform.createAccount({ username: 'alice', password: 'anotherpass' });
  } catch (error) {
    console.error('Duplicate username:', error.message);
    // "Username already exists. Choose another."
  }

  try {
    // Try to unlock with wrong password
    await platform.unlock({ username: 'alice', password: 'wrongpassword' });
  } catch (error) {
    console.error('Unlock failed:', error.message);
    // "Incorrect password"
  }

  try {
    // Try to add invalid collaborator
    await platform.addCollaborator({
      publicKey: 'invalid-key',
      name: 'Bob'
    });
  } catch (error) {
    console.error('Invalid collaborator:', error.message);
    // "Invalid public key: ..."
  }
}

handleErrors();
```

## Example 10: Custom Storage Integration

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';

// Custom remote storage implementation
class MyCustomStorage {
  async upsertProfile(publicKey, profile) {
    // Upload to your backend
    await fetch(`/api/profiles/${publicKey}`, {
      method: 'PUT',
      body: JSON.stringify(profile)
    });
  }

  async loadProfile(publicKey) {
    const response = await fetch(`/api/profiles/${publicKey}`);
    if (!response.ok) return null;
    return response.json();
  }
}

async function withCustomStorage() {
  const storage = new MyCustomStorage();

  const platform = new IdentityPlatform({
    remoteStorage: storage
  });

  await platform.init();

  // Create account
  const identity = await platform.createAccount({
    username: 'alice',
    password: 'secret'
  });

  // Save profile with remote sync
  await platform.saveProfile({
    publicKey: identity.publicKey,
    displayName: 'Alice'
  }, { syncRemote: true });  // Will use MyCustomStorage

  console.log('Profile synced to custom backend');
}

withCustomStorage();
```

## Example 11: Working with Unified User Files

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';
import { SimpleStorage } from './storage';

async function unifiedUserFileDemo() {
  // Setup remote storage
  const remoteStorage = new SimpleStorage({
    accessKey: 'your-access-key',
    secretKey: 'your-secret-key',
    bucket: 'your-bucket'
  });

  const platform = new IdentityPlatform({ remoteStorage });
  await platform.init();

  // 1. Create account (automatically creates unified user file)
  const alice = await platform.createAccount({
    username: 'alice',
    password: 'myStrongPassword123'
  });

  // 2. Update public profile (updates public section only)
  await platform.saveProfile({
    publicKey: alice.publicKey,
    displayName: 'Alice Wonderland',
    bio: 'Web3 developer and privacy advocate',
    avatar: 'data:image/png;base64,...'
  }, { syncRemote: true });

  console.log('✅ Unified user file created at:');
  console.log(`s3://bucket/users/${alice.publicKey}.json`);

  // 3. The unified file now contains:
  // {
  //   "version": 1,
  //   "publicKey": "z8alice...",
  //   "public": {
  //     "username": "alice",
  //     "displayName": "Alice Wonderland",
  //     "avatar": "data:image/png;base64,...",
  //     "bio": "Web3 developer and privacy advocate",
  //     "updatedAt": "2025-10-18T..."
  //   },
  //   "private": {
  //     "cipher": "encrypted_private_key...",
  //     "iv": "...",
  //     "salt": "...",
  //     "iterations": 600000
  //   }
  // }

  // 4. Anyone can fetch the PUBLIC section by knowing the publicKey
  // (No password required for public data)
  const publicProfile = await platform.getProfile(alice.publicKey, {
    fetchRemote: true
  });

  console.log('Public profile accessible to all:');
  console.log('- Username:', publicProfile.username);
  console.log('- Display Name:', publicProfile.displayName);
  console.log('- Bio:', publicProfile.bio);
  console.log('- Has Avatar:', !!publicProfile.avatar);

  // 5. PRIVATE section requires password
  // When Bob adds Alice as a collaborator:
  platform.lock(); // Lock Alice's account

  // Simulate Bob's perspective
  const bob = await platform.createAccount({
    username: 'bob',
    password: 'bobsPassword456'
  });

  // Bob adds Alice by her public key
  await platform.addCollaborator({
    publicKey: alice.publicKey
    // No need to provide name - it's fetched automatically!
  });

  // The SDK automatically:
  // 1. Fetched s3://bucket/users/z8alice.json
  // 2. Extracted public section (username, displayName, avatar, bio)
  // 3. Ignored private section (Bob doesn't have Alice's password)
  // 4. Cached profile locally for fast access

  const collaborators = await platform.listCollaboratorsWithProfiles();
  const aliceAsCollab = collaborators.find(c => c.publicKey === alice.publicKey);

  console.log('\\n✅ Alice auto-discovered by Bob:');
  console.log('- Display Name:', aliceAsCollab.profile.displayName);
  console.log('- Bio:', aliceAsCollab.profile.bio);
  console.log('- Avatar:', aliceAsCollab.profile.avatar ? 'Loaded' : 'None');

  // 6. Account recovery (requires password)
  platform.lock();

  // Alice can recover her account from any device
  await platform.importAccountFromBackup({
    username: 'alice-recovered',
    password: 'myStrongPassword123', // Correct password needed!
    backup: {
      // SDK fetches from unified file's private section
      publicKey: alice.publicKey
    }
  });

  console.log('\\n✅ Account recovered from unified user file!');
}

unifiedUserFileDemo();
```

## Key Benefits of Unified User Files

### 🚀 **Automatic Profile Discovery**
When you add a collaborator by their public key, their profile (name, avatar, bio) is automatically fetched and displayed. No manual steps needed!

### 🔒 **Security Without Compromise**
- **Public data** is unencrypted but non-sensitive (username, display name, avatar, bio)
- **Private data** is AES-256-GCM encrypted with 600,000 PBKDF2 iterations
- Password required to decrypt private section
- Same security as local-only encryption

### ⚡ **Performance**
- **One network request** gets both public profile AND encrypted backup
- **Atomic updates** - public and private data stay in sync
- **Efficient caching** - local IndexedDB cache prevents redundant fetches

### 🌐 **Decentralized & Self-Sovereign**
- **No central server** - files stored on S3/IPFS/your choice
- **You own your data** - you control the encryption keys
- **Portable** - recover account from any device with password

### 🧩 **Simpler Architecture**
Replaces 3 separate files with 1 unified file:
- ~~`profiles/{publicKey}.json`~~ → Merged into `users/{publicKey}.json`
- ~~`backups/{publicKey}.json`~~ → Merged into `users/{publicKey}.json`
- `accounts/{username}.json` → Lightweight index only (still separate)

---

**See [DATA_STRUCTURES.md](../DATA_STRUCTURES.md) for complete technical documentation of the unified user file format.**
```
