/**
 * Decentralized Identifier (DID) implementation using did:key method
 * Based on secp256k1 elliptic curve cryptography
 * @module sdk/core/DID
 */

import { utils, getPublicKey } from '@noble/secp256k1';
import { bytesToBase58, base58ToBytes, concatBytes } from '../utils/encoding.js';

// Multicodec prefix for secp256k1 public keys
// https://github.com/multiformats/multicodec/blob/master/table.csv
const MULTICODEC_SECP256K1_PUB = new Uint8Array([0xe7, 0x01]);

/**
 * Generate a DID from a public key using did:key method
 * @param {Uint8Array} publicKeyBytes - Compressed secp256k1 public key (33 bytes)
 * @returns {string} DID in format "did:key:z{base58(multicodec-prefix + public-key)}"
 * @example
 * // Returns: "did:key:z8mwaSFxvPqEQjCrpNu9i7LoWd3Xp1r2h4N5k6M7t8Y9u"
 */
export const didFromPublicKey = (publicKeyBytes) => {
  const identifier = concatBytes(MULTICODEC_SECP256K1_PUB, publicKeyBytes);
  return `did:key:z${bytesToBase58(identifier)}`;
};

/**
 * Extract public key bytes from a did:key DID
 * @param {string} did - DID string
 * @returns {Uint8Array} Compressed public key bytes
 * @throws {Error} If DID format is invalid
 */
export const publicKeyFromDid = (did) => {
  if (!did?.startsWith('did:key:z')) {
    throw new Error('Invalid DID format: must start with "did:key:z"');
  }

  const base58Part = did.slice(9); // Remove "did:key:z" prefix
  const identifierBytes = base58ToBytes(base58Part);

  // Verify multicodec prefix
  if (identifierBytes[0] !== MULTICODEC_SECP256K1_PUB[0] ||
      identifierBytes[1] !== MULTICODEC_SECP256K1_PUB[1]) {
    throw new Error('Invalid DID: unsupported key type (expected secp256k1)');
  }

  // Extract public key (skip 2-byte multicodec prefix)
  return identifierBytes.slice(2);
};

/**
 * Generate a new secp256k1 key pair
 * @returns {{privateKey: Uint8Array, publicKey: Uint8Array}} Key pair
 */
export const generateKeyPair = () => {
  const privateKey = utils.randomPrivateKey();
  const publicKey = getPublicKey(privateKey, true); // compressed format
  return { privateKey, publicKey };
};

/**
 * Get public key from private key
 * @param {Uint8Array} privateKey - Private key bytes
 * @returns {Uint8Array} Compressed public key bytes
 */
export const getPublicKeyFromPrivate = (privateKey) => {
  return getPublicKey(privateKey, true);
};

/**
 * Validate DID format
 * @param {string} did - DID to validate
 * @returns {boolean} True if valid
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
 * Validate secp256k1 public key
 * @param {Uint8Array} publicKey - Public key bytes
 * @returns {boolean} True if valid
 */
export const isValidPublicKey = (publicKey) => {
  if (!publicKey || publicKey.length !== 33) {
    return false;
  }

  // First byte must be 0x02 or 0x03 (compressed format)
  if (publicKey[0] !== 0x02 && publicKey[0] !== 0x03) {
    return false;
  }

  return true;
};
