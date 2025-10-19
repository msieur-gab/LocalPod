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
   * @returns {Object|null}
   */
  getUnlockedIdentity() {
    if (!this.unlockedIdentity) return null;

    const { did, publicKey, privateKey, username, createdAt } = this.unlockedIdentity;

    return {
      did,
      publicKey: bytesToBase58(publicKey),
      privateKey: bytesToBase64(privateKey),
      username,
      createdAt,
    };
  }

  /**
   * Get current account record
   * @returns {Object|null}
   */
  getCurrentAccount() {
    return this.currentAccountRecord ? { ...this.currentAccountRecord } : null;
  }

  /**
   * Create a new DID-based account
   * @param {Object} params
   * @param {string} params.username - Unique username
   * @param {string} params.password - Password for encryption (min 8 chars recommended)
   * @returns {Promise<Object>} Unlocked identity
   * @throws {Error} If username exists or validation fails
   */
  async createAccount({ username, password }) {
    const normalized = username?.trim();

    if (!normalized || !password) {
      throw new Error('Username and password are required');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
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
   * @param {Object} params
   * @param {string} params.username - Account username
   * @param {string} params.password - Account password
   * @returns {Promise<Object>} Unlocked identity
   * @throws {Error} If account not found or password incorrect
   */
  async unlock({ username, password }) {
    const normalized = username?.trim();

    if (!normalized || !password) {
      throw new Error('Username and password are required');
    }

    // Get account from database
    const account = await getAccount(normalized);
    if (!account) {
      throw new Error('Account not found');
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
