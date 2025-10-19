# Identity Platform SDK - Quick Start

Get up and running in **5 minutes**.

## Prerequisites

- Modern browser with ES Modules support
- IndexedDB support
- Web Crypto API support

## Installation

### Option 1: Local Development

1. The SDK is already in your project at `./sdk/`
2. No build step required - uses native ES modules

### Option 2: With Import Maps (Recommended)

Add to your HTML:

```html
<script type="importmap">
{
  "imports": {
    "@localPod/identity-platform": "./sdk/index.js",
    "dexie": "https://cdn.jsdelivr.net/npm/dexie@3.2.3/+esm",
    "@noble/secp256k1": "https://cdn.jsdelivr.net/npm/@noble/secp256k1@2.1.0/+esm",
    "@scure/base": "https://cdn.jsdelivr.net/npm/@scure/base@1.1.1/+esm"
  }
}
</script>
```

## 5-Minute Tutorial

### Step 1: Create `test.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SDK Test</title>
</head>
<body>
  <h1>Identity Platform SDK Test</h1>
  <div id="output"></div>

  <script type="importmap">
  {
    "imports": {
      "@localPod/identity-platform": "./sdk/index.js",
      "dexie": "https://cdn.jsdelivr.net/npm/dexie@3.2.3/+esm",
      "@noble/secp256k1": "https://cdn.jsdelivr.net/npm/@noble/secp256k1@2.1.0/+esm",
      "@scure/base": "https://cdn.jsdelivr.net/npm/@scure/base@1.1.1/+esm"
    }
  }
  </script>

  <script type="module" src="./test.js"></script>
</body>
</html>
```

### Step 2: Create `test.js`

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';

async function main() {
  const output = document.getElementById('output');
  const log = (msg) => {
    output.innerHTML += `<p>${msg}</p>`;
    console.log(msg);
  };

  try {
    // Initialize platform
    log('Initializing SDK...');
    const platform = new IdentityPlatform();
    await platform.init();
    log('✅ SDK initialized');

    // Create account
    log('Creating account...');
    const identity = await platform.createAccount({
      username: 'testuser',
      password: 'securePassword123'
    });
    log(`✅ Account created: ${identity.username}`);
    log(`   DID: ${identity.did}`);
    log(`   Public Key: ${identity.publicKey.slice(0, 20)}...`);

    // Save profile
    log('Saving profile...');
    await platform.saveProfile({
      publicKey: identity.publicKey,
      displayName: 'Test User',
    });
    log('✅ Profile saved');

    // Get profile
    const profile = await platform.getProfile(identity.publicKey);
    log(`✅ Profile loaded: ${profile.displayName}`);

    // Add collaborator
    log('Adding collaborator...');
    await platform.addCollaborator({
      publicKey: 'z8mwaSFdummyKeyForTesting123456789',
      name: 'Alice'
    });
    log('✅ Collaborator added');

    // List all
    const collaborators = await platform.listCollaborators();
    log(`✅ Total collaborators: ${collaborators.length}`);

    // Stats
    const stats = await platform.getStats();
    log('📊 Platform Statistics:');
    log(`   Accounts: ${stats.accounts}`);
    log(`   Collaborators: ${stats.collaborators}`);
    log(`   Profiles: ${stats.profiles}`);

    log('🎉 All tests passed!');

  } catch (error) {
    log(`❌ Error: ${error.message}`);
    console.error(error);
  }
}

main();
```

### Step 3: Run It

```bash
# Start a local server (required for ES modules)
python3 -m http.server 8000

# Or use npx
npx http-server -p 8000

# Or use any other local server
```

Open browser: `http://localhost:8000/test.html`

**Expected output:**
```
Initializing SDK...
✅ SDK initialized
Creating account...
✅ Account created: testuser
   DID: did:key:z8mwaSF...
   Public Key: z8mwaSF...
✅ Profile saved
✅ Profile loaded: Test User
✅ Collaborator added
✅ Total collaborators: 1
📊 Platform Statistics:
   Accounts: 1
   Collaborators: 1
   Profiles: 1
🎉 All tests passed!
```

## Common Use Cases

### Use Case 1: Authentication Gate

```javascript
import { IdentityPlatform } from '@localPod/identity-platform';

const platform = new IdentityPlatform();
await platform.init();

// Check if user has accounts
const accounts = await platform.listAccounts();

if (accounts.length === 0) {
  // Show signup form
  showSignupForm();
} else {
  // Show login form
  showLoginForm(accounts);
}

async function handleSignup(username, password) {
  try {
    const identity = await platform.createAccount({ username, password });
    console.log('Signed up:', identity.username);
    onAuthenticated(identity);
  } catch (error) {
    console.error('Signup failed:', error.message);
  }
}

async function handleLogin(username, password) {
  try {
    const identity = await platform.unlock({ username, password });
    console.log('Logged in:', identity.username);
    onAuthenticated(identity);
  } catch (error) {
    console.error('Login failed:', error.message);
  }
}

function onAuthenticated(identity) {
  // Your app logic here
  loadUserData();
}
```

### Use Case 2: Profile Display

```javascript
// Get current user's profile
const identity = platform.getIdentity();
const profile = await platform.getProfile(identity.publicKey);

// Display in UI
document.getElementById('user-name').textContent =
  profile?.displayName || identity.username;

if (profile?.avatar) {
  document.getElementById('avatar').src = profile.avatar;
}
```

### Use Case 3: Collaborator Picker

```javascript
// List all collaborators for sharing
const collaborators = await platform.listCollaboratorsWithProfiles();

// Render UI
const picker = document.getElementById('collaborator-picker');
collaborators.forEach(collab => {
  const name = collab.profile?.displayName || collab.name;
  const option = document.createElement('option');
  option.value = collab.publicKey;
  option.textContent = name;
  picker.appendChild(option);
});
```

## Debugging

### Enable Verbose Logging

```javascript
// Add to top of your code
window.DEBUG_SDK = true;
```

### Check IndexedDB

1. Open DevTools → Application → IndexedDB
2. Look for database: `identityPlatform`
3. Inspect tables: `accounts`, `collaborators`, `profiles`, `backups`

### Common Errors

**Error: "Username already exists"**
- Solution: Choose different username or delete existing account
```javascript
await platform.deleteAccount('existingUsername');
```

**Error: "Password must be at least 8 characters"**
- Solution: Use longer password (12+ recommended)

**Error: "Identity is locked"**
- Solution: Unlock account first
```javascript
await platform.unlock({ username, password });
```

**Error: "Invalid public key"**
- Solution: Ensure public key is Base58-encoded secp256k1 key
```javascript
import { isValidPublicKey, base58ToBytes } from '@localPod/identity-platform';
const isValid = isValidPublicKey(base58ToBytes(publicKey));
```

## Next Steps

1. ✅ **You're ready!** - Start building your app
2. 📚 Read [README.md](./README.md) for full API reference
3. 💡 Browse [EXAMPLES.md](./EXAMPLES.md) for more patterns
4. 🏗️ Study [ARCHITECTURE.md](./ARCHITECTURE.md) to understand internals

## Help & Support

- **Issues**: Open a GitHub issue
- **Questions**: Check the examples first
- **Contributions**: PRs welcome!

---

**Happy Building! 🚀**
