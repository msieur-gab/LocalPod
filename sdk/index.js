/**
 * @localPod/identity-platform
 * Decentralized Identity Platform SDK
 *
 * A comprehensive SDK for building encrypted, decentralized applications
 * with DID-based authentication, profiles, and collaborator management.
 *
 * @version 1.0.0
 * @license MIT
 */

// Main SDK class
export { IdentityPlatform } from './src/IdentityPlatform.js';

// Services
export { AccountService } from './src/services/AccountService.js';
export { ProfileService } from './src/services/ProfileService.js';
export { CollaboratorService } from './src/services/CollaboratorService.js';

// Core modules
export { didFromPublicKey, publicKeyFromDid, generateKeyPair, isValidDid, isValidPublicKey } from './src/core/DID.js';
export {
  generateDocumentKey,
  encryptWithKey,
  decryptWithKey,
  encryptPrivateKey,
  decryptPrivateKey,
  deriveEncryptionKey,
  encryptForRecipient,
  decryptFromSender,
  PBKDF2_ITERATIONS,
} from './src/core/crypto.js';

// Storage
export { PlatformDatabase, getPlatformDatabase } from './src/storage/PlatformDatabase.js';
export * as DatabaseOps from './src/storage/PlatformDatabase.js';

// Utilities
export {
  bytesToBase58,
  base58ToBytes,
  bytesToBase64,
  base64ToBytes,
  stringToBytes,
  bytesToString,
  concatBytes,
} from './src/utils/encoding.js';

// Version
export const SDK_VERSION = '1.0.0';
