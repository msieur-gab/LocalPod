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

// ---------- Filebase client (AWS Signature v4) ----------

const encoder = new TextEncoder();

const toUint8Array = (input) => {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof input === 'string') return encoder.encode(input);
  throw new Error('Unsupported payload type; use Uint8Array, ArrayBuffer, or string');
};

const bufferToHex = (buffer) => {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const sha256Hex = async (data) => {
  const hash = await crypto.subtle.digest('SHA-256', toUint8Array(data));
  return bufferToHex(hash);
};

const hmac = async (key, data) => {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return new Uint8Array(signature);
};

const getSignatureKey = async (secretKey, dateStamp, region, service) => {
  const kDate = await hmac(encoder.encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  return kSigning;
};

const canonicalUri = (bucket, key) => {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/${bucket}/${encodedKey}`;
};

const canonicalHeaders = (host, amzDate, payloadHash) => {
  return `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
};

const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

export class SimpleStorage {
  constructor({ accessKey, secretKey, bucket, region = 'us-east-1' }) {
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.bucket = bucket;
    this.region = region;
    this.host = 's3.filebase.com';
    this.baseUrl = `https://${this.host}`;
  }

  async putObject(key, data, contentType = 'application/octet-stream') {
    const bodyBytes = toUint8Array(data);
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = await sha256Hex(bodyBytes);
    const uri = canonicalUri(this.bucket, key);
    const canonicalRequest = [
      'PUT',
      uri,
      '',
      canonicalHeaders(this.host, amzDate, payloadHash),
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      await sha256Hex(encoder.encode(canonicalRequest)),
    ].join('\n');

    const signingKey = await getSignatureKey(this.secretKey, dateStamp, this.region, 's3');
    const signature = bufferToHex(await hmac(signingKey, stringToSign));
    const authorization = [
      'AWS4-HMAC-SHA256 Credential=',
      `${this.accessKey}/${credentialScope}`,
      `, SignedHeaders=${signedHeaders}`,
      `, Signature=${signature}`,
    ].join('');

    const response = await fetch(`${this.baseUrl}${uri}`, {
      method: 'PUT',
      headers: {
        Host: this.host,
        'Content-Type': contentType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        Authorization: authorization,
      },
      body: bodyBytes,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Filebase upload failed (${response.status}): ${text}`);
    }

    return response;
  }

  async getObject(key, { responseType = 'arrayBuffer' } = {}) {
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = await sha256Hex('');
    const uri = canonicalUri(this.bucket, key);

    const canonicalRequest = [
      'GET',
      uri,
      '',
      canonicalHeaders(this.host, amzDate, payloadHash),
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      await sha256Hex(encoder.encode(canonicalRequest)),
    ].join('\n');

    const signingKey = await getSignatureKey(this.secretKey, dateStamp, this.region, 's3');
    const signature = bufferToHex(await hmac(signingKey, stringToSign));
    const authorization = [
      'AWS4-HMAC-SHA256 Credential=',
      `${this.accessKey}/${credentialScope}`,
      `, SignedHeaders=${signedHeaders}`,
      `, Signature=${signature}`,
    ].join('');

    const response = await fetch(`${this.baseUrl}${uri}`, {
      method: 'GET',
      headers: {
        Host: this.host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        Authorization: authorization,
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Filebase fetch failed (${response.status}): ${text}`);
    }

    if (responseType === 'json') {
      const text = await response.text();
      if (!text) return null;
      return JSON.parse(text);
    }

    if (responseType === 'text') {
      return response.text();
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async saveDocument(docId, encryptedContent, { contentType = 'application/octet-stream' } = {}) {
    const response = await this.putObject(`documents/${docId}.enc`, encryptedContent, contentType);
    return {
      cid: response.headers.get('x-amz-meta-cid'),
      etag: response.headers.get('etag'),
    };
  }

  async loadDocument(docId) {
    let bytes = await this.getObject(`documents/${docId}.enc`, { responseType: 'arrayBuffer' });
    if (!bytes) {
      bytes = await this.getObject(`${docId}.enc`, { responseType: 'arrayBuffer' });
    }
    if (!bytes) {
      throw new Error(`Filebase document ${docId} not found`);
    }
    return bytes;
  }

  async saveDocumentMetadataFile(docId, metadata) {
    const body = JSON.stringify(metadata, null, 2);
    await this.putObject(`documents/${docId}.meta.json`, body, 'application/json');
  }

  async loadDocumentMetadata(docId) {
    let metadata = await this.getObject(`documents/${docId}.meta.json`, { responseType: 'json' });
    if (!metadata) {
      metadata = await this.getObject(`${docId}.meta.json`, { responseType: 'json' });
    }
    return metadata;
  }

  async loadUserIndex(publicKey) {
    const result = await this.getObject(`indexes/${publicKey}.json`, { responseType: 'json' });
    if (!result) {
      return { version: 1, docs: [] };
    }
    return {
      version: result.version ?? 1,
      docs: Array.isArray(result.docs) ? result.docs : [],
    };
  }

  async saveUserIndex(publicKey, payload) {
    const body = JSON.stringify(
      {
        version: payload.version ?? 1,
        updatedAt: new Date().toISOString(),
        docs: payload.docs ?? [],
      },
      null,
      2,
    );
    await this.putObject(`indexes/${publicKey}.json`, body, 'application/json');
  }

  async upsertUserIndex(publicKey, entry) {
    const index = await this.loadUserIndex(publicKey);
    const docs = Array.isArray(index.docs) ? index.docs.slice() : [];
    const filtered = docs.filter((item) => item.id !== entry.id);
    filtered.push(entry);
    filtered.sort((a, b) => {
      const aTime = new Date(a.updatedAt ?? 0).getTime();
      const bTime = new Date(b.updatedAt ?? 0).getTime();
      return bTime - aTime;
    });
    await this.saveUserIndex(publicKey, { version: index.version ?? 1, docs: filtered });
  }

  async removeFromUserIndex(publicKey, docId) {
    const index = await this.loadUserIndex(publicKey);
    const docs = Array.isArray(index.docs) ? index.docs.slice() : [];
    const filtered = docs.filter((item) => item.id !== docId);
    if (filtered.length === docs.length) {
      return;
    }
    await this.saveUserIndex(publicKey, { version: index.version ?? 1, docs: filtered });
  }

  // ==========================================
  // UNIFIED USER FILE METHODS
  // Single file per user containing public + encrypted private data
  // ==========================================

  /**
   * Save unified user file to S3
   * @param {string} publicKey - User's public key
   * @param {object} payload - User file data
   * @param {object} payload.public - Public data (username, displayName, avatar, bio)
   * @param {object} payload.private - Encrypted private data (cipher, iv, salt, iterations)
   */
  async saveUnifiedUser(publicKey, payload) {
    const privateSection = payload.private
      ? {
          cipher: payload.private.cipher ?? null,
          iv: payload.private.iv ?? null,
          salt: payload.private.salt ?? null,
          iterations: payload.private.iterations ?? 600000,
          collaborators: payload.private.collaborators
            ? {
                cipher: payload.private.collaborators.cipher ?? null,
                iv: payload.private.collaborators.iv ?? null,
                updatedAt: payload.private.collaborators.updatedAt ?? new Date().toISOString(),
                version: payload.private.collaborators.version ?? 1,
              }
            : payload.private.collaborators ?? null,
        }
      : null;

    const body = JSON.stringify(
      {
        version: payload.version ?? 1,
        publicKey,
        public: {
          username: payload.public?.username ?? null,
          displayName: payload.public?.displayName ?? null,
          avatar: payload.public?.avatar ?? null,
          bio: payload.public?.bio ?? null,
          updatedAt: payload.public?.updatedAt ?? new Date().toISOString(),
        },
        private: privateSection,
      },
      null,
      2,
    );
    await this.putObject(`users/${publicKey}.json`, body, 'application/json');
  }

  /**
   * Load unified user file from S3
   * @param {string} publicKey - User's public key
   * @returns {object|null} - User file or null if not found
   */
  async loadUnifiedUser(publicKey) {
    const result = await this.getObject(`users/${publicKey}.json`, { responseType: 'json' });
    if (!result) return null;
    return {
      version: result.version ?? 1,
      publicKey,
      public: {
        username: result.public?.username ?? null,
        displayName: result.public?.displayName ?? null,
        avatar: result.public?.avatar ?? null,
        bio: result.public?.bio ?? null,
        updatedAt: result.public?.updatedAt ?? null,
      },
      private: result.private
        ? {
            cipher: result.private.cipher,
            iv: result.private.iv,
            salt: result.private.salt,
            iterations: typeof result.private.iterations === 'number' ? result.private.iterations : parseInt(result.private.iterations, 10) || 600000,
            collaborators: result.private.collaborators
              ? {
                  cipher: result.private.collaborators.cipher ?? null,
                  iv: result.private.collaborators.iv ?? null,
                  updatedAt: result.private.collaborators.updatedAt ?? null,
                  version: result.private.collaborators.version ?? 1,
                }
              : null,
          }
        : null,
    };
  }

  // ==========================================
  // CONVENIENCE METHODS (use unified file)
  // ==========================================

  /**
   * Update only the public profile data
   * Loads existing file, updates public section, saves back
   */
  async upsertProfile(publicKey, profile) {
    // Load existing unified file
    const existing = await this.loadUnifiedUser(publicKey);

    // Update only public section
    const payload = {
      version: existing?.version ?? 1,
      public: {
        username: profile.username ?? existing?.public?.username ?? null,
        displayName: profile.displayName ?? existing?.public?.displayName ?? null,
        avatar: profile.avatar ?? existing?.public?.avatar ?? null,
        bio: profile.bio ?? existing?.public?.bio ?? null,
        updatedAt: profile.updatedAt ?? new Date().toISOString(),
      },
      private: existing?.private ?? null, // Keep existing private data
    };

    await this.saveUnifiedUser(publicKey, payload);
  }

  /**
   * Load only the public profile data
   */
  async loadProfile(publicKey) {
    const userFile = await this.loadUnifiedUser(publicKey);
    if (!userFile) return null;
    return {
      version: userFile.version,
      publicKey: userFile.publicKey,
      username: userFile.public.username,
      displayName: userFile.public.displayName,
      avatar: userFile.public.avatar,
      bio: userFile.public.bio,
      updatedAt: userFile.public.updatedAt,
    };
  }

  /**
   * Save account lookup (username -> publicKey mapping)
   * Now embedded in public section of unified file
   */
  async saveAccountLookup(username, payload) {
    const publicKey = payload.publicKey;
    const existing = await this.loadUnifiedUser(publicKey);

    const userPayload = {
      version: existing?.version ?? 1,
      public: {
        username: username,
        displayName: existing?.public?.displayName ?? username,
        avatar: existing?.public?.avatar ?? null,
        bio: existing?.public?.bio ?? null,
        updatedAt: payload.updatedAt ?? new Date().toISOString(),
      },
      private: existing?.private ?? null,
    };

    await this.saveUnifiedUser(publicKey, userPayload);
  }

  /**
   * Load account lookup by username
   * Requires scanning or maintaining a separate index
   * For now, we'll keep a lightweight mapping file
   */
  async loadAccountLookup(username) {
    const key = encodeURIComponent(username.toLowerCase());
    const result = await this.getObject(`accounts/${key}.json`, { responseType: 'json' });
    if (!result) return null;
    return {
      version: result.version ?? 1,
      username: result.username ?? username,
      publicKey: result.publicKey ?? null,
      updatedAt: result.updatedAt ?? null,
    };
  }

  /**
   * Save identity backup (encrypted private key)
   * Now stored in private section of unified file
   */
  async saveIdentityBackup(publicKey, payload) {
    const existing = await this.loadUnifiedUser(publicKey);

    const userPayload = {
      version: existing?.version ?? 1,
      public: existing?.public ?? {
        username: null,
        displayName: null,
        avatar: null,
        bio: null,
        updatedAt: new Date().toISOString(),
      },
      private: {
        cipher: payload.encryptedPrivateKey ?? payload.cipher,
        iv: payload.encryptionIv ?? payload.iv,
        salt: payload.salt,
        iterations: payload.iterations ?? 600000,
        collaborators: existing?.private?.collaborators ?? null,
      },
    };

    await this.saveUnifiedUser(publicKey, userPayload);
  }

  /**
   * Load identity backup
   * Extracts from private section of unified file
   */
  async loadIdentityBackup(publicKey) {
    const userFile = await this.loadUnifiedUser(publicKey);
    if (!userFile || !userFile.private) return null;
    return {
      version: userFile.version,
      publicKey: userFile.publicKey,
      encryptedPrivateKey: userFile.private.cipher,
      encryptionIv: userFile.private.iv,
      salt: userFile.private.salt,
      iterations: userFile.private.iterations,
      createdAt: null, // Not stored in new format
      updatedAt: userFile.public.updatedAt,
    };
  }

  /**
   * Save encrypted collaborator graph into unified user file.
   * Payload shape: { cipher, iv, version, updatedAt }
   */
  async saveCollaboratorBackup(publicKey, payload) {
    const existing = await this.loadUnifiedUser(publicKey);

    const userPayload = {
      version: existing?.version ?? 1,
      public: existing?.public ?? {
        username: null,
        displayName: null,
        avatar: null,
        bio: null,
        updatedAt: new Date().toISOString(),
      },
      private: {
        cipher: existing?.private?.cipher ?? null,
        iv: existing?.private?.iv ?? null,
        salt: existing?.private?.salt ?? null,
        iterations: existing?.private?.iterations ?? 600000,
        collaborators: payload
          ? {
              cipher: payload.cipher ?? null,
              iv: payload.iv ?? null,
              version: payload.version ?? 1,
              updatedAt: payload.updatedAt ?? new Date().toISOString(),
            }
          : null,
      },
    };

    await this.saveUnifiedUser(publicKey, userPayload);
  }

  /**
   * Load encrypted collaborator graph from unified user file.
   * @param {string} publicKey
   * @returns {object|null}
   */
  async loadCollaboratorBackup(publicKey) {
    const userFile = await this.loadUnifiedUser(publicKey);
    if (!userFile?.private?.collaborators) return null;
    return {
      version: userFile.private.collaborators.version ?? 1,
      cipher: userFile.private.collaborators.cipher ?? null,
      iv: userFile.private.collaborators.iv ?? null,
      updatedAt: userFile.private.collaborators.updatedAt ?? null,
    };
  }
}
