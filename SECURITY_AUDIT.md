# LocalPod SDK - Security Audit Report

**Date:** 2025-10-22
**Version:** 1.0.0
**Audited By:** Security Review

---

## Executive Summary

This document presents the findings of a comprehensive security audit of the LocalPod SDK, a privacy-focused decentralized identity platform. The audit identified several security vulnerabilities and implemented improvements to enhance the SDK's security posture.

### Key Findings

- ✅ **Good Foundation**: SDK already uses Web Crypto API for most cryptographic operations
- ⚠️ **Critical Issues Fixed**: Private key exposure and weak key derivation addressed
- ✅ **Enhanced Security**: Added authenticated encryption, stronger passwords, brute force protection
- ℹ️ **External Dependencies**: Minimal and necessary for Web3/DID compatibility

---

## Security Improvements Implemented

### 1. Enhanced Key Derivation with HKDF ✅

**Issue**: ECDH shared secrets were processed with simple SHA-256 hashing instead of proper key derivation.

**Fix**: Implemented HKDF (HMAC-based Key Derivation Function) using Web Crypto API.

**Location**: `sdk/src/core/crypto.js:156`

**Before:**
```javascript
const hashed = await crypto.subtle.digest('SHA-256', keyMaterial);
return crypto.subtle.importKey('raw', hashed, 'AES-GCM', false, ['encrypt', 'decrypt']);
```

**After:**
```javascript
const importedKey = await crypto.subtle.importKey('raw', keyMaterial, 'HKDF', false, ['deriveKey']);

return crypto.subtle.deriveKey(
  {
    name: 'HKDF',
    hash: 'SHA-256',
    salt,
    info,
  },
  importedKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt']
);
```

**Security Impact**: HKDF provides proper domain separation and context binding, preventing key reuse attacks.

---

### 2. Authenticated Encryption with Digital Signatures ✅

**Issue**: Peer-to-peer encryption provided confidentiality but not authenticity. Recipients couldn't verify message origin.

**Fix**: Added signing/verification functions for authenticated encryption.

**Location**: `sdk/src/core/crypto.js:214-297`

**New Functions:**
- `signMessage(messageBytes, privateKeyBytes)` - Sign messages with ECDSA
- `verifySignature(signature, messageBytes, publicKeyBytes)` - Verify signatures
- `encryptAndSignForRecipient(text, recipientPublicKey, senderPrivateKey)` - Encrypt + Sign
- `decryptAndVerifyFromSender(ciphertext, iv, signature, senderPublicKey, recipientPrivateKey)` - Decrypt + Verify

**Usage Example:**
```javascript
// Sender
const { ciphertext, iv, signature } = await encryptAndSignForRecipient(
  "Secret message",
  recipientPublicKey,
  myPrivateKey
);

// Recipient (throws if signature invalid)
const plaintext = await decryptAndVerifyFromSender(
  ciphertext,
  iv,
  signature,
  senderPublicKey,
  myPrivateKey
);
```

**Security Impact**: Prevents man-in-the-middle attacks and message tampering.

---

### 3. Private Key Exposure Prevention ✅

**Issue**: `getUnlockedIdentity()` returned private key as base64 string, risking accidental logging or serialization.

**Fix**: Removed private key from public API. Added internal-only accessor.

**Location**: `sdk/src/services/AccountService.js:52-82`

**Before:**
```javascript
getUnlockedIdentity() {
  return {
    did,
    publicKey: bytesToBase58(publicKey),
    privateKey: bytesToBase64(privateKey), // ❌ EXPOSED!
    username,
    createdAt,
  };
}
```

**After:**
```javascript
getUnlockedIdentity() {
  return {
    did,
    publicKey: bytesToBase58(publicKey),
    // REMOVED: privateKey - never expose in API
    username,
    createdAt,
  };
}

// Internal use only
getPrivateKeyBytes() {
  return this.unlockedIdentity?.privateKey ?? null;
}
```

**Security Impact**: Eliminates accidental private key leakage via logging, debugging, or API responses.

---

### 4. Stronger Password Requirements ✅

**Issue**: Minimum 8-character passwords insufficient for 2024 security standards.

**Fix**: Implemented comprehensive password validation.

**Location**: `sdk/src/services/AccountService.js:92-147`

**New Requirements:**
- ✅ Minimum 12 characters (increased from 8)
- ✅ At least one lowercase letter
- ✅ At least one uppercase letter
- ✅ At least one number
- ✅ At least one special character

