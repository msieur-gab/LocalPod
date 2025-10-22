/**
 * Platform Database - Manages shared identity data across all apps
 * Stores: accounts, collaborators, profiles, backups
 * @module sdk/storage/PlatformDatabase
 */

import Dexie from 'dexie';

const DATABASE_NAME = 'identityPlatform';
const CURRENT_VERSION = 1;

/**
 * Identity Platform Database
 * Shared across all applications using the SDK
 */
export class PlatformDatabase extends Dexie {
  constructor() {
    super(DATABASE_NAME);

    // Version 1: Initial schema
    this.version(CURRENT_VERSION).stores({
      accounts: '&username, publicKey, createdAt',
      collaborators: '&id, publicKey, addedAt',
      profiles: '&publicKey, updatedAt',
      backups: '&publicKey, updatedAt',
      loginAttempts: '&username, lastAttempt', // Track failed login attempts
    });

    // Type definitions for tables
    this.accounts = this.table('accounts');
    this.collaborators = this.table('collaborators');
    this.profiles = this.table('profiles');
    this.backups = this.table('backups');
    this.loginAttempts = this.table('loginAttempts');
  }
}

// Singleton instance
let dbInstance = null;

/**
 * Get the platform database instance (singleton)
 * @returns {PlatformDatabase}
 */
export const getPlatformDatabase = () => {
  if (!dbInstance) {
    dbInstance = new PlatformDatabase();
  }
  return dbInstance;
};

// ========== Account Operations ==========

/**
 * List all accounts ordered by creation date
 * @returns {Promise<Array>}
 */
export const listAccounts = async () => {
  const db = getPlatformDatabase();
  return db.accounts.orderBy('createdAt').toArray();
};

/**
 * Get account by username
 * @param {string} username
 * @returns {Promise<Object|undefined>}
 */
export const getAccount = async (username) => {
  const db = getPlatformDatabase();
  return db.accounts.get(username);
};

/**
 * Get account by public key
 * @param {string} publicKey - Base58-encoded public key
 * @returns {Promise<Object|undefined>}
 */
export const getAccountByPublicKey = async (publicKey) => {
  const db = getPlatformDatabase();
  return db.accounts.where('publicKey').equals(publicKey).first();
};

/**
 * Save or update account
 * @param {Object} account - Account record
 * @param {string} account.username - Unique username
 * @param {string} account.publicKey - Base58-encoded public key
 * @param {string} account.did - DID identifier
 * @param {string} account.encryptedPrivateKey - Base64 encrypted private key
 * @param {string} account.encryptionIv - Base64 IV
 * @param {string} account.salt - Base64 salt
 * @param {number} account.iterations - PBKDF2 iterations
 * @returns {Promise<Object>}
 */
export const saveAccount = async (account) => {
  if (!account?.username) {
    throw new Error('saveAccount requires username');
  }

  const db = getPlatformDatabase();
  const now = new Date().toISOString();

  await db.accounts.put({
    ...account,
    createdAt: account.createdAt ?? now,
    updatedAt: now,
  });

  return getAccount(account.username);
};

/**
 * Delete account by username
 * @param {string} username
 * @returns {Promise<void>}
 */
export const deleteAccount = async (username) => {
  const db = getPlatformDatabase();
  await db.accounts.delete(username);
};

// ========== Collaborator Operations ==========

/**
 * List all collaborators ordered by added date (most recent first)
 * @returns {Promise<Array>}
 */
export const listCollaborators = async () => {
  const db = getPlatformDatabase();
  return db.collaborators.orderBy('addedAt').reverse().toArray();
};

/**
 * Get collaborator by ID
 * @param {string} id - Collaborator ID
 * @returns {Promise<Object|undefined>}
 */
export const getCollaborator = async (id) => {
  const db = getPlatformDatabase();
  return db.collaborators.get(id);
};

/**
 * Get collaborator by public key
 * @param {string} publicKey - Base58-encoded public key
 * @returns {Promise<Object|undefined>}
 */
export const getCollaboratorByPublicKey = async (publicKey) => {
  const db = getPlatformDatabase();
  return db.collaborators.where('publicKey').equals(publicKey).first();
};

/**
 * Add or update collaborator
 * @param {Object} collaborator
 * @param {string} collaborator.id - Unique ID (e.g., UUID or publicKey)
 * @param {string} collaborator.publicKey - Base58-encoded public key
 * @param {string} [collaborator.name] - Display name
 * @returns {Promise<Array>}
 */
export const addCollaborator = async (collaborator) => {
  if (!collaborator?.id || !collaborator?.publicKey) {
    throw new Error('addCollaborator requires id and publicKey');
  }

  const db = getPlatformDatabase();
  const now = new Date().toISOString();

  await db.collaborators.put({
    id: collaborator.id,
    name: collaborator.name ?? null,
    publicKey: collaborator.publicKey,
    addedAt: collaborator.addedAt ?? now,
  });

  return listCollaborators();
};

/**
 * Remove collaborator by ID
 * @param {string} id - Collaborator ID
 * @returns {Promise<Array>}
 */
export const removeCollaborator = async (id) => {
  const db = getPlatformDatabase();
  await db.collaborators.delete(id);
  return listCollaborators();
};

// ========== Profile Operations ==========

