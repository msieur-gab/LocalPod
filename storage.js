import Dexie from 'dexie';

const DATABASE_NAME = 'collabWriter';

export const db = new Dexie(DATABASE_NAME);
db.version(1).stores({
  identity: '&id',
  collaborators: '&id, publicKey',
  documents: '&id, updatedAt',
  sharedKeys: '[docId+publicKey], docId, publicKey',
});

db.version(2)
  .stores({
    identity: '&id',
    collaborators: '&id, publicKey, addedAt',
    documents: '&id, updatedAt',
    sharedKeys: '[docId+publicKey], docId, publicKey',
  })
  .upgrade((transaction) =>
    transaction.table('collaborators').toCollection().modify((record) => {
      if (!record.addedAt) {
        record.addedAt = new Date().toISOString();
      }
    }),
  );

db.version(3).stores({
  identity: null,
  accounts: '&username, createdAt',
  collaborators: '&id, publicKey, addedAt',
  documents: '&id, updatedAt',
  sharedKeys: '[docId+publicKey], docId, publicKey',
  profiles: '&publicKey, updatedAt',
  backups: '&publicKey, updatedAt',
});

db.version(4).stores({
  identity: null,
  accounts: '&username, createdAt',
  collaborators: '&id, publicKey, addedAt',
  documents: '&id, updatedAt',
  sharedKeys: '[docId+publicKey], docId, publicKey',
  profiles: '&publicKey, updatedAt',
  backups: '&publicKey, updatedAt',
});

db.version(5).stores({
  identity: null,
  accounts: '&username, createdAt',
  collaborators: '&id, publicKey, addedAt',
  documents: '&id, updatedAt',
  sharedKeys: '[docId+publicKey], docId, publicKey',
  profiles: '&publicKey, updatedAt',
  backups: '&publicKey, updatedAt',
  storageConfig: '&id, updatedAt',
});

// ---------- Account helpers ----------

export const listAccounts = async () => {
  return db.accounts.orderBy('createdAt').toArray();
};

export const getAccount = async (username) => {
  return db.accounts.get(username);
};

export const saveAccount = async (record) => {
  if (!record?.username) {
    throw new Error('saveAccount requires username');
  }
  const now = new Date().toISOString();
  await db.accounts.put({
    ...record,
    createdAt: record.createdAt ?? now,
    updatedAt: now,
  });
  return getAccount(record.username);
};

export const updateAccount = async (username, updater) => {
  const account = await getAccount(username);
  if (!account) return null;
  const next = typeof updater === 'function' ? updater(account) : { ...account, ...updater };
  return saveAccount(next);
};

export const deleteAccount = async (username) => {
  await db.accounts.delete(username);
};

export const listCollaborators = async () => {
  const records = await db.collaborators.orderBy('addedAt').reverse().toArray();
  return records;
};

export const addCollaborator = async (collaborator) => {
  const now = new Date().toISOString();
  await db.collaborators.put({
    id: collaborator.id,
    name: collaborator.name ?? null,
    publicKey: collaborator.publicKey,
    addedAt: collaborator.addedAt ?? now,
  });
  return listCollaborators();
};

export const removeCollaborator = async (id) => {
  await db.collaborators.delete(id);
  return listCollaborators();
};

export const saveDocumentMetadata = async (doc) => {
  const now = new Date().toISOString();
  await db.documents.put({
    ...doc,
    updatedAt: doc.updatedAt ?? now,
    createdAt: doc.createdAt ?? now,
  });
  return getDocumentMetadata(doc.id);
};

export const getDocumentMetadata = async (id) => {
  return db.documents.get(id);
};

export const listDocuments = async () => {
  return db.documents.orderBy('updatedAt').reverse().toArray();
};

export const deleteDocumentMetadata = async (id) => {
  await db.documents.delete(id);
  await db.sharedKeys.where('docId').equals(id).delete();
  return listDocuments();
};

export const saveSharedKey = async ({ docId, publicKey, encryptedKey }) => {
  await db.sharedKeys.put({
    docId,
    publicKey,
    encryptedKey,
    storedAt: new Date().toISOString(),
  });
};

