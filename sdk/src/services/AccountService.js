/**
 * Account Service - Manages DID-based accounts, authentication, and key management
 * @module sdk/services/AccountService
 */

import { generateKeyPair, didFromPublicKey } from '../core/DID.js';
import {
  encryptPrivateKey,
  decryptPrivateKey,
  generateEncryptionKeyPair,
  getEncryptionPublicKey,
} from '../core/crypto.js';
import { bytesToBase58, base58ToBytes, bytesToBase64, base64ToBytes } from '../utils/encoding.js';
import {
  listAccounts,
  getAccount,
  getAccountByPublicKey,
  saveAccount,
  deleteAccount,
  saveBackup,
  getBackup,
  checkLoginLockout,
  recordFailedLogin,
  clearLoginAttempts,
  savePasskeyCredential,
  listPasskeyCredentials,
  deletePasskeyCredential,
} from '../storage/PlatformDatabase.js';
import { PasskeySession, isPasskeySupported } from '../core/PasskeySession.js';

/**
 * Account Service
 * Handles account creation, unlocking, and lifecycle management
 */
export class AccountService {
  constructor() {
    // Current unlocked identity (in-memory only)
    this.unlockedIdentity = null;
    this.currentAccountRecord = null;
  }

  /**
   * List all accounts
   * @returns {Promise<Array>}
   */
  async listAccounts() {
    return listAccounts();
  }

  /**
   * Check if an identity is currently unlocked
   * @returns {boolean}
   */
  isUnlocked() {
    return Boolean(this.unlockedIdentity);
  }

  /**
   * Get the currently unlocked identity (safe copy)
   * SECURITY: Does NOT expose private key to prevent accidental leakage
   * Use getPrivateKeyBytes() internally when needed for crypto operations
   * @returns {Object|null}
   */
  getUnlockedIdentity() {
    if (!this.unlockedIdentity) return null;

    const {
      did,
      signingPublicKey,
      encryptionPublicKey,
      username,
      createdAt,
    } = this.unlockedIdentity;

    return {
      did,
      publicKey: bytesToBase58(signingPublicKey),
      signingPublicKey: bytesToBase58(signingPublicKey),
      encryptionPublicKey: encryptionPublicKey ? bytesToBase58(encryptionPublicKey) : null,
      username,
      createdAt,
    };
  }

  /**
   * Get private key bytes for internal cryptographic operations
   * SECURITY: Only for internal use by SDK methods
   * @returns {Uint8Array|null} Private key bytes or null if locked
   * @private
   */
  getPrivateKeyBytes() {
    return this.unlockedIdentity?.signingPrivateKey ?? null;
  }

  /**
   * Get signing private key bytes (alias for getPrivateKeyBytes)
   * @returns {Uint8Array|null}
   */
  getSigningPrivateKeyBytes() {
    return this.getPrivateKeyBytes();
  }

  /**
   * Get encryption private key bytes for ECDH operations
   * @returns {Uint8Array|null}
   */
  getEncryptionPrivateKeyBytes() {
    return this.unlockedIdentity?.encryptionPrivateKey ?? null;
  }

  /**
   * Get public key bytes for cryptographic operations
   * @returns {Uint8Array|null} Public key bytes or null if locked
   */
  getPublicKeyBytes() {
    return this.unlockedIdentity?.signingPublicKey ?? null;
  }

  /**
   * Get encryption public key bytes
   * @returns {Uint8Array|null}
   */
  getEncryptionPublicKeyBytes() {
    return this.unlockedIdentity?.encryptionPublicKey ?? null;
  }

  /**
   * Get current account record
   * @returns {Object|null}
   */
  getCurrentAccount() {
    return this.currentAccountRecord ? { ...this.currentAccountRecord } : null;
  }