/**
 * Save or update profile
 * @param {Object} profile
 * @param {string} profile.publicKey - Base58-encoded public key (primary key)
 * @param {string} [profile.username] - Username (from unified file)
 * @param {string} [profile.displayName] - Human-readable name
 * @param {string} [profile.avatar] - Avatar URL or data URI
 * @param {string} [profile.bio] - User bio/description
 * @param {string} [profile.updatedAt] - ISO timestamp
 * @returns {Promise<Object>}
 */
export const saveProfile = async (profile) => {
  if (!profile?.publicKey) {
    throw new Error('saveProfile requires publicKey');
  }

  const db = getPlatformDatabase();
  const record = {
    publicKey: profile.publicKey,
    username: profile.username ?? null,
    displayName: profile.displayName ?? null,
    avatar: profile.avatar ?? null,
    bio: profile.bio ?? null,
    updatedAt: profile.updatedAt ?? new Date().toISOString(),
  };

  await db.profiles.put(record);
  return record;
};

/**
 * Get profile by public key
 * @param {string} publicKey - Base58-encoded public key
 * @returns {Promise<Object|undefined>}
 */
export const getProfile = async (publicKey) => {
  if (!publicKey) return null;
  const db = getPlatformDatabase();
  return db.profiles.get(publicKey);
};

/**
 * List all profiles
 * @returns {Promise<Array>}
 */
export const listProfiles = async () => {
  const db = getPlatformDatabase();
  return db.profiles.toArray();
};

/**
 * Delete profile by public key
 * @param {string} publicKey
 * @returns {Promise<void>}
 */
export const deleteProfile = async (publicKey) => {
  const db = getPlatformDatabase();
  await db.profiles.delete(publicKey);
};

// ========== Backup Operations ==========

/**
 * Save encrypted private key backup
 * @param {Object} backup
 * @param {string} backup.publicKey - Base58-encoded public key
 * @param {string} backup.cipher - Base64 encrypted private key
 * @param {string} backup.iv - Base64 IV
 * @param {string} backup.salt - Base64 salt
 * @param {number} backup.iterations - PBKDF2 iterations
 * @returns {Promise<void>}
 */
export const saveBackup = async (backup) => {
  if (!backup?.publicKey || !backup?.cipher || !backup?.iv || !backup?.salt) {
    throw new Error('saveBackup requires publicKey, cipher, iv, and salt');
  }

  const db = getPlatformDatabase();
  await db.backups.put({
    publicKey: backup.publicKey,
    cipher: backup.cipher,
    iv: backup.iv,
    salt: backup.salt,
    iterations: backup.iterations ?? 600000,
    updatedAt: backup.updatedAt ?? new Date().toISOString(),
  });
};

/**
 * Get backup by public key
 * @param {string} publicKey
 * @returns {Promise<Object|undefined>}
 */
export const getBackup = async (publicKey) => {
  if (!publicKey) return null;
  const db = getPlatformDatabase();
  return db.backups.get(publicKey);
};

/**
 * Delete backup by public key
 * @param {string} publicKey
 * @returns {Promise<void>}
 */
export const deleteBackup = async (publicKey) => {
  const db = getPlatformDatabase();
  await db.backups.delete(publicKey);
};

// ========== Login Attempt Tracking (Brute Force Protection) ==========

/**
 * Get login attempt record for username
 * @param {string} username
 * @returns {Promise<Object|undefined>}
 */
export const getLoginAttempts = async (username) => {
  const db = getPlatformDatabase();
  return db.loginAttempts.get(username);
};

/**
 * Record failed login attempt
 * @param {string} username
 * @returns {Promise<void>}
 */
export const recordFailedLogin = async (username) => {
  const db = getPlatformDatabase();
  const existing = await getLoginAttempts(username);

  await db.loginAttempts.put({
    username,
    failedAttempts: (existing?.failedAttempts ?? 0) + 1,
    lastAttempt: new Date().toISOString(),
    lockoutUntil: null, // Can be set for account lockout
  });
};

/**
 * Clear login attempts after successful login
 * @param {string} username
 * @returns {Promise<void>}
 */
export const clearLoginAttempts = async (username) => {
  const db = getPlatformDatabase();
  await db.loginAttempts.delete(username);
};

/**
 * Check if account is locked due to too many failed attempts
 * @param {string} username
 * @returns {Promise<{locked: boolean, waitSeconds: number}>}
 */
export const checkLoginLockout = async (username) => {
  const record = await getLoginAttempts(username);
  if (!record) return { locked: false, waitSeconds: 0 };

  const attempts = record.failedAttempts ?? 0;
  if (attempts === 0) return { locked: false, waitSeconds: 0 };

  // Exponential backoff: wait 2^(attempts-3) seconds after 3 failed attempts
  // 3 attempts: 1 second
  // 4 attempts: 2 seconds
  // 5 attempts: 4 seconds
  // 6 attempts: 8 seconds
  // 7 attempts: 16 seconds
  // 8+ attempts: 32 seconds
  if (attempts < 3) return { locked: false, waitSeconds: 0 };

  const waitSeconds = Math.min(Math.pow(2, attempts - 3), 32);
  const lastAttemptTime = new Date(record.lastAttempt).getTime();
  const now = Date.now();
  const elapsed = (now - lastAttemptTime) / 1000;

  if (elapsed < waitSeconds) {
    return {
      locked: true,
      waitSeconds: Math.ceil(waitSeconds - elapsed),
    };
  }

  return { locked: false, waitSeconds: 0 };
};
