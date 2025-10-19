import { utils, getPublicKey, getSharedSecret } from '@noble/secp256k1';
import { base58 } from '@scure/base';
import { saveAccount, getAccount, listAccounts as listAccountsFromStore, saveBackup } from './storage.js';

const MULTICODEC_SECP256K1_PUB = new Uint8Array([0xe7, 0x01]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const concatBytes = (prefix, bytes) => {
  const buffer = new Uint8Array(prefix.length + bytes.length);
  buffer.set(prefix, 0);
  buffer.set(bytes, prefix.length);
  return buffer;
};

const bytesToBase58 = (bytes) => base58.encode(bytes);
const base58ToBytes = (value) => base58.decode(value);

const bytesToBase64 = (bytes) => {
  if (!bytes || bytes.length === 0) return '';

  if (typeof btoa === 'function') {
    let binary = '';
    const len = bytes.length;
    for (let i = 0; i < len; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  return Buffer.from(bytes).toString('base64');
};

const base64ToBytes = (value) => {
  if (!value) return new Uint8Array();

  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  return new Uint8Array(Buffer.from(value, 'base64'));
};

const didFromPublicKey = (publicKeyBytes) => {
  const identifier = concatBytes(MULTICODEC_SECP256K1_PUB, publicKeyBytes);
  return `did:key:z${bytesToBase58(identifier)}`;
};

const deriveEncryptionKey = async (privateKeyBytes, publicKeyBytes) => {
  const sharedSecret = getSharedSecret(privateKeyBytes, publicKeyBytes, true);
  // getSharedSecret returns 33 bytes with the first byte representing parity; drop it.
  const keyMaterial = sharedSecret.slice(1);
  const hashed = await crypto.subtle.digest('SHA-256', keyMaterial);
  return crypto.subtle.importKey('raw', hashed, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

const importAesKey = (keyBytes) => crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);

const randomIv = (length = 12) => {
  const iv = new Uint8Array(length);
  crypto.getRandomValues(iv);
  return iv;
};

const encryptWithKey = async (key, data, iv = randomIv()) => {
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { ciphertext: new Uint8Array(cipherBuffer), iv };
};

const decryptWithKey = async (key, ciphertext, iv) => {
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plainBuffer);
};

export const generateDocumentKey = () => {
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  return key;
};

let unlockedIdentity = null;
let currentAccountRecord = null;

const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_SALT_BYTES = 16;

const deriveKeyFromPassword = async (password, saltBytes, iterations = PBKDF2_ITERATIONS) => {
  const passwordKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

const encryptPrivateKey = async (privateKeyBytes, password) => {
  const salt = randomIv(PBKDF2_SALT_BYTES);
  const wrapKey = await deriveKeyFromPassword(password, salt);
  const { ciphertext, iv } = await encryptWithKey(wrapKey, privateKeyBytes);
  return {
    encryptedPrivateKey: bytesToBase64(ciphertext),
    encryptionIv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    iterations: PBKDF2_ITERATIONS,
  };
};

const decryptPrivateKey = async ({ encryptedPrivateKey, encryptionIv, salt, iterations }, password) => {
  if (!encryptedPrivateKey || !encryptionIv || !salt) {
    throw new Error('Invalid encrypted key payload');
  }
  const saltBytes = base64ToBytes(salt);
  const wrapKey = await deriveKeyFromPassword(password, saltBytes, iterations ?? PBKDF2_ITERATIONS);
  const keyBytes = await decryptWithKey(wrapKey, base64ToBytes(encryptedPrivateKey), base64ToBytes(encryptionIv));
  return keyBytes;
};

export class SimpleDID {
  static async listAccounts() {
    return listAccountsFromStore();
  }

  static isUnlocked() {
    return Boolean(unlockedIdentity);
  }

  static getUnlockedIdentity() {
    if (!unlockedIdentity) return null;
    const { did, publicKey, privateKey, username, createdAt } = unlockedIdentity;
    return {
      did,
      publicKey: bytesToBase58(publicKey),
      privateKey: bytesToBase64(privateKey),
      username,
      createdAt,
    };
  }

  static async createAccount({ username, password }) {
    const normalized = username?.trim();
    if (!normalized || !password) {
      throw new Error('Username and password are required');
    }
    const existing = await getAccount(normalized);
    if (existing) {
      throw new Error('Username already exists. Choose another.');
    }

    const privateKey = utils.randomPrivateKey();
    const publicKey = getPublicKey(privateKey, true);
    const did = didFromPublicKey(publicKey);
    const now = new Date().toISOString();
    const encrypted = await encryptPrivateKey(privateKey, password);

    const accountRecord = await saveAccount({
      username: normalized,
      did,
      publicKey: bytesToBase58(publicKey),
      createdAt: now,
      ...encrypted,
    });

    currentAccountRecord = accountRecord;
    if (encrypted.encryptedPrivateKey && encrypted.encryptionIv && encrypted.salt) {
      await saveBackup({
        publicKey: accountRecord.publicKey,
        cipher: encrypted.encryptedPrivateKey,
        iv: encrypted.encryptionIv,
        salt: encrypted.salt,
        iterations: encrypted.iterations,
        updatedAt: accountRecord.updatedAt ?? now,
      });
    }

    unlockedIdentity = {
      username: normalized,
      did,
      publicKey,
      privateKey,
      createdAt: now,
    };
    return this.getUnlockedIdentity();
  }

  static async unlock({ username, password }) {
    const normalized = username?.trim();
    if (!normalized || !password) {
      throw new Error('Username and password are required');
    }
    const account = await getAccount(normalized);
    if (!account) {
      throw new Error('Account not found');
    }
    const privateKeyBytes = await decryptPrivateKey(account, password);
    const publicKeyBytes = base58ToBytes(account.publicKey);

    unlockedIdentity = {
      username: account.username,
      did: account.did,
      publicKey: publicKeyBytes,
      privateKey: privateKeyBytes,
      createdAt: account.createdAt,
    };
    currentAccountRecord = account;
    if (account.encryptedPrivateKey && account.encryptionIv && account.salt) {
      await saveBackup({
        publicKey: account.publicKey,
        cipher: account.encryptedPrivateKey,
        iv: account.encryptionIv,
        salt: account.salt,
        iterations: account.iterations,
        updatedAt: account.updatedAt,
      });
    }
    return this.getUnlockedIdentity();
  }

  static lock() {
    unlockedIdentity = null;
    currentAccountRecord = null;
  }

  static getCurrentAccount() {
    return currentAccountRecord ? { ...currentAccountRecord } : null;
  }

  static getBackupPayload() {
    if (!currentAccountRecord) {
      throw new Error('No account loaded');
    }
    if (!currentAccountRecord.encryptedPrivateKey || !currentAccountRecord.encryptionIv || !currentAccountRecord.salt) {
      return null;
    }
    return {
      publicKey: currentAccountRecord.publicKey,
      encryptedPrivateKey: currentAccountRecord.encryptedPrivateKey,
      encryptionIv: currentAccountRecord.encryptionIv,
      salt: currentAccountRecord.salt,
      iterations:
        typeof currentAccountRecord.iterations === 'number'
          ? currentAccountRecord.iterations
          : parseInt(currentAccountRecord.iterations, 10) || undefined,
      updatedAt: currentAccountRecord.updatedAt ?? new Date().toISOString(),
      createdAt: currentAccountRecord.createdAt ?? null,
    };
  }

  static getAccountMapping() {
    if (!currentAccountRecord) return null;
    return {
      username: currentAccountRecord.username,
      publicKey: currentAccountRecord.publicKey,
      did: currentAccountRecord.did,
    };
  }

  static async importAccountFromBackup({ username, password, backup }) {
    const normalized = username?.trim();
    if (!normalized || !password) {
      throw new Error('Username and password are required');
    }
    if (!backup?.encryptedPrivateKey || !backup.encryptionIv || !backup.salt) {
      throw new Error('Backup payload is incomplete');
    }

    const iterations =
      typeof backup.iterations === 'number' ? backup.iterations : parseInt(backup.iterations, 10) || undefined;

    const privateKeyBytes = await decryptPrivateKey(
      {
        encryptedPrivateKey: backup.encryptedPrivateKey,
        encryptionIv: backup.encryptionIv,
        salt: backup.salt,
        iterations,
      },
      password,
    );

    const publicKeyBytes = getPublicKey(privateKeyBytes, true);
    const did = didFromPublicKey(publicKeyBytes);
    const now = new Date().toISOString();

    const accountRecord = await saveAccount({
      username: normalized,
      did,
      publicKey: bytesToBase58(publicKeyBytes),
      createdAt: backup.createdAt ?? now,
      updatedAt: backup.updatedAt ?? now,
      encryptedPrivateKey: backup.encryptedPrivateKey,
      encryptionIv: backup.encryptionIv,
      salt: backup.salt,
      iterations,
    });

    currentAccountRecord = accountRecord;
    await saveBackup({
      publicKey: accountRecord.publicKey,
      cipher: backup.encryptedPrivateKey,
      iv: backup.encryptionIv,
      salt: backup.salt,
      iterations,
      updatedAt: backup.updatedAt ?? now,
    });

    unlockedIdentity = {
      username: normalized,
      did,
      publicKey: publicKeyBytes,
      privateKey: privateKeyBytes,
      createdAt: accountRecord.createdAt,
    };

    return this.getUnlockedIdentity();
  }

  static requireUnlocked() {
    if (!unlockedIdentity) {
      throw new Error('Identity is locked. Authenticate first.');
    }
    return unlockedIdentity;
  }

  static async encryptText(text, recipientPublicKey, { senderPrivateKey } = {}) {
    const messageBytes = encoder.encode(text);
    const privateKeyBytes = senderPrivateKey
      ? base64ToBytes(senderPrivateKey)
      : this.requireUnlocked().privateKey;
    const recipientBytes =
      typeof recipientPublicKey === 'string' ? base58ToBytes(recipientPublicKey) : recipientPublicKey;

    const encryptionKey = await deriveEncryptionKey(privateKeyBytes, recipientBytes);
    const { ciphertext, iv } = await encryptWithKey(encryptionKey, messageBytes);

    return {
      ciphertext: bytesToBase64(ciphertext),
      iv: bytesToBase64(iv),
    };
  }

  static async decryptText({ ciphertext, iv }, senderPublicKey, { recipientPrivateKey } = {}) {
    if (!ciphertext || !iv) throw new Error('Invalid ciphertext payload');
    const cipherBytes = base64ToBytes(ciphertext);
    const ivBytes = base64ToBytes(iv);
    const privateKeyBytes = recipientPrivateKey
      ? base64ToBytes(recipientPrivateKey)
      : this.requireUnlocked().privateKey;
    let senderBytes;
    if (wrappedKey?.epk) {
      senderBytes = typeof wrappedKey.epk === 'string' ? base58ToBytes(wrappedKey.epk) : wrappedKey.epk;
    } else {
      senderBytes = typeof senderPublicKey === 'string' ? base58ToBytes(senderPublicKey) : senderPublicKey;
    }

    const decryptionKey = await deriveEncryptionKey(privateKeyBytes, senderBytes);
    const plainBytes = await decryptWithKey(decryptionKey, cipherBytes, ivBytes);
    return decoder.decode(plainBytes);
  }

  static async encryptDocument(content, recipientsPublicKeys, { includeSelf = true } = {}) {
    const documentKey = generateDocumentKey();
    const aesKey = await importAesKey(documentKey);
    const { ciphertext, iv } = await encryptWithKey(aesKey, encoder.encode(content));

    const { privateKey: privateKeyBytes, publicKey: selfPublicBytes } = this.requireUnlocked();
    const wrappedKeys = {};
    const targets = [...new Set(recipientsPublicKeys)];

    if (includeSelf) {
      const selfPublic = bytesToBase58(selfPublicBytes);
      if (!targets.includes(selfPublic)) {
        targets.push(selfPublic);
      }
    }

    const senderPublic = bytesToBase58(selfPublicBytes);

    for (const recipient of targets) {
      const recipientBytes = typeof recipient === 'string' ? base58ToBytes(recipient) : recipient;
      const sharedKey = await deriveEncryptionKey(privateKeyBytes, recipientBytes);
      const wrapIv = randomIv();
      const encryptedKey = await encryptWithKey(sharedKey, documentKey, wrapIv);
      const recipientKey = typeof recipient === 'string' ? recipient : bytesToBase58(recipientBytes);
      wrappedKeys[recipientKey] = {
        key: bytesToBase64(encryptedKey.ciphertext),
        iv: bytesToBase64(encryptedKey.iv),
        sender: senderPublic,
      };
    }

    return {
      documentKey: bytesToBase64(documentKey),
      ciphertext: bytesToBase64(ciphertext),
      iv: bytesToBase64(iv),
      wrappedKeys,
    };
  }

  static async decryptDocument({ ciphertext, iv, wrappedKey }, senderPublicKey, { recipientPrivateKey } = {}) {
    const privateKeyBytes = recipientPrivateKey
      ? base64ToBytes(recipientPrivateKey)
      : this.requireUnlocked().privateKey;
    const senderValue = wrappedKey?.sender ?? senderPublicKey;
    const senderBytes = typeof senderValue === 'string' ? base58ToBytes(senderValue) : senderValue;
    const cipherBytes = base64ToBytes(ciphertext);
    const ivBytes = base64ToBytes(iv);

    const sharedKey = await deriveEncryptionKey(privateKeyBytes, senderBytes);
    const wrapped = base64ToBytes(wrappedKey.key);
    const wrapIv = base64ToBytes(wrappedKey.iv);
    const documentKeyBytes = await decryptWithKey(sharedKey, wrapped, wrapIv);
    const aesKey = await importAesKey(documentKeyBytes);
    const plainBytes = await decryptWithKey(aesKey, cipherBytes, ivBytes);
    return decoder.decode(plainBytes);
  }
}

export const encoding = {
  bytesToBase58,
  base58ToBytes,
  bytesToBase64,
  base64ToBytes,
};
