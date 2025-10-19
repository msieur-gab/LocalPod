# Identity Platform SDK - Demo Application

## Quick Start

### Step 1: Start Local Server

The demo requires a local server to handle ES modules. Choose one:

```bash
# Option 1: Python
python3 -m http.server 8000

# Option 2: Node.js
npx http-server -p 8000

# Option 3: PHP
php -S localhost:8000
```

### Step 2: Open in Browser

Navigate to: **http://localhost:8000/demo.html**

### Step 3: Try It Out!

Follow the guided tour below to test all SDK features.

---

## Feature Tour

### 1️⃣ Create Your First Account

1. Click **"Create Account"** button
2. Enter username: `alice`
3. Enter password: `securePassword123` (minimum 8 characters)
4. Confirm password
5. Click **"Create Account"**

✅ **Success!** You should see:
- Your identity card with DID and public key
- Statistics showing 1 account
- Empty collaborators list

### 2️⃣ Copy Your Public Key

1. Click **"Copy Public Key"** button
2. You'll see a success toast notification
3. Your public key is now in your clipboard

💡 **Tip**: You can paste this into a text file to simulate sharing with another user.

### 3️⃣ Lock and Unlock Your Account

1. Click **"Lock Account"**
2. You're taken back to the login screen
3. Select your username from the dropdown
4. Enter your password
5. Click **"Unlock Account"**

✅ **Success!** You're logged back in.

### 4️⃣ Create a Second Account (Simulate Another User)

1. Lock your first account
2. Click **"Create Account"** again
3. Create account with username: `bob` and password: `bobPassword123`
4. Click **"Copy Public Key"** to copy Bob's public key
5. Save Bob's public key somewhere (you'll need it next)

### 5️⃣ Add Bob as Alice's Collaborator

1. Lock Bob's account
2. Log back in as Alice (`alice` / `securePassword123`)
3. Click **"+ Add Collaborator"**
4. Enter display name: `Bob`
5. Paste Bob's public key in the textarea
6. Click **"Add Collaborator"**

✅ **Success!** You should see:
- Bob appears in your collaborators list
- Statistics show 1 collaborator
- You can copy Bob's key from the collaborator card

### 6️⃣ Add Alice as Bob's Collaborator

1. Lock Alice's account
2. Log in as Bob
3. Click **"+ Add Collaborator"**
4. Enter display name: `Alice`
5. Paste Alice's public key (you saved it earlier, or create a 3rd account to get it)
6. Click **"Add Collaborator"**

✅ **Success!** Both users now have each other as collaborators!

---

## Testing Scenarios

### Scenario 1: Multi-Account Management

Create multiple accounts and switch between them:

```
1. Create: alice, bob, carol
2. Lock each after creation
3. See all 3 in the login dropdown
4. Switch between accounts
```

### Scenario 2: Collaborator Network

Build a network of collaborators:

```
1. Alice adds Bob and Carol
2. Bob adds Alice and Carol
3. Carol adds Alice and Bob
4. Everyone can see their network
```

### Scenario 3: Error Handling

Try these intentional errors to test validation:

**Weak Password:**
- Username: `test`
- Password: `weak` ❌ (less than 8 characters)
- Expected: Error message

**Duplicate Username:**
- Create account: `alice`
- Try to create another: `alice` ❌
- Expected: "Username already exists" error

**Wrong Password:**
- Try to unlock Alice with wrong password ❌
- Expected: "Incorrect password" error

**Invalid Public Key:**
- Try to add collaborator with key: `invalid-key-123` ❌
- Expected: "Invalid public key" error

### Scenario 4: Statistics Tracking

Watch the statistics update:

```
Initial:
- Accounts: 1
- Collaborators: 0
- Profiles: 0

After adding 2 collaborators:
- Accounts: 1
- Collaborators: 2
- Profiles: 2

After creating 2 more accounts:
- Accounts: 3
- Collaborators: 2 (per account)
- Profiles: varies
```

---

## Features Demonstrated

### ✅ Account Management
- [x] Create account with username & password
- [x] List existing accounts
- [x] Unlock account
- [x] Lock account
- [x] Multi-account support

### ✅ Identity Features
- [x] DID generation (did:key method)
- [x] Public key display and copy
- [x] secp256k1 keypair generation
- [x] PBKDF2 password encryption (600k iterations)

### ✅ Collaborator Management
- [x] Add collaborator by public key
- [x] Display collaborator list
- [x] Show collaborator profiles
- [x] Copy collaborator public keys
- [x] Validate public key format

### ✅ Profile System
- [x] Automatic profile creation
- [x] Display names for collaborators
- [x] Profile caching

