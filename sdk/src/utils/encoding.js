/**
 * Encoding utilities for base58, base64, and byte array conversions
 * @module sdk/utils/encoding
 */

import { base58 } from '@scure/base';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Convert bytes to Base58 string
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export const bytesToBase58 = (bytes) => base58.encode(bytes);

/**
 * Convert Base58 string to bytes
 * @param {string} value
 * @returns {Uint8Array}
 */
export const base58ToBytes = (value) => base58.decode(value);

/**
 * Convert bytes to Base64 string
 * Optimized for browser and Node.js environments
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export const bytesToBase64 = (bytes) => {
  if (!bytes || bytes.length === 0) return '';

  if (typeof btoa === 'function') {
    // Browser optimized: use String.fromCharCode with chunking for large arrays
    const chunkSize = 8192;
    let binary = '';

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  }

  // Node.js fallback
  return Buffer.from(bytes).toString('base64');
};

/**
 * Convert Base64 string to bytes
 * @param {string} value
 * @returns {Uint8Array}
 */
export const base64ToBytes = (value) => {
  if (!value) return new Uint8Array();

  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Node.js fallback
  return new Uint8Array(Buffer.from(value, 'base64'));
};

/**
 * Convert string to bytes
 * @param {string} text
 * @returns {Uint8Array}
 */
export const stringToBytes = (text) => encoder.encode(text);

/**
 * Convert bytes to string
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export const bytesToString = (bytes) => decoder.decode(bytes);

/**
 * Concatenate byte arrays
 * @param {...Uint8Array} arrays
 * @returns {Uint8Array}
 */
export const concatBytes = (...arrays) => {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
};
