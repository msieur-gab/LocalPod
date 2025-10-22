# LocalPod SDK - Security Update Migration Guide

This guide helps you migrate your application to use the enhanced security features in LocalPod SDK v1.0.0.

---

## Overview of Changes

### Breaking Changes

1. ⚠️ **Private keys no longer exposed** in `getUnlockedIdentity()`
2. ⚠️ **Password requirements strengthened** (12 chars minimum with complexity)
3. ℹ️ **Login attempts tracked** with exponential backoff

### New Features

1. ✅ Authenticated encryption with digital signatures
2. ✅ HKDF-based key derivation for ECDH
3. ✅ Brute force protection
4. ✅ Password strength validation

---

## Migration Steps

### Step 1: Update Password Creation Logic

**Before:**
```javascript
// Old code - 8 character minimum
try {
  await accountService.createAccount({
    username: 'alice',
    password: 'pass1234' // ❌ Too weak now
  });
} catch (error) {
  console.error(error.message);
}
```

**After:**
```javascript
// New code - 12 characters with complexity
try {
  await accountService.createAccount({
    username: 'alice',
    password: 'MySecure!Pass123' // ✅ Meets new requirements
  });
} catch (error) {
  // error.message contains detailed validation errors
  console.error(error.message);
  /*
  Password does not meet security requirements:
  - Password must be at least 12 characters long
  - Password must contain at least one uppercase letter
  - Password must contain at least one special character
  */
}
```

**UI Update Example:**
```javascript
// Add password validation in your form
function validatePassword(password) {
  const validation = accountService.validatePasswordStrength(password);

  if (!validation.valid) {
    // Display errors to user
    displayErrors(validation.errors);
    return false;
  }

  return true;
}

// In your form submit handler
if (!validatePassword(passwordInput.value)) {
  return; // Don't submit
}
```

---

### Step 2: Remove Private Key Usage from Application Code

**Before:**
```javascript
// ❌ Old code - directly accessing private key
const identity = accountService.getUnlockedIdentity();
const privateKeyBase64 = identity.privateKey; // undefined now!

// You might have been doing something like:
const decrypted = await decryptWithPrivateKey(data, privateKeyBase64);
```

**After:**
```javascript
// ✅ New code - use SDK's encryption functions instead
const identity = accountService.getUnlockedIdentity();
console.log(identity.did);        // ✅ Available
console.log(identity.publicKey);  // ✅ Available
console.log(identity.privateKey); // undefined (removed for security)

// Option 1: Use SDK's built-in encryption functions
const platform = new IdentityPlatform();
const { ciphertext, iv, signature } = await platform.encryptAndSignForRecipient(
  message,
  recipientPublicKey
);

// Option 2: If you absolutely need the private key (internal SDK development)
// This is NOT exposed in the public API - only for SDK internals
const privateKeyBytes = accountService.getPrivateKeyBytes(); // Internal use only
```

**Common Migration Scenarios:**

#### Scenario A: You were encrypting messages
```javascript
// Before
const identity = accountService.getUnlockedIdentity();
const encrypted = await customEncrypt(message, identity.privateKey);

// After - use SDK's authenticated encryption
const platform = new IdentityPlatform();
const { ciphertext, iv, signature } = await platform.encryptAndSignForRecipient(
  message,
  recipientPublicKey
);
```

#### Scenario B: You were signing data
```javascript
// Before
const identity = accountService.getUnlockedIdentity();
const signature = await customSign(data, identity.privateKey);

// After - use SDK's signing function
import { signMessage } from '@localPod/identity-platform';

// The SDK handles private key access internally
const signature = await signMessage(dataBytes, privateKeyBytes);
```

---

### Step 3: Update to Authenticated Encryption

**Before - Old Method (Confidentiality Only):**
```javascript
import { encryptForRecipient, decryptFromSender } from '@localPod/identity-platform';

// Sender
const { ciphertext, iv } = await encryptForRecipient(
  "Secret message",
  recipientPublicKey,
  myPrivateKey
);

// Send: { ciphertext, iv }

// Recipient
const plaintext = await decryptFromSender(
  ciphertext,
  iv,
  senderPublicKey,
  myPrivateKey
);
```

