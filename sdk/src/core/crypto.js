/**
 * Core cryptography module for encryption, key derivation, and signing
 * Uses Web Crypto API and @noble/secp256k1
 * @module sdk/core/crypto
 */

import { getSharedSecret } from '@noble/secp256k1';
import { stringToBytes, bytesToString } from '../utils/encoding.js';

// PBKDF2 configuration (OWASP 2023 recommendations)
export const PBKDF2_ITERATIONS = 600_000; // Increased from 210k
export const PBKDF2_SALT_BYTES = 16;

// AES-GCM configuration
const AES_KEY_LENGTH = 256;
const AES_IV_LENGTH = 12;

/**
 * Generate random initialization vector
 * @param {number} length - IV length in bytes (default: 12 for AES-GCM)
 * @returns {Uint8Array}
 */
export const randomIv = (length = AES_IV_LENGTH) => {
  const iv = new Uint8Array(length);
  crypto.getRandomValues(iv);
  return iv;
};

/**
 * Generate random document encryption key (256-bit AES)
 * @returns {Uint8Array}
 */
export const generateDocumentKey = () => {
  const key = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(key);
  return key;
};

/**
 * Import raw bytes as AES-GCM key
 * @param {Uint8Array} keyBytes
 * @returns {Promise<CryptoKey>}
 */
export const importAesKey = (keyBytes) => {
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

/**
 * Encrypt data with AES-GCM
 * @param {CryptoKey} key - AES key
 * @param {Uint8Array} data - Data to encrypt
 * @param {Uint8Array} [iv] - Initialization vector (auto-generated if not provided)
 * @returns {Promise<{ciphertext: Uint8Array, iv: Uint8Array}>}
 */
export const encryptWithKey = async (key, data, iv = randomIv()) => {
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return {
    ciphertext: new Uint8Array(cipherBuffer),
    iv,
  };
};

/**
 * Decrypt data with AES-GCM
 * @param {CryptoKey} key - AES key
 * @param {Uint8Array} ciphertext - Encrypted data
 * @param {Uint8Array} iv - Initialization vector
 * @returns {Promise<Uint8Array>}
 */
export const decryptWithKey = async (key, ciphertext, iv) => {
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plainBuffer);
};

/**
 * Derive AES-GCM key from password using PBKDF2
 * @param {string} password - User password
 * @param {Uint8Array} salt - Salt bytes
 * @param {number} [iterations=PBKDF2_ITERATIONS] - PBKDF2 iterations
 * @returns {Promise<CryptoKey>}
 */
export const deriveKeyFromPassword = async (password, salt, iterations = PBKDF2_ITERATIONS) => {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    stringToBytes(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
};

/**
 * Encrypt private key with password using PBKDF2 + AES-GCM
 * @param {Uint8Array} privateKeyBytes - Private key to encrypt
 * @param {string} password - Password for encryption
 * @returns {Promise<{encryptedPrivateKey: string, encryptionIv: string, salt: string, iterations: number}>}
 */
export const encryptPrivateKey = async (privateKeyBytes, password) => {
  const salt = randomIv(PBKDF2_SALT_BYTES);
  const wrapKey = await deriveKeyFromPassword(password, salt);
  const { ciphertext, iv } = await encryptWithKey(wrapKey, privateKeyBytes);

  return {
    encryptedPrivateKey: ciphertext,
    encryptionIv: iv,
    salt,
    iterations: PBKDF2_ITERATIONS,
  };
};

/**
 * Decrypt private key with password using PBKDF2 + AES-GCM
 * @param {Object} encrypted - Encrypted key payload
 * @param {Uint8Array} encrypted.encryptedPrivateKey - Encrypted private key
 * @param {Uint8Array} encrypted.encryptionIv - IV used for encryption
 * @param {Uint8Array} encrypted.salt - Salt used for key derivation
 * @param {number} [encrypted.iterations] - PBKDF2 iterations
 * @param {string} password - Password for decryption
 * @returns {Promise<Uint8Array>}
 */
export const decryptPrivateKey = async (encrypted, password) => {
  const { encryptedPrivateKey, encryptionIv, salt, iterations } = encrypted;

  if (!encryptedPrivateKey || !encryptionIv || !salt) {
    throw new Error('Invalid encrypted key payload: missing required fields');
  }

  const wrapKey = await deriveKeyFromPassword(password, salt, iterations ?? PBKDF2_ITERATIONS);
  const keyBytes = await decryptWithKey(wrapKey, encryptedPrivateKey, encryptionIv);

  return keyBytes;
};

/**
 * Derive shared encryption key from ECDH shared secret
 * Uses secp256k1 curve for key agreement, SHA-256 for KDF
 * @param {Uint8Array} privateKeyBytes - Local private key
 * @param {Uint8Array} publicKeyBytes - Remote public key (compressed, 33 bytes)
 * @returns {Promise<CryptoKey>}
 */
export const deriveEncryptionKey = async (privateKeyBytes, publicKeyBytes) => {
  const sharedSecret = getSharedSecret(privateKeyBytes, publicKeyBytes, true);

  // getSharedSecret returns 33 bytes with first byte representing parity; drop it
  const keyMaterial = sharedSecret.slice(1);

  // Hash to get consistent 256-bit key
  const hashed = await crypto.subtle.digest('SHA-256', keyMaterial);

  return crypto.subtle.importKey('raw', hashed, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

/**
 * Encrypt text for a recipient using ECDH
 * @param {string} text - Text to encrypt
 * @param {Uint8Array} recipientPublicKey - Recipient's public key (bytes)
 * @param {Uint8Array} senderPrivateKey - Sender's private key (bytes)
 * @returns {Promise<{ciphertext: Uint8Array, iv: Uint8Array}>}
 */
export const encryptForRecipient = async (text, recipientPublicKey, senderPrivateKey) => {
  const messageBytes = stringToBytes(text);
  const encryptionKey = await deriveEncryptionKey(senderPrivateKey, recipientPublicKey);
  return encryptWithKey(encryptionKey, messageBytes);
};

/**
 * Decrypt text from a sender using ECDH
 * @param {Uint8Array} ciphertext - Encrypted data
 * @param {Uint8Array} iv - Initialization vector
 * @param {Uint8Array} senderPublicKey - Sender's public key (bytes)
 * @param {Uint8Array} recipientPrivateKey - Recipient's private key (bytes)
 * @returns {Promise<string>}
 */
export const decryptFromSender = async (ciphertext, iv, senderPublicKey, recipientPrivateKey) => {
  const decryptionKey = await deriveEncryptionKey(recipientPrivateKey, senderPublicKey);
  const plainBytes = await decryptWithKey(decryptionKey, ciphertext, iv);
  return bytesToString(plainBytes);
};