**Implementation:**
```javascript
validatePasswordStrength(password) {
  const errors = [];
  if (password.length < 12) errors.push('Password must be at least 12 characters long');
  if (!/[a-z]/.test(password)) errors.push('Password must contain lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain number');
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push('Password must contain special character');
  return { valid: errors.length === 0, errors };
}
```

**Security Impact**: Significantly increases password entropy and resistance to brute force attacks.

---

### 5. Brute Force Protection with Exponential Backoff ✅

**Issue**: `unlock()` had no rate limiting, allowing unlimited password guessing.

**Fix**: Implemented exponential backoff with attempt tracking.

**Location**:
- `sdk/src/storage/PlatformDatabase.js:301-374` (tracking functions)
- `sdk/src/services/AccountService.js:211-259` (unlock protection)

**Lockout Schedule:**
| Attempts | Wait Time |
|----------|-----------|
| 1-2      | No delay  |
| 3        | 1 second  |
| 4        | 2 seconds |
| 5        | 4 seconds |
| 6        | 8 seconds |
| 7        | 16 seconds|
| 8+       | 32 seconds|

**Implementation:**
```javascript
// Before unlock attempt
const lockStatus = await checkLoginLockout(username);
if (lockStatus.locked) {
  throw new Error(`Too many failed attempts. Wait ${lockStatus.waitSeconds}s`);
}

// After failed attempt
await recordFailedLogin(username);

// After successful unlock
await clearLoginAttempts(username);
```

**Security Impact**: Prevents automated brute force attacks while maintaining usability.

---

## Cryptographic Architecture

### Current Implementation

| Component | Algorithm | Implementation | Status |
|-----------|-----------|---------------|---------|
| **Password Hashing** | PBKDF2-SHA256 | Web Crypto API | ✅ Secure (600k iterations) |
| **Private Key Encryption** | AES-256-GCM | Web Crypto API | ✅ Secure |
| **Symmetric Encryption** | AES-256-GCM | Web Crypto API | ✅ Secure |
| **Key Agreement** | ECDH-secp256k1 | @noble/secp256k1 | ✅ Acceptable* |
| **Key Derivation** | HKDF-SHA256 | Web Crypto API | ✅ Secure (NEW) |
| **Digital Signatures** | ECDSA-secp256k1 | @noble/secp256k1 | ✅ Secure (NEW) |
| **Random Generation** | CSPRNG | crypto.getRandomValues() | ✅ Secure |

\* *secp256k1 chosen for Web3/DID compatibility; cannot use Web Crypto ECDH (P-256) without breaking DID standard*

### External Dependencies

```json
{
  "@noble/secp256k1": "^2.1.0",  // Elliptic curve crypto (secp256k1)
  "@scure/base": "^1.1.1",        // Base58 encoding (DID standard)
  "dexie": "^3.2.3"               // IndexedDB wrapper
}
```

**Security Assessment:**
- ✅ **@noble/secp256k1**: Well-audited, minimal, zero-dependency
- ✅ **@scure/base**: Minimal encoding library, no security concerns
- ✅ **dexie**: Quality-of-life improvement, no security impact

**Can we replace with Web Crypto API?**
- ❌ **secp256k1**: Web Crypto only supports P-256/P-384/P-521 curves
- ❌ **Base58**: No native browser support for Base58 encoding
- ✅ **IndexedDB**: Could use native API, but Dexie is acceptable

---

## Database Schema Updates

### New Table: `loginAttempts`

```javascript
{
  username: string,              // Primary key
  failedAttempts: number,        // Count of failed attempts
  lastAttempt: ISO8601 string,   // Timestamp of last attempt
  lockoutUntil: string | null    // Future: hard lockout support
}
```

**Indexes**: `username` (primary), `lastAttempt`

---

## Breaking Changes

### 1. `getUnlockedIdentity()` No Longer Returns Private Key

**Before:**
```javascript
const identity = accountService.getUnlockedIdentity();
console.log(identity.privateKey); // Base64 string
```

**After:**
```javascript
const identity = accountService.getUnlockedIdentity();
console.log(identity.privateKey); // undefined

// For internal SDK use only:
const privateKey = accountService.getPrivateKeyBytes(); // Uint8Array
```

**Migration**: If you were using the private key directly, refactor to use SDK's encryption functions instead.

---

### 2. Password Requirements Strengthened

**Before:** Minimum 8 characters, no complexity requirements

**After:**
- Minimum 12 characters
- Must contain: lowercase, uppercase, number, special character

**Migration**: Existing accounts are unaffected. New accounts must meet new requirements. Consider prompting users to update passwords.