  /**
   * Validate password strength
   * @param {string} password
   * @returns {{valid: boolean, errors: string[]}}
   */
  validatePasswordStrength(password) {
    const errors = [];

    if (password.length < 12) {
      errors.push('Password must be at least 12 characters long');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[^a-zA-Z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create a new DID-based account
   * @param {Object} params
   * @param {string} params.username - Unique username
   * @param {string} params.password - Password for encryption (min 12 chars with complexity)
   * @returns {Promise<Object>} Unlocked identity
   * @throws {Error} If username exists or validation fails
   */
  async createAccount({ username, password }) {
    const normalized = username?.trim();

    if (!normalized || !password) {
      throw new Error('Username and password are required');
    }

    // Enhanced password validation
    const passwordValidation = this.validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      throw new Error(
        'Password does not meet security requirements:\n' + passwordValidation.errors.join('\n')
      );
    }

    // Check if username already exists
    const existing = await getAccount(normalized);
    if (existing) {
      throw new Error('Username already exists. Choose another.');
    }

    // Generate signing (Ed25519) and encryption (X25519) key material
    const { privateKey: signingPrivateKey, publicKey: signingPublicKey } = generateKeyPair();
    const {
      privateKey: encryptionPrivateKey,
      publicKey: encryptionPublicKey,
    } = generateEncryptionKeyPair();

    const did = didFromPublicKey(signingPublicKey);
    const now = new Date().toISOString();

    // Encrypt private keys with password
    const encryptedSigningKey = await encryptPrivateKey(signingPrivateKey, password);
    const encryptedEncryptionKey = await encryptPrivateKey(encryptionPrivateKey, password);

    // Save account to database
    const accountRecord = await saveAccount({
      username: normalized,
      did,
      publicKey: bytesToBase58(signingPublicKey),
      encryptionPublicKey: bytesToBase58(encryptionPublicKey),
      createdAt: now,
      encryptedPrivateKey: bytesToBase64(encryptedSigningKey.encryptedPrivateKey),
      encryptionIv: bytesToBase64(encryptedSigningKey.encryptionIv),
      salt: bytesToBase64(encryptedSigningKey.salt),
      iterations: encryptedSigningKey.iterations,
      encryptedEncryptionKey: bytesToBase64(encryptedEncryptionKey.encryptedPrivateKey),
      encryptionKeyIv: bytesToBase64(encryptedEncryptionKey.encryptionIv),
      encryptionSalt: bytesToBase64(encryptedEncryptionKey.salt),
      encryptionIterations: encryptedEncryptionKey.iterations,
    });

    // Save backup
    await saveBackup({
      publicKey: accountRecord.publicKey,
      did,
      cipher: accountRecord.encryptedPrivateKey,
      iv: accountRecord.encryptionIv,
      salt: accountRecord.salt,
      iterations: accountRecord.iterations,
      encryptionCipher: accountRecord.encryptedEncryptionKey,
      encryptionIv: accountRecord.encryptionKeyIv,
      encryptionSalt: accountRecord.encryptionSalt,
      encryptionIterations: accountRecord.encryptionIterations,
      encryptionPublicKey: accountRecord.encryptionPublicKey,
      version: 1,
      updatedAt: now,
    });

    // Unlock the account
    this.unlockedIdentity = {
      username: normalized,
      did,
      signingPublicKey,
      signingPrivateKey,
      encryptionPublicKey,
      encryptionPrivateKey,
      createdAt: now,
    };

    this.currentAccountRecord = accountRecord;

    return this.getUnlockedIdentity();
  }

  /**
   * Unlock an existing account with password
   * Includes brute force protection with exponential backoff
   * @param {Object} params
   * @param {string} params.username - Account username
   * @param {string} params.password - Account password
   * @returns {Promise<Object>} Unlocked identity
   * @throws {Error} If account not found, password incorrect, or account locked
   */
  async unlock({ username, password }) {
    const normalized = username?.trim();

    if (!normalized || !password) {
      throw new Error('Username and password are required');
    }

    // Check for brute force lockout
    const lockStatus = await checkLoginLockout(normalized);
    if (lockStatus.locked) {
      throw new Error(
        `Too many failed login attempts. Please wait ${lockStatus.waitSeconds} seconds before trying again.`
      );
    }

    // Get account from database
    const account = await getAccount(normalized);
    if (!account) {
      // Record failed attempt even for non-existent accounts to prevent username enumeration timing attacks
      await recordFailedLogin(normalized);
      throw new Error('Invalid username or password');
    }

    // Decrypt signing private key
    let signingPrivateKeyBytes;
    try {
      signingPrivateKeyBytes = await decryptPrivateKey(
        {
          encryptedPrivateKey: base64ToBytes(account.encryptedPrivateKey),
          encryptionIv: base64ToBytes(account.encryptionIv),
          salt: base64ToBytes(account.salt),
          iterations: account.iterations,
        },
        password
      );
    } catch (error) {
      // Record failed login attempt
      await recordFailedLogin(normalized);

      // Check if now locked
      const newLockStatus = await checkLoginLockout(normalized);
      if (newLockStatus.locked) {
        throw new Error(
          `Incorrect password. Too many failed attempts - account locked for ${newLockStatus.waitSeconds} seconds.`
        );
      }

      throw new Error('Incorrect password');
    }

    const signingPublicKeyBytes = base58ToBytes(account.publicKey);
    const encryptionPublicKeyBytes = account.encryptionPublicKey
      ? base58ToBytes(account.encryptionPublicKey)
      : null;

    let encryptionPrivateKeyBytes = null;
    if (account.encryptedEncryptionKey && account.encryptionKeyIv && account.encryptionSalt) {
      try {
        encryptionPrivateKeyBytes = await decryptPrivateKey(
          {
            encryptedPrivateKey: base64ToBytes(account.encryptedEncryptionKey),
            encryptionIv: base64ToBytes(account.encryptionKeyIv),
            salt: base64ToBytes(account.encryptionSalt),
            iterations: account.encryptionIterations,
          },
          password
        );
      } catch (error) {
        console.warn('Failed to decrypt encryption private key:', error);
      }
    }

    // Store unlocked identity in memory
    this.unlockedIdentity = {
      username: account.username,
      did: account.did,
      signingPublicKey: signingPublicKeyBytes,
      signingPrivateKey: signingPrivateKeyBytes,
      encryptionPublicKey: encryptionPublicKeyBytes,
      encryptionPrivateKey: encryptionPrivateKeyBytes,
      createdAt: account.createdAt,
    };

    this.currentAccountRecord = account;

    // Clear failed login attempts after successful unlock
    await clearLoginAttempts(normalized);

    // Update backup
    await saveBackup({
      publicKey: account.publicKey,
      did: account.did,
      cipher: account.encryptedPrivateKey,
      iv: account.encryptionIv,
      salt: account.salt,
      iterations: account.iterations,
      encryptionCipher: account.encryptedEncryptionKey,
      encryptionIv: account.encryptionKeyIv,
      encryptionSalt: account.encryptionSalt,
      encryptionIterations: account.encryptionIterations,
      encryptionPublicKey: account.encryptionPublicKey,
      version: 1,
      updatedAt: account.updatedAt,
    });

    return this.getUnlockedIdentity();
  }

  /**
   * Lock the current account (clear from memory)
   */
  lock() {
    this.unlockedIdentity = null;
    this.currentAccountRecord = null;
  }

  /**
   * Delete an account permanently
   * @param {string} username
   * @returns {Promise<void>}
   */
  async deleteAccount(username) {
    const account = await getAccount(username);
    if (!account) {
      throw new Error('Account not found');
    }

    await deleteAccount(username);

    // Clear if currently unlocked
    if (this.currentAccountRecord?.username === username) {
      this.lock();
    }
  }

  /**
   * Get backup payload for current account (for remote sync)
   * @returns {Object|null}
   */
  getBackupPayload() {
    if (!this.currentAccountRecord) {
      throw new Error('No account loaded');
    }

    if (
      !this.currentAccountRecord.encryptedPrivateKey ||
      !this.currentAccountRecord.encryptionIv ||
      !this.currentAccountRecord.salt
    ) {
      return null;
    }

    return {
      publicKey: this.currentAccountRecord.publicKey,
      did: this.currentAccountRecord.did,
      encryptedPrivateKey: this.currentAccountRecord.encryptedPrivateKey,
      encryptionIv: this.currentAccountRecord.encryptionIv,
      salt: this.currentAccountRecord.salt,
      iterations: this.currentAccountRecord.iterations ?? 600000,
      encryptedEncryptionKey: this.currentAccountRecord.encryptedEncryptionKey ?? null,
      encryptionKeyIv: this.currentAccountRecord.encryptionKeyIv ?? null,
      encryptionSalt: this.currentAccountRecord.encryptionSalt ?? null,
      encryptionIterations: this.currentAccountRecord.encryptionIterations ?? 600000,
      encryptionPublicKey: this.currentAccountRecord.encryptionPublicKey ?? null,
      version: 1,
      updatedAt: this.currentAccountRecord.updatedAt ?? new Date().toISOString(),
      createdAt: this.currentAccountRecord.createdAt ?? null,
    };
  }

  /**
   * Get account mapping (username -> publicKey) for remote lookup
   * @returns {Object|null}
   */
  getAccountMapping() {
    if (!this.currentAccountRecord) return null;

    return {
      username: this.currentAccountRecord.username,
      publicKey: this.currentAccountRecord.publicKey,
      encryptionPublicKey: this.currentAccountRecord.encryptionPublicKey ?? null,
      did: this.currentAccountRecord.did,
    };
  }

  async listPasskeys(username = null) {
    const target = username ?? this.currentAccountRecord?.username ?? null;
    if (!target) {
      throw new Error('Username required to list passkeys');
    }
    return listPasskeyCredentials(target);
  }

  async registerPasskey({ displayName } = {}) {
    if (!isPasskeySupported()) {
      throw new Error('Passkeys are not supported in this browser');
    }

    if (!this.currentAccountRecord) {
      throw new Error('Unlock account before registering a passkey');
    }

    const username = this.currentAccountRecord.username;
    const session = new PasskeySession();
    const result = await session.register({
      username,
      displayName: displayName ?? username,
    });

    await savePasskeyCredential({
      credentialId: result.credential.rawId,
      username,
      meta: {
        credential: result.credential,
        challenge: result.challenge,
      },
    });

    return result.credential;
  }

  async removePasskey(credentialId) {
    if (!credentialId) {
      throw new Error('credentialId is required');
    }

    await deletePasskeyCredential(credentialId);
  }

  /**
   * Import account from remote backup
   * @param {Object} params
   * @param {string} params.username - Username to create
   * @param {string} params.password - Password to decrypt backup
   * @param {Object} params.backup - Remote backup payload
   * @returns {Promise<Object>} Unlocked identity
   */
  async importAccountFromBackup({ username, password, backup }) {
    const normalized = username?.trim();

    if (!normalized || !password) {
      throw new Error('Username and password are required');
    }

    if (!backup?.encryptedPrivateKey || !backup.encryptionIv || !backup.salt) {
      throw new Error('Backup payload is incomplete');
    }

    const signingPrivateKeyBytes = await decryptPrivateKey(
      {
        encryptedPrivateKey: base64ToBytes(backup.encryptedPrivateKey),
        encryptionIv: base64ToBytes(backup.encryptionIv),
        salt: base64ToBytes(backup.salt),
        iterations: backup.iterations,
      },
      password
    );

    let encryptionPrivateKeyBytes = null;
    if (backup.encryptedEncryptionKey && backup.encryptionKeyIv && backup.encryptionSalt) {
      encryptionPrivateKeyBytes = await decryptPrivateKey(
        {
          encryptedPrivateKey: base64ToBytes(backup.encryptedEncryptionKey),
          encryptionIv: base64ToBytes(backup.encryptionKeyIv),
          salt: base64ToBytes(backup.encryptionSalt),
          iterations: backup.encryptionIterations,
        },
        password
      );
    }

    const signingPublicKeyBytes = base58ToBytes(backup.publicKey);
    const did = didFromPublicKey(signingPublicKeyBytes);
    const encryptionPublicKeyString = backup.encryptionPublicKey
      ? backup.encryptionPublicKey
      : encryptionPrivateKeyBytes
        ? bytesToBase58(getEncryptionPublicKey(encryptionPrivateKeyBytes))
        : null;

    const now = new Date().toISOString();

    const accountRecord = await saveAccount({
      username: normalized,
      did,
      publicKey: backup.publicKey,
      encryptionPublicKey: encryptionPublicKeyString,
      createdAt: backup.createdAt ?? now,
      updatedAt: backup.updatedAt ?? now,
      encryptedPrivateKey: backup.encryptedPrivateKey,
      encryptionIv: backup.encryptionIv,
      salt: backup.salt,
      iterations: backup.iterations ?? 600000,
      encryptedEncryptionKey: backup.encryptedEncryptionKey ?? null,
      encryptionKeyIv: backup.encryptionKeyIv ?? null,
      encryptionSalt: backup.encryptionSalt ?? null,
      encryptionIterations: backup.encryptionIterations ?? 600000,
    });

    await saveBackup({
      publicKey: accountRecord.publicKey,
      did,
      cipher: accountRecord.encryptedPrivateKey,
      iv: accountRecord.encryptionIv,
      salt: accountRecord.salt,
      iterations: accountRecord.iterations,
      encryptionCipher: accountRecord.encryptedEncryptionKey,
      encryptionIv: accountRecord.encryptionKeyIv,
      encryptionSalt: accountRecord.encryptionSalt,
      encryptionIterations: accountRecord.encryptionIterations,
      encryptionPublicKey: accountRecord.encryptionPublicKey,
      version: 1,
      updatedAt: backup.updatedAt ?? now,
    });

    this.unlockedIdentity = {
      username: normalized,
      did,
      signingPublicKey: signingPublicKeyBytes,
      signingPrivateKey: signingPrivateKeyBytes,
      encryptionPublicKey: encryptionPublicKeyString
        ? base58ToBytes(encryptionPublicKeyString)
        : null,
      encryptionPrivateKey: encryptionPrivateKeyBytes,
      createdAt: accountRecord.createdAt,
    };

    this.currentAccountRecord = accountRecord;

    return this.getUnlockedIdentity();
  }

  /**
   * Require unlocked identity (throws if locked)
   * @returns {Object} Unlocked identity with raw bytes
   * @throws {Error} If identity is locked
   */
  requireUnlocked() {
    if (!this.unlockedIdentity) {
      throw new Error('Identity is locked. Authenticate first.');
    }
    return this.unlockedIdentity;
  }
}
