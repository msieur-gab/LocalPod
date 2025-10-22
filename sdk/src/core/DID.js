/**
 * Decentralized Identifier (DID) helpers using did:key with Ed25519 keys.
 * @module sdk/core/DID
 */

import * as nobleCurves from '@noble/curves/ed25519';
import { bytesToBase58, base58ToBytes, concatBytes } from '../utils/encoding.js';

const { ed25519 } = nobleCurves;

// Multicodec prefix for Ed25519 public keys (0xed, 0x01)
// https://github.com/multiformats/multicodec/blob/master/table.csv
const MULTICODEC_ED25519_PUB = new Uint8Array([0xed, 0x01]);

/**
 * Generate a DID from an Ed25519 public key using did:key.
 * @param {Uint8Array} publicKeyBytes - Ed25519 public key (32 bytes)
 * @returns {string} DID in "did:key:z..." form.
 */
export const didFromPublicKey = (publicKeyBytes) => {
  if (!isValidPublicKey(publicKeyBytes)) {
    throw new Error('Invalid Ed25519 public key');
  }

  const identifier = concatBytes(MULTICODEC_ED25519_PUB, publicKeyBytes);
  return `did:key:z${bytesToBase58(identifier)}`;
};

/**
 * Extract Ed25519 public key bytes from a did:key DID.
 * @param {string} did - DID string.
 * @returns {Uint8Array} Public key bytes (32 bytes).
 */
export const publicKeyFromDid = (did) => {
  if (!did?.startsWith('did:key:z')) {
    throw new Error('Invalid DID format: must start with "did:key:z"');
  }

  const base58Part = did.slice(9);
  const identifierBytes = base58ToBytes(base58Part);

  if (
    identifierBytes.length !== MULTICODEC_ED25519_PUB.length + 32 ||
    identifierBytes[0] !== MULTICODEC_ED25519_PUB[0] ||
    identifierBytes[1] !== MULTICODEC_ED25519_PUB[1]
  ) {
    throw new Error('Invalid DID: unsupported key type (expected Ed25519)');
  }

  return identifierBytes.slice(MULTICODEC_ED25519_PUB.length);
};

/**
 * Generate a new Ed25519 signing key pair.
 * @returns {{privateKey: Uint8Array, publicKey: Uint8Array}}
 */
export const generateKeyPair = () => {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
};

/**
 * Derive the Ed25519 public key from a private key.
 * @param {Uint8Array} privateKey
 * @returns {Uint8Array}
 */
export const getPublicKeyFromPrivate = (privateKey) => {
  return ed25519.getPublicKey(privateKey);
};

/**
 * Validate DID format.
 * @param {string} did
 * @returns {boolean}
 */
export const isValidDid = (did) => {
  try {
    publicKeyFromDid(did);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate Ed25519 public key (32 bytes).
 * @param {Uint8Array} publicKey
 * @returns {boolean}
 */
export const isValidPublicKey = (publicKey) => {
  return publicKey instanceof Uint8Array && publicKey.length === 32;
};
