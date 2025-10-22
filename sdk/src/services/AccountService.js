/**
 * Account Service - Manages DID-based accounts, authentication, and key management
 * @module sdk/services/AccountService
 */

import { generateKeyPair, didFromPublicKey } from '../core/DID.js';
import { encryptPrivateKey, decryptPrivateKey } from '../core/crypto.js';
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
} from '../storage/PlatformDatabase.js';

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

    const { did, publicKey, username, createdAt } = this.unlockedIdentity;

    return {
      did,
      publicKey: bytesToBase58(publicKey),
      // REMOVED: privateKey - never expose in API to prevent leakage
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
    return this.unlockedIdentity?.privateKey ?? null;
  }

  /**
   * Get public key bytes for cryptographic operations
   * @returns {Uint8Array|null} Public key bytes or null if locked
   */
  getPublicKeyBytes() {
    return this.unlockedIdentity?.publicKey ?? null;
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

    // Generate new key pair
    const { privateKey, publicKey } = generateKeyPair();
    const did = didFromPublicKey(publicKey);
    const now = new Date().toISOString();

    // Encrypt private key with password
    const encrypted = await encryptPrivateKey(privateKey, password);

    // Save account to database
    const accountRecord = await saveAccount({
      username: normalized,
      did,
      publicKey: bytesToBase58(publicKey),
      createdAt: now,
      encryptedPrivateKey: bytesToBase64(encrypted.encryptedPrivateKey),
      encryptionIv: bytesToBase64(encrypted.encryptionIv),
      salt: bytesToBase64(encrypted.salt),
      iterations: encrypted.iterations,
    });

    // Save backup
    await saveBackup({
      publicKey: accountRecord.publicKey,
      cipher: accountRecord.encryptedPrivateKey,
      iv: accountRecord.encryptionIv,
      salt: accountRecord.salt,
      iterations: accountRecord.iterations,
      updatedAt: now,
    });

    // Unlock the account
    this.unlockedIdentity = {
      username: normalized,
      did,
      publicKey,
      privateKey,
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

    // Decrypt private key
    let privateKeyBytes;
    try {
      privateKeyBytes = await decryptPrivateKey(
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

    const publicKeyBytes = base58ToBytes(account.publicKey);

    // Store unlocked identity in memory
    this.unlockedIdentity = {
      username: account.username,
      did: account.did,
      publicKey: publicKeyBytes,
      privateKey: privateKeyBytes,
      createdAt: account.createdAt,
    };

    this.currentAccountRecord = account;

    // Clear failed login attempts after successful unlock
    await clearLoginAttempts(normalized);

    // Update backup
    await saveBackup({
      publicKey: account.publicKey,
      cipher: account.encryptedPrivateKey,
      iv: account.encryptionIv,
      salt: account.salt,
      iterations: account.iterations,
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
      encryptedPrivateKey: this.currentAccountRecord.encryptedPrivateKey,
      encryptionIv: this.currentAccountRecord.encryptionIv,
      salt: this.currentAccountRecord.salt,
      iterations: this.currentAccountRecord.iterations ?? 600000,
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
      did: this.currentAccountRecord.did,
    };
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

    // Decrypt private key from backup
    const privateKeyBytes = await decryptPrivateKey(
      {
        encryptedPrivateKey: base64ToBytes(backup.encryptedPrivateKey),
        encryptionIv: base64ToBytes(backup.encryptionIv),
        salt: base64ToBytes(backup.salt),
        iterations: backup.iterations,
      },
      password
    );

    const publicKeyBytes = base58ToBytes(backup.publicKey);
    const did = didFromPublicKey(publicKeyBytes);
    const now = new Date().toISOString();

    // Save account
    const accountRecord = await saveAccount({
      username: normalized,
      did,
      publicKey: backup.publicKey,
      createdAt: backup.createdAt ?? now,
      updatedAt: backup.updatedAt ?? now,
      encryptedPrivateKey: backup.encryptedPrivateKey,
      encryptionIv: backup.encryptionIv,
      salt: backup.salt,
      iterations: backup.iterations,
    });

    // Save backup
    await saveBackup({
      publicKey: accountRecord.publicKey,
      cipher: backup.encryptedPrivateKey,
      iv: backup.encryptionIv,
      salt: backup.salt,
      iterations: backup.iterations,
      updatedAt: backup.updatedAt ?? now,
    });

    // Unlock account
    this.unlockedIdentity = {
      username: normalized,
      did,
      publicKey: publicKeyBytes,
      privateKey: privateKeyBytes,
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