---

### 3. Login Attempts Tracked

**Before:** Unlimited login attempts

**After:** Exponential backoff after 3 failed attempts

**Migration**: No code changes needed. Users experiencing lockouts should wait before retrying.

---

## Security Best Practices

### For SDK Users

1. **Never Log Private Keys or Passwords**
   ```javascript
   // ❌ DON'T
   console.log(password);
   console.log(accountService.getPrivateKeyBytes());

   // ✅ DO
   console.log('Authentication successful');
   ```

2. **Use Authenticated Encryption for P2P Messages**
   ```javascript
   // ❌ DON'T (old method - no authenticity)
   const { ciphertext, iv } = await encryptForRecipient(text, recipientPubKey, myPrivKey);

   // ✅ DO (new method - with signature)
   const { ciphertext, iv, signature } = await encryptAndSignForRecipient(
     text,
     recipientPubKey,
     myPrivKey
   );
   ```

3. **Lock Accounts When Not in Use**
   ```javascript
   // After completing operations
   accountService.lock();
   ```

4. **Validate Collaborator Public Keys**
   ```javascript
   const isValid = isValidPublicKey(publicKeyBytes);
   if (!isValid) throw new Error('Invalid public key');
   ```

5. **Use Strong Passwords**
   ```javascript
   // ❌ DON'T
   const password = 'password';

   // ✅ DO
   const password = 'MyS3cure!Pass@2024';
   ```

---

## Remaining Considerations

### 1. IndexedDB Accessibility

**Issue**: Encrypted private keys in IndexedDB can be read by any script on the same origin.

**Current Mitigation**: Private keys are encrypted with PBKDF2+AES-256-GCM before storage.

**Future Enhancement**: Consider using Web Crypto's non-extractable `CryptoKey` objects where possible.

### 2. XSS Attack Surface

**Issue**: Cross-site scripting could access unlocked identity in memory.

**Current Mitigation**:
- Content Security Policy (CSP) should be configured by application
- Private keys only in memory when unlocked
- Automatic locking on session end

**Recommendation**: Implement CSP in demo application:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'">
```

### 3. Password Recovery

**Issue**: No password recovery mechanism if user forgets password.

**Current Behavior**: Private key is permanently lost.

**Recommendation**: Consider adding:
- Recovery phrase (BIP39 mnemonic)
- Social recovery (Shamir's Secret Sharing)
- Trusted device backup

---

## Security Checklist for Deployment

- [ ] Configure Content Security Policy (CSP)
- [ ] Enable HTTPS only (no HTTP)
- [ ] Implement session timeout and auto-lock
- [ ] Add security headers (HSTS, X-Frame-Options, etc.)
- [ ] Audit third-party dependencies regularly
- [ ] Monitor for security advisories on @noble/secp256k1
- [ ] Implement rate limiting at application level
- [ ] Add logging for security events (failed logins, etc.)
- [ ] Regular security audits and penetration testing
- [ ] Educate users on password security

---

## Vulnerability Disclosure

If you discover a security vulnerability in LocalPod SDK, please report it to:

**Email**: security@localpod.dev
**PGP Key**: [To be added]

**Please DO NOT** disclose vulnerabilities publicly until a fix is available.

---

## Changelog

### Version 1.0.0 (2025-10-22) - Security Enhancements

**Added:**
- ✅ HKDF for ECDH key derivation
- ✅ Authenticated encryption with digital signatures
- ✅ Password strength validation (12 chars, complexity)
- ✅ Brute force protection with exponential backoff
- ✅ Login attempt tracking in database

**Changed:**
- ⚠️ BREAKING: Removed private key from `getUnlockedIdentity()` API
- ⚠️ BREAKING: Increased password requirements (12 chars minimum)
- Enhanced error messages for security failures

**Fixed:**
- 🔒 Private key exposure in public API
- 🔒 Weak key derivation from ECDH shared secrets
- 🔒 Missing message authentication in P2P encryption
- 🔒 Unlimited password guessing attempts

---

## References

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Web Crypto API Specification](https://www.w3.org/TR/WebCryptoAPI/)
- [NIST SP 800-108: Recommendation for Key Derivation](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-108.pdf)
- [RFC 5869: HMAC-based Extract-and-Expand Key Derivation Function (HKDF)](https://tools.ietf.org/html/rfc5869)
- [did:key Method Specification](https://w3c-ccg.github.io/did-method-key/)

---

## License

This security audit and documentation is part of the LocalPod SDK project and is released under the MIT License.
