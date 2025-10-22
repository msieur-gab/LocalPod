import { bytesToBase58, base58ToBytes, bytesToBase64, base64ToBytes, stringToBytes } from '../utils/encoding.js';
import {
  generateDocumentKey,
  deriveEncryptionKey,
  encryptWithKey,
  decryptWithKey,
  signMessage,
  verifySignature,
  getEncryptionPublicKey,
} from './crypto.js';

const getCrypto = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto not available in this environment');
};

const toSortedObject = (input) => {
  if (Array.isArray(input)) {
    return input.map((value) => toSortedObject(value));
  }

  if (input && typeof input === 'object') {
    const sorted = Object.keys(input)
      .sort()
      .reduce((acc, key) => {
        acc[key] = toSortedObject(input[key]);
        return acc;
      }, {});
    return sorted;
  }

  return input;
};

const stableStringify = (value) => JSON.stringify(toSortedObject(value));

const randomBytes = (length = 16) => {
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return bytes;
};

export const generateGrantId = () => {
  return `cap-${bytesToBase58(randomBytes(8))}`;
};

const buildPayload = ({
  id,
  granterDid,
  subjectDid,
  resourceId,
  rights,
  issuedAt,
  expiresAt,
  version,
  metadata,
}) => {
  return {
    id,
    granterDid,
    subjectDid,
    resourceId,
    rights: rights?.slice().sort() ?? [],
    issuedAt,
    expiresAt: expiresAt ?? null,
    version,
    metadata: metadata ?? null,
  };
};

const payloadToBytes = (payload) => {
  return stringToBytes(stableStringify(payload));
};

const hashBytes = async (bytes) => {
  const digest = await getCrypto().subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
};

export const createCapabilityGrant = async ({
  granterDid,
  granterSigningPrivateKey,
  granterEncryptionPrivateKey,
  subjectDid,
  subjectEncryptionPublicKey,
  resourceId,
  rights,
  expiresAt,
  metadata,
  documentKey,
}) => {
  if (!granterDid || !subjectDid || !resourceId) {
    throw new Error('Capability grant requires granterDid, subjectDid, and resourceId');
  }

  const issuedAt = new Date().toISOString();
  const version = 1;
  const id = generateGrantId();
  const payload = buildPayload({
    id,
    granterDid,
    subjectDid,
    resourceId,
    rights,
    issuedAt,
    expiresAt,
    version,
    metadata,
  });

  const payloadBytes = payloadToBytes(payload);
  const signatureBytes = await signMessage(payloadBytes, granterSigningPrivateKey);
  const payloadHashBytes = await hashBytes(payloadBytes);

  let wrappedKey = null;
  let documentKeyBytes = documentKey ?? generateDocumentKey();

  if (!subjectEncryptionPublicKey) {
    throw new Error('Capability grant requires subject encryption public key');
  }

  const encryptionKey = await deriveEncryptionKey(
    granterEncryptionPrivateKey,
    base58ToBytes(subjectEncryptionPublicKey)
  );

  const encrypted = await encryptWithKey(encryptionKey, documentKeyBytes);
  wrappedKey = {
    ciphertext: bytesToBase64(encrypted.ciphertext),
    iv: bytesToBase64(encrypted.iv),
  };

  return {
    id,
    payload,
    payloadEncoded: stableStringify(payload),
    payloadHash: bytesToBase64(payloadHashBytes),
    signature: bytesToBase64(signatureBytes),
    granterDid,
    subjectDid,
    resourceId,
    rights: payload.rights,
    issuedAt,
    expiresAt: expiresAt ?? null,
    version,
    metadata: payload.metadata,
    wrappedKey,
    encryptionPublicKey: bytesToBase58(getEncryptionPublicKey(granterEncryptionPrivateKey)),
    subjectEncryptionPublicKey,
  };
};

export const verifyCapabilityGrant = async (grant, granterSigningPublicKey) => {
  if (!grant) return false;
  const payloadString = grant.payloadEncoded ?? stableStringify(grant.payload);
  const payloadBytes = stringToBytes(payloadString);
  const signatureBytes = base64ToBytes(grant.signature);
  return verifySignature(signatureBytes, payloadBytes, base58ToBytes(granterSigningPublicKey));
};

export const unwrapCapabilityKey = async ({ grant, recipientEncryptionPrivateKey }) => {
  if (!grant?.wrappedKey) {
    throw new Error('Capability grant missing wrapped key');
  }

  if (!grant.encryptionPublicKey) {
    throw new Error('Capability grant missing granter encryption public key');
  }

  const encryptionKey = await deriveEncryptionKey(
    recipientEncryptionPrivateKey,
    base58ToBytes(grant.encryptionPublicKey)
  );

  const ciphertext = base64ToBytes(grant.wrappedKey.ciphertext);
  const iv = base64ToBytes(grant.wrappedKey.iv);
  const keyBytes = await decryptWithKey(encryptionKey, ciphertext, iv);
  return keyBytes;
};

export const buildGrantRecord = (grant, sequence = null) => {
  return {
    id: grant.id,
    granterDid: grant.granterDid,
    subjectDid: grant.subjectDid,
    resourceId: grant.resourceId,
    rights: grant.rights,
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
    version: grant.version,
    payloadEncoded: grant.payloadEncoded,
    signature: grant.signature,
    payloadHash: grant.payloadHash,
    wrappedKey: grant.wrappedKey,
    encryptionPublicKey: grant.encryptionPublicKey,
    subjectEncryptionPublicKey: grant.subjectEncryptionPublicKey,
    metadata: grant.metadata ?? null,
    sequence,
    updatedAt: new Date().toISOString(),
  };
};
