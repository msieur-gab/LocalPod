# Quick Start: Unified User Files

## 🚀 What You Need to Know

### One File Per User
Your entire identity (public profile + encrypted backup) is now in **one file**:

**Location:** `s3://markdown-collab/users/{publicKey}.json`

**Example:** `https://misty-scarlet-lemming.myfilebase.com/ipfs/QmYYGzox4Ym5SeQrwohtCmB3YH28ZTTvKtuTzY6qkrHHkr`

---

## 📦 What's In The File?

```json
{
  "version": 1,
  "publicKey": "your-public-key",

  "public": {
    "username": "gabrielbaude",
    "displayName": "Gabriel Baude",
    "avatar": "data:image/png;base64,...",
    "bio": "Somewhere in between",
    "updatedAt": "2025-10-18T..."
  },

  "private": {
    "cipher": "encrypted-private-key",
    "iv": "...",
    "salt": "...",
    "iterations": 600000
  }
}
```

---

## 🎯 Key Features

### 1️⃣ **Auto-Discovery** (Just Paste Public Key!)

**Before:**
```javascript
await platform.addCollaborator({
  publicKey: 'z8alice...',
  name: 'Alice Smith'  // Had to provide name manually
});
```

**Now:**
```javascript
await platform.addCollaborator({
  publicKey: 'z8alice...'
  // Name, avatar, bio auto-fetched! ✨
});
```

### 2️⃣ **Account Recovery** (Lost Device? No Problem!)

1. Get new device
2. Click "Import Account"
3. Paste your public key
4. Enter your password
5. Done! Account restored with full profile

### 3️⃣ **Bio Field** (Tell Others About Yourself)

- Max 280 characters
- Shows in your identity card
- Visible to collaborators
- Synced to Filebase

---

## 🔐 Security

**Q: Is it safe to have public + private in one file?**

**A:** YES! The private section is encrypted:
- AES-256-GCM encryption
- 600,000 PBKDF2 iterations
- Password required to decrypt
- Even if someone downloads the file, it's useless without your password

**Q: What if someone guesses my password?**

**A:** The 600k iterations make brute-forcing extremely expensive:
- 1 billion attempts = ~46 days on modern GPU
- Use strong password (12+ chars, mixed case, symbols)

---

## 📝 Common Tasks

### Create Account (Auto-Sync to Filebase)
```javascript
const identity = await platform.createAccount({
  username: 'alice',
  password: 'myStrongPass123'
});
// ✅ Account created
// ✅ Profile synced to Filebase
// ✅ Backup synced to Filebase
```

### Update Profile (Auto-Sync)
```javascript
await platform.updateProfile(publicKey, {
  displayName: 'Alice Wonderland',
  bio: 'Web3 developer',
  avatar: 'data:image/png;base64,...'
}, { syncRemote: true });
// ✅ Public section updated on Filebase
// ✅ Private section unchanged
```

### Add Collaborator (Auto-Fetch)
```javascript
await platform.addCollaborator({
  publicKey: 'z8bob...'
});
// 🔍 Fetching profile from Filebase...
// ✅ Profile loaded: "Bob Smith", bio, avatar
```

### Import Account (Recovery)
```javascript
// In demo.js - handled automatically
// User just provides:
// - Public key (from backup)
// - Password (their original password)
// System handles the rest!
```

---

## 🛠️ Developer Notes

### Storage Methods

**Save unified file:**
```javascript
await remoteStorage.saveUnifiedUser(publicKey, {
  public: { username, displayName, avatar, bio },
  private: { cipher, iv, salt, iterations }
});
```

**Load unified file:**
```javascript
const userFile = await remoteStorage.loadUnifiedUser(publicKey);
console.log(userFile.public);    // Always readable
console.log(userFile.private);   // Needs decryption
```

### Backwards Compatibility

Old methods still work (they use the unified file internally):
- `upsertProfile()` - Updates public section
- `loadProfile()` - Returns public section
- `saveIdentityBackup()` - Updates private section
- `loadIdentityBackup()` - Returns private section

---

## ⚡ Performance

**Before:**
- 3 network requests (profile, backup, account mapping)
- 3 S3 operations
- Risk of inconsistency between files

**After:**
- 1 network request (unified file)
- 1 S3 operation
- Atomic updates (always consistent)

**Speed improvement:** ~3x faster for full user data fetch

---

## 🐛 Troubleshooting

### "Private section is null"
**Cause:** Account created with old code (before fix)

**Fix:** Create new account (backup now syncs automatically)

### "No backup found for this public key"
**Cause:** User file doesn't exist on Filebase

**Solution:** Check public key is correct, verify Filebase connection

### "Cannot decrypt private key"
**Cause:** Wrong password

**Solution:** Use the exact password from account creation

### "Remote storage not configured"
**Cause:** `config.js` missing or credentials invalid

**Solution:** Verify `config.js` has valid Filebase credentials

---

## 📚 Related Documentation

- `SESSION_SUMMARY.md` - Complete change log
- `DATA_STRUCTURES.md` - Detailed file format specs
- `sdk/EXAMPLES.md` - Code examples (see Example 11)
- `sdk/README.md` - SDK API reference

---

## ✅ Quick Test

**Test Auto-Discovery:**
1. Create account "alice" with bio
2. Copy your public key
3. Open incognito window
4. Create account "bob"
5. Add collaborator → Paste alice's public key
6. See alice's bio appear automatically! ✨

---

**That's it! You're ready to use unified user files.** 🎉