**After - New Method (Confidentiality + Authenticity):**
```javascript
import {
  encryptAndSignForRecipient,
  decryptAndVerifyFromSender
} from '@localPod/identity-platform';

// Sender
const { ciphertext, iv, signature } = await encryptAndSignForRecipient(
  "Secret message",
  recipientPublicKey,
  myPrivateKey
);

// Send: { ciphertext, iv, signature }

// Recipient (throws if signature invalid!)
try {
  const plaintext = await decryptAndVerifyFromSender(
    ciphertext,
    iv,
    signature,
    senderPublicKey,
    myPrivateKey
  );
  console.log('Message authenticated and decrypted:', plaintext);
} catch (error) {
  console.error('Message verification failed:', error.message);
  // This means the message was tampered with or from wrong sender!
}
```

**Benefits:**
- ✅ Prevents man-in-the-middle attacks
- ✅ Verifies sender authenticity
- ✅ Detects message tampering

---

### Step 4: Handle Login Lockouts

**Before:**
```javascript
// Old code - unlimited attempts
try {
  await accountService.unlock({ username, password });
} catch (error) {
  alert('Incorrect password');
}
```

**After:**
```javascript
// New code - handle lockouts
try {
  await accountService.unlock({ username, password });
  // Success!
} catch (error) {
  if (error.message.includes('Too many failed')) {
    // Extract wait time from error message
    const match = error.message.match(/(\d+) seconds/);
    const waitSeconds = match ? parseInt(match[1]) : 30;

    alert(`Account locked. Please wait ${waitSeconds} seconds before trying again.`);

    // Optional: Show countdown timer
    showLockoutCountdown(waitSeconds);
  } else {
    alert('Incorrect username or password');
  }
}
```

**UI Enhancement Example:**
```javascript
function showLockoutCountdown(seconds) {
  let remaining = seconds;
  const interval = setInterval(() => {
    document.getElementById('lockout-message').textContent =
      `Too many failed attempts. Try again in ${remaining} seconds...`;

    remaining--;
    if (remaining <= 0) {
      clearInterval(interval);
      document.getElementById('lockout-message').textContent = '';
    }
  }, 1000);
}
```

---

### Step 5: Update Database Schema (Automatic)

The database schema will be automatically upgraded when you load the SDK:

**New Table Added:**
```javascript
loginAttempts: {
  username: string,           // Primary key
  failedAttempts: number,     // Count of failures
  lastAttempt: ISO8601,       // Timestamp
  lockoutUntil: string | null // For future hard lockouts
}
```

**No manual migration needed** - Dexie handles this automatically.

---

## Testing Your Migration

### Test Checklist

- [ ] **Password creation works** with new requirements
- [ ] **Existing accounts can still unlock** (old passwords grandfathered)
- [ ] **New authenticated encryption functions** work correctly
- [ ] **Login lockouts trigger** after 3 failed attempts
- [ ] **Lockouts clear** after successful login
- [ ] **Private key no longer accessible** via `getUnlockedIdentity()`
- [ ] **UI shows password requirements** to users
- [ ] **Error handling** covers new error messages

### Sample Test Cases

```javascript
// Test 1: Password validation
describe('Password Validation', () => {
  it('should reject weak passwords', async () => {
    await expect(
      accountService.createAccount({
        username: 'test',
        password: 'weak'
      })
    ).rejects.toThrow('Password does not meet security requirements');
  });

  it('should accept strong passwords', async () => {
    const identity = await accountService.createAccount({
      username: 'test',
      password: 'StrongPass123!'
    });
    expect(identity.username).toBe('test');
  });
});

// Test 2: Authenticated encryption
describe('Authenticated Encryption', () => {
  it('should encrypt and verify messages', async () => {
    const message = 'Secret message';

    const { ciphertext, iv, signature } = await encryptAndSignForRecipient(
      message,
      bobPublicKey,
      alicePrivateKey
    );

    const decrypted = await decryptAndVerifyFromSender(
      ciphertext,
      iv,
      signature,
      alicePublicKey,
      bobPrivateKey
    );

    expect(decrypted).toBe(message);
  });

  it('should reject tampered messages', async () => {
    const { ciphertext, iv, signature } = await encryptAndSignForRecipient(
      'Original message',
      bobPublicKey,
      alicePrivateKey
    );

    // Tamper with ciphertext
    ciphertext[0] = ciphertext[0] ^ 0xFF;

    await expect(
      decryptAndVerifyFromSender(ciphertext, iv, signature, alicePublicKey, bobPrivateKey)
    ).rejects.toThrow('Signature verification failed');
  });
});

// Test 3: Brute force protection
describe('Brute Force Protection', () => {
  it('should lock account after 3 failed attempts', async () => {
    // Attempt 1
    await expect(
      accountService.unlock({ username: 'alice', password: 'wrong' })
    ).rejects.toThrow('Incorrect password');

    // Attempt 2
    await expect(
      accountService.unlock({ username: 'alice', password: 'wrong' })
    ).rejects.toThrow('Incorrect password');

    // Attempt 3
    await expect(
      accountService.unlock({ username: 'alice', password: 'wrong' })
    ).rejects.toThrow('Incorrect password');

    // Attempt 4 - should be locked
    await expect(
      accountService.unlock({ username: 'alice', password: 'correct' })
    ).rejects.toThrow('Too many failed login attempts');
  });
});
```