### ✅ Storage
- [x] IndexedDB persistence (via Dexie)
- [x] Separate database namespace (`identityPlatform`)
- [x] Account, collaborator, profile tables

### ✅ Security
- [x] Private key encryption
- [x] Password validation
- [x] Public key validation
- [x] Secure session management

---

## Browser Developer Tools

### Check IndexedDB

1. Open DevTools (F12)
2. Go to **Application** → **Storage** → **IndexedDB**
3. Expand `identityPlatform` database
4. Inspect tables:
   - **accounts**: See encrypted private keys
   - **collaborators**: See added collaborators
   - **profiles**: See profile data
   - **backups**: See key backups

### Check Console Logs

The demo logs all operations:

```
✅ SDK initialized
Found 0 accounts
Creating account for: alice
✅ Account created
Adding collaborator: Bob
✅ Collaborator added
```

---

## UI Features

### Responsive Design
- Desktop: Full multi-column layout
- Tablet: Adjusted grid
- Mobile: Single column, stacked buttons

### Visual Feedback
- **Toast notifications** for actions (green = success, red = error)
- **Loading states** during async operations
- **Hover effects** on interactive elements
- **Validation errors** inline with forms

### Dark Theme
- Modern dark color scheme
- High contrast for readability
- Gradient accents for visual interest

---

## Next Steps

After exploring the demo, you can:

1. **Read the SDK docs**: See `sdk/README.md` for full API
2. **Build your own app**: Use this as a template
3. **Integrate remote storage**: Add Filebase sync
4. **Add more features**: Profiles with avatars, QR codes, etc.

---

## Troubleshooting

### Problem: "Failed to initialize SDK"

**Check:**
- Is the server running?
- Are you accessing via `http://localhost:8000`?
- Open browser console for errors

### Problem: Import map errors

**Solution:**
- Ensure your browser supports import maps
- Chrome 89+, Firefox 108+, Safari 16.4+
- Update to latest browser version

### Problem: Public key validation fails

**Check:**
- Public key starts with `z`
- No extra spaces or line breaks
- Copied entire key string

### Problem: Can't copy to clipboard

**Check:**
- Are you on HTTPS or localhost? (Required for clipboard API)
- Browser permissions for clipboard access
- Try manual copy: Ctrl+C / Cmd+C

---

## Code Overview

### File Structure

```
demo.html      # UI markup with forms and sections
demo.js        # Application logic using SDK
demo.css       # Styling and responsive design
sdk/           # Identity Platform SDK
```

### Key Functions in demo.js

| Function | Purpose |
|----------|---------|
| `init()` | Initialize SDK and check for accounts |
| `handleLogin()` | Unlock existing account |
| `handleSignup()` | Create new account |
| `handleAddCollaborator()` | Add new collaborator |
| `renderIdentity()` | Display user identity card |
| `renderCollaborators()` | Display collaborator list |
| `renderStats()` | Display platform statistics |

### SDK Usage Examples

```javascript
// Initialize
const platform = new IdentityPlatform();
await platform.init();

// Create account
const identity = await platform.createAccount({ username, password });

// Unlock account
const identity = await platform.unlock({ username, password });

// Add collaborator
await platform.addCollaborator({ publicKey, name });

// List collaborators
const collaborators = await platform.listCollaboratorsWithProfiles();

// Get statistics
const stats = await platform.getStats();
```

---

## Performance Notes

### Account Creation/Unlock
- Takes ~500ms due to PBKDF2 (600,000 iterations)
- This is intentional for security
- Normal and expected behavior

### Profile Caching
- First load: Fetches from IndexedDB (~10ms)
- Subsequent: Serves from cache (<1ms)
- Cache TTL: 5 minutes

### Database Operations
- All operations are async
- IndexedDB provides persistence across sessions
- No data loss on page refresh

---

## Security Notes

### What's Secure
- ✅ Private keys encrypted at rest (PBKDF2 600k iterations)
- ✅ Keys only in memory when unlocked
- ✅ Password never stored in plaintext
- ✅ Public key validation

### Demo Limitations
- ⚠️ No remote backup (local-only)
- ⚠️ No account recovery (password required)
- ⚠️ No multi-device sync
- ⚠️ Browser storage can be cleared

**For Production:**
- Implement remote backup (Filebase/S3)
- Add account recovery flow
- Enable multi-device sync
- Add export/import features

---

## Have Fun! 🎉

This demo showcases the core features of the Identity Platform SDK. Experiment, break things, and see how the SDK handles various scenarios!

**Questions?** Check the SDK documentation in `sdk/README.md`
