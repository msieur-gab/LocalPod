/**
 * Platform Database - Manages shared identity data across all apps
 * Stores: accounts, collaborators, profiles, backups
 * @module sdk/storage/PlatformDatabase
 */

import Dexie from 'dexie';
import {
  LOGIN_LOCKOUT_MIN_ATTEMPTS,
  LOGIN_LOCKOUT_MAX_DELAY_SEC,
  LOGIN_LOCKOUT_BASE,
} from '../constants.js';

const DATABASE_NAME = 'identityPlatform';

/**
 * Identity Platform Database
 * Shared across all applications using the SDK
 */
export class PlatformDatabase extends Dexie {
  constructor() {
    super(DATABASE_NAME);

    // Current schema
    this.version(1).stores({
      accounts: '&username, publicKey, createdAt',
      collaborators: '&id, publicKey, did, addedAt',
      profiles: '&publicKey, updatedAt',
      backups: '&publicKey, updatedAt',
      loginAttempts: '&username, lastAttempt',
      capabilityGrants: '&id, granterDid, subjectDid, resourceId',
      capabilityVersions: '&resourceId, updatedAt',
      passkeys: '&credentialId, username',
    });

    // Type definitions for tables
    this.accounts = this.table('accounts');
    this.collaborators = this.table('collaborators');
    this.profiles = this.table('profiles');
    this.backups = this.table('backups');
    this.loginAttempts = this.table('loginAttempts');
    this.capabilityGrants = this.table('capabilityGrants');
    this.capabilityVersions = this.table('capabilityVersions');
    this.passkeys = this.table('passkeys');
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

// ========== Database Query Helpers ==========

/**
 * Generic get operation by primary key
 * @param {string} tableName - Table name
 * @param {any} key - Primary key value
 * @returns {Promise<Object|undefined>}
 */
const dbGet = async (tableName, key) => {
  const db = getPlatformDatabase();
  return db[tableName].get(key);
};

/**
 * Generic query by field with where/equals/first
 * @param {string} tableName - Table name
 * @param {string} field - Field name to query
 * @param {any} value - Value to match
 * @returns {Promise<Object|undefined>}
 */
const dbFindFirst = async (tableName, field, value) => {
  if (!value) return null;
  const db = getPlatformDatabase();
  return db[tableName].where(field).equals(value).first();
};

/**
 * Generic query by field with where/equals/toArray
 * @param {string} tableName - Table name
 * @param {string} field - Field name to query
 * @param {any} value - Value to match
 * @returns {Promise<Array>}
 */
const dbFindAll = async (tableName, field, value) => {
  const db = getPlatformDatabase();
  return db[tableName].where(field).equals(value).toArray();
};

/**
 * Generic list all with optional ordering
 * @param {string} tableName - Table name
 * @param {string} [orderBy] - Field to order by
 * @param {boolean} [reverse=false] - Reverse order
 * @returns {Promise<Array>}
 */
const dbList = async (tableName, orderBy = null, reverse = false) => {
  const db = getPlatformDatabase();
  if (orderBy) {
    const query = db[tableName].orderBy(orderBy);
    return reverse ? query.reverse().toArray() : query.toArray();
  }
  return db[tableName].toArray();
};

/**
 * Generic put operation
 * @param {string} tableName - Table name
 * @param {Object} record - Record to save
 * @returns {Promise<any>} Primary key of saved record
 */
const dbPut = async (tableName, record) => {
  const db = getPlatformDatabase();
  return db[tableName].put(record);
};

/**
 * Generic delete operation
 * @param {string} tableName - Table name
 * @param {any} key - Primary key to delete
 * @returns {Promise<void>}
 */
const dbDelete = async (tableName, key) => {
  const db = getPlatformDatabase();
  return db[tableName].delete(key);
};

// ========== Account Operations ==========

/**
 * List all accounts ordered by creation date
 * @returns {Promise<Array>}
 */
export const listAccounts = async () => {
  return dbList('accounts', 'createdAt');
};

/**
 * Get account by username
 * @param {string} username
 * @returns {Promise<Object|undefined>}
 */
export const getAccount = async (username) => {
  return dbGet('accounts', username);
};

/**
 * Get account by public key
 * @param {string} publicKey - Base58-encoded public key
 * @returns {Promise<Object|undefined>}
 */
export const getAccountByPublicKey = async (publicKey) => {
  return dbFindFirst('accounts', 'publicKey', publicKey);
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

  const now = new Date().toISOString();

  await dbPut('accounts', {
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
  return dbDelete('accounts', username);
};

// ========== Passkey Registry ==========

/**
 * Save or update a passkey credential record.
 * @param {Object} credential
 * @param {string} credential.credentialId - Base64url credential ID
 * @param {string} credential.username - Associated username
 * @param {Object} [credential.meta] - Serialized credential payload (optional)
 * @returns {Promise<void>}
 */
export const savePasskeyCredential = async (credential) => {
  if (!credential?.credentialId || !credential?.username) {
    throw new Error('savePasskeyCredential requires credentialId and username');
  }

  return dbPut('passkeys', {
    credentialId: credential.credentialId,
    username: credential.username,
    meta: credential.meta ?? null,
    updatedAt: new Date().toISOString(),
  });
};

/**
 * List passkeys for a username.
 * @param {string} username
 * @returns {Promise<Array>}
 */
export const listPasskeyCredentials = async (username) => {
  return dbFindAll('passkeys', 'username', username);
};

/**
 * Get passkey credential by credentialId.
 * @param {string} credentialId
 * @returns {Promise<Object|undefined>}
 */
export const getPasskeyCredential = async (credentialId) => {
  return dbGet('passkeys', credentialId);
};

/**
 * Remove passkey credential.
 * @param {string} credentialId
 * @returns {Promise<void>}
 */
export const deletePasskeyCredential = async (credentialId) => {
  return dbDelete('passkeys', credentialId);
};

// ========== Collaborator Operations ==========

/**
 * List all collaborators ordered by added date (most recent first)
 * @returns {Promise<Array>}
 */
export const listCollaborators = async () => {
  return dbList('collaborators', 'addedAt', true);
};

/**
 * Get collaborator by ID
 * @param {string} id - Collaborator ID
 * @returns {Promise<Object|undefined>}
 */
export const getCollaborator = async (id) => {
  return dbGet('collaborators', id);
};

/**
 * Get collaborator by public key
 * @param {string} publicKey - Base58-encoded public key
 * @returns {Promise<Object|undefined>}
 */
export const getCollaboratorByPublicKey = async (publicKey) => {
  return dbFindFirst('collaborators', 'publicKey', publicKey);
};

export const getCollaboratorByDid = async (did) => {
  return dbFindFirst('collaborators', 'did', did);
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

  const now = new Date().toISOString();

  await dbPut('collaborators', {
    id: collaborator.id,
    name: collaborator.name ?? null,
    publicKey: collaborator.publicKey,
    encryptionPublicKey: collaborator.encryptionPublicKey ?? null,
    did: collaborator.did ?? null,
    metadata: collaborator.metadata ?? null,
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
  await dbDelete('collaborators', id);
  return listCollaborators();
};

// ========== Profile Operations ==========

/**
 * Save or update profile
 * @param {Object} profile
 * @param {string} profile.publicKey - Base58-encoded public key (primary key)
 * @param {string} [profile.encryptionPublicKey] - Base58-encoded X25519 encryption public key
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

  // Load existing profile to merge with (preserves fields not provided)
  const existing = await dbGet('profiles', profile.publicKey);

  const record = {
    publicKey: profile.publicKey,
    encryptionPublicKey: profile.encryptionPublicKey !== undefined
      ? profile.encryptionPublicKey
      : existing?.encryptionPublicKey ?? null,
    username: profile.username !== undefined
      ? profile.username
      : existing?.username ?? null,
    displayName: profile.displayName !== undefined
      ? profile.displayName
      : existing?.displayName ?? null,
    avatar: profile.avatar !== undefined
      ? profile.avatar
      : existing?.avatar ?? null,
    bio: profile.bio !== undefined
      ? profile.bio
      : existing?.bio ?? null,
    updatedAt: profile.updatedAt ?? new Date().toISOString(),
  };

  await dbPut('profiles', record);
  return record;
};

/**
 * Get profile by public key
 * @param {string} publicKey - Base58-encoded public key
 * @returns {Promise<Object|undefined>}
 */
export const getProfile = async (publicKey) => {
  if (!publicKey) return null;
  return dbGet('profiles', publicKey);
};

/**
 * List all profiles
 * @returns {Promise<Array>}
 */
export const listProfiles = async () => {
  return dbList('profiles');
};

/**
 * Delete profile by public key
 * @param {string} publicKey
 * @returns {Promise<void>}
 */
export const deleteProfile = async (publicKey) => {
  return dbDelete('profiles', publicKey);
};

// ========== Backup Operations ==========

/**
 * Save encrypted private key backup
 * @param {Object} backup
 * @param {string} backup.publicKey - Base58-encoded public key
 * @param {string} backup.cipher - Base64 encrypted private key
 * @param {string} backup.iv - Base64 IV
 * @param {string} backup.salt - Base64 salt
 * @param {number} backup.iterations - PBKDF2 iterations (required)
 * @param {number} backup.encryptionIterations - PBKDF2 iterations for encryption key (required)
 * @param {number} backup.version - Backup format version (required)
 * @returns {Promise<void>}
 */
export const saveBackup = async (backup) => {
  if (!backup?.publicKey || !backup?.cipher || !backup?.iv || !backup?.salt ||
      !backup?.iterations || !backup?.encryptionIterations || !backup?.version) {
    throw new Error('saveBackup requires publicKey, cipher, iv, salt, iterations, encryptionIterations, and version');
  }

  return dbPut('backups', {
    publicKey: backup.publicKey,
    did: backup.did ?? null,
    cipher: backup.cipher,
    iv: backup.iv,
    salt: backup.salt,
    iterations: backup.iterations,
    encryptionCipher: backup.encryptionCipher ?? null,
    encryptionIv: backup.encryptionIv ?? null,
    encryptionSalt: backup.encryptionSalt ?? null,
    encryptionIterations: backup.encryptionIterations,
    encryptionPublicKey: backup.encryptionPublicKey ?? null,
    version: backup.version,
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
  return dbGet('backups', publicKey);
};

/**
 * Delete backup by public key
 * @param {string} publicKey
 * @returns {Promise<void>}
 */
export const deleteBackup = async (publicKey) => {
  return dbDelete('backups', publicKey);
};

// ========== Capability Grants ==========

/**
 * Save or update capability grant
 * @param {Object} grant
 * @param {string} grant.id - Unique grant identifier
 * @returns {Promise<void>}
 */
export const saveCapabilityGrant = async (grant) => {
  if (!grant?.id) {
    throw new Error('saveCapabilityGrant requires id');
  }

  return dbPut('capabilityGrants', {
    ...grant,
    updatedAt: grant.updatedAt ?? new Date().toISOString(),
  });
};

export const getCapabilityGrant = async (id) => {
  return dbGet('capabilityGrants', id);
};

export const listCapabilityGrantsByGranter = async (granterDid) => {
  return dbFindAll('capabilityGrants', 'granterDid', granterDid);
};

export const listCapabilityGrantsBySubject = async (subjectDid) => {
  return dbFindAll('capabilityGrants', 'subjectDid', subjectDid);
};

export const listCapabilityGrantsByResource = async (resourceId) => {
  return dbFindAll('capabilityGrants', 'resourceId', resourceId);
};

export const deleteCapabilityGrant = async (id) => {
  return dbDelete('capabilityGrants', id);
};

export const setCapabilityVersion = async ({ resourceId, version, updatedAt }) => {
  if (!resourceId) {
    throw new Error('setCapabilityVersion requires resourceId');
  }

  return dbPut('capabilityVersions', {
    resourceId,
    version,
    updatedAt: updatedAt ?? new Date().toISOString(),
  });
};

export const getCapabilityVersion = async (resourceId) => {
  return dbGet('capabilityVersions', resourceId);
};

// ========== Login Attempt Tracking (Brute Force Protection) ==========

/**
 * Get login attempt record for username
 * @param {string} username
 * @returns {Promise<Object|undefined>}
 */
export const getLoginAttempts = async (username) => {
  return dbGet('loginAttempts', username);
};

/**
 * Record failed login attempt
 * @param {string} username
 * @returns {Promise<void>}
 */
export const recordFailedLogin = async (username) => {
  const existing = await getLoginAttempts(username);

  return dbPut('loginAttempts', {
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
  return dbDelete('loginAttempts', username);
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

  // Exponential backoff: wait 2^(attempts-MIN_ATTEMPTS) seconds after MIN_ATTEMPTS failed attempts
  // 3 attempts: 1 second
  // 4 attempts: 2 seconds
  // 5 attempts: 4 seconds
  // 6 attempts: 8 seconds
  // 7 attempts: 16 seconds
  // 8+ attempts: 32 seconds
  if (attempts < LOGIN_LOCKOUT_MIN_ATTEMPTS) return { locked: false, waitSeconds: 0 };

  const waitSeconds = Math.min(
    Math.pow(LOGIN_LOCKOUT_BASE, attempts - LOGIN_LOCKOUT_MIN_ATTEMPTS),
    LOGIN_LOCKOUT_MAX_DELAY_SEC
  );
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