export const getSharedKey = async ({ docId, publicKey }) => {
  return db.sharedKeys.get([docId, publicKey]);
};

export const listSharedKeys = async (docId) => {
  return db.sharedKeys.where('docId').equals(docId).toArray();
};

export const saveSharedKeysForDocument = async (docId, wrappedKeys = {}) => {
  const now = new Date().toISOString();
  const entries = Object.entries(wrappedKeys ?? {});
  if (entries.length === 0) {
    await db.sharedKeys.where('docId').equals(docId).delete();
    return;
  }
  await db.sharedKeys.where('docId').equals(docId).delete();
  await db.sharedKeys.bulkPut(
    entries.map(([publicKey, encryptedKey]) => ({
      docId,
      publicKey,
      encryptedKey,
      storedAt: now,
    })),
  );
};

export const getSharedKeysForPublicKey = async (publicKey) => {
  return db.sharedKeys.where('publicKey').equals(publicKey).toArray();
};

// ---------- Profile helpers ----------

export const saveProfile = async ({ publicKey, displayName = null, avatar = null, updatedAt = null }) => {
  if (!publicKey) {
    throw new Error('saveProfile requires publicKey');
  }
  const record = {
    publicKey,
    displayName,
    avatar,
    updatedAt: updatedAt ?? new Date().toISOString(),
  };
  await db.profiles.put(record);
  return record;
};

export const getProfile = async (publicKey) => {
  if (!publicKey) return null;
  return db.profiles.get(publicKey);
};

export const listProfiles = async () => {
  return db.profiles.toArray();
};

// ---------- Backup helpers ----------

export const saveBackup = async ({ publicKey, cipher, iv, salt, iterations, updatedAt }) => {
  if (!publicKey || !cipher || !iv || !salt) {
    throw new Error('saveBackup requires publicKey, cipher, iv, and salt');
  }
  await db.backups.put({
    publicKey,
    cipher,
    iv,
    salt,
    iterations,
    updatedAt: updatedAt ?? new Date().toISOString(),
  });
};

export const getBackup = async (publicKey) => {
  if (!publicKey) return null;
  return db.backups.get(publicKey);
};

// ---------- Storage Config helpers ----------

/**
 * Save IPFS provider configuration (encrypted)
 * @param {Object} config
 * @param {string} config.provider - Provider name ('pinata', 'scaleway', etc.)
 * @param {string} config.encryptedJwt - Encrypted API key/JWT
 * @param {string} config.encryptionIv - IV used for encryption
 * @param {string} config.encryptionSalt - Salt used for key derivation
 * @param {string} [config.gateway] - Optional gateway URL
 */
export const saveStorageConfig = async (config) => {
  if (!config?.provider || !config?.encryptedJwt || !config?.encryptionIv || !config?.encryptionSalt) {
    throw new Error('saveStorageConfig requires provider, encryptedJwt, encryptionIv, and encryptionSalt');
  }

  await db.storageConfig.put({
    id: 'current', // Always use 'current' as the ID (singleton)
    provider: config.provider,
    encryptedJwt: config.encryptedJwt,
    encryptionIv: config.encryptionIv,
    encryptionSalt: config.encryptionSalt,
    gateway: config.gateway || null,
    updatedAt: new Date().toISOString(),
  });
};

/**
 * Get current storage configuration
 * @returns {Promise<Object|null>}
 */
export const getStorageConfig = async () => {
  return db.storageConfig.get('current');
};

/**
 * Delete storage configuration
 */
export const deleteStorageConfig = async () => {
  await db.storageConfig.delete('current');
};

// =============================================================================
// IPFS STORAGE PROVIDERS
// =============================================================================
// NOTE: S3/Filebase code has been removed and replaced with IPFS provider abstraction
// For IPFS storage operations, use the new provider system in ipfs-providers.js
//
// Example usage:
//   import { createProvider } from './ipfs-providers.js';
//   const provider = createProvider('pinata', { jwt: 'your_jwt', gateway: 'gateway.pinata.cloud' });
//   const cid = await provider.upload({ hello: 'world' });
//   const data = await provider.download(cid);
//
// See PINATA_MIGRATION.md for migration details.
// =============================================================================