---

## Backward Compatibility

### Existing Accounts

**Good News:** Existing accounts with 8+ character passwords will continue to work!

- ✅ Old accounts can unlock with existing passwords
- ℹ️ New password requirements only apply to new accounts
- 💡 Consider prompting users to upgrade their passwords

**Example Password Upgrade Flow:**
```javascript
async function promptPasswordUpgrade(username) {
  const modal = showModal({
    title: 'Strengthen Your Password',
    message: 'We recommend updating to a stronger password (12+ characters with complexity)',
    actions: ['Upgrade Now', 'Remind Me Later']
  });

  if (await modal.result === 'Upgrade Now') {
    const newPassword = await promptNewPassword();

    // Validate new password
    const validation = accountService.validatePasswordStrength(newPassword);
    if (!validation.valid) {
      alert('Password requirements:\n' + validation.errors.join('\n'));
      return;
    }

    // Change password (you'll need to implement this in SDK)
    await accountService.changePassword({ username, newPassword });
  }
}
```

---

## Common Issues and Solutions

### Issue 1: "Password does not meet security requirements"

**Cause:** New password requirements are stricter.

**Solution:**
```javascript
// Check password strength before submitting
const validation = accountService.validatePasswordStrength(password);
if (!validation.valid) {
  // Show specific errors to user
  showErrors(validation.errors);
}
```

---

### Issue 2: "Too many failed login attempts"

**Cause:** Brute force protection triggered after 3+ failed attempts.

**Solution:**
```javascript
// Wait for the lockout period (exponential backoff)
// 3 attempts: 1 second
// 4 attempts: 2 seconds
// 5 attempts: 4 seconds
// etc.

// Show countdown to user
if (error.message.includes('wait')) {
  const seconds = extractWaitTime(error.message);
  showLockoutCountdown(seconds);
}
```

---

### Issue 3: "Cannot read property 'privateKey' of ..."

**Cause:** Code trying to access removed `privateKey` property.

**Solution:**
```javascript
// Don't access private key directly
const identity = accountService.getUnlockedIdentity();
// identity.privateKey is now undefined

// Instead, use SDK functions that handle keys internally
const platform = new IdentityPlatform();
await platform.encryptForRecipient(...);
```

---

### Issue 4: Signature verification fails

**Cause:** Using old encryption function instead of new authenticated version.

**Solution:**
```javascript
// Make sure both sender and receiver use the new functions
// encryptAndSignForRecipient (sender)
// decryptAndVerifyFromSender (receiver)

// Don't mix old and new methods!
```

---

## Gradual Migration Strategy

If you can't migrate everything at once, follow this approach:

### Phase 1: Update Dependencies
```bash
npm install @localPod/identity-platform@latest
```

### Phase 2: Add Password Validation UI
- Add password strength indicator
- Display validation errors
- Guide users to create strong passwords

### Phase 3: Update Encryption (Non-Breaking)
- Keep old encryption for existing messages
- Use new authenticated encryption for new messages
- Both methods will work during transition

### Phase 4: Remove Private Key Usage
- Audit code for `identity.privateKey` usage
- Replace with SDK functions
- Test thoroughly

### Phase 5: Update Error Handling
- Handle new error messages
- Add lockout UI/UX
- Test failure scenarios

---

## Support

If you encounter issues during migration:

1. Check this migration guide
2. Review the [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) documentation
3. Open an issue on GitHub with:
   - Your current code snippet
   - Error message
   - Expected behavior

---

## Next Steps

After completing migration:

1. ✅ Test all authentication flows
2. ✅ Test encryption/decryption with new methods
3. ✅ Verify lockout behavior
4. ✅ Update user documentation
5. ✅ Deploy to staging environment
6. ✅ Monitor for errors
7. ✅ Deploy to production

---

**Last Updated:** 2025-10-22
**SDK Version:** 1.0.0
