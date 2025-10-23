/**
 * Challenge Signing for Service Authentication
 * @module sdk/core/Challenge
 *
 * Handles creation of signed payloads for redirect-based service enrollment.
 *
 * Redirect URL format (initiated by service):
 *   localpod://auth?challenge=<challenge_string>&service_did=<did:key:...>&callback_url=<https-url>
 */

import { signMessage } from './crypto.js';
import { stringToBytes, bytesToBase64 } from '../utils/encoding.js';

const assertString = (value, field) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
};

const assertUint8Array = (value, field) => {
  if (!(value instanceof Uint8Array)) {
    throw new Error(`${field} must be a Uint8Array`);
  }
};

/**
 * Sign a service-issued challenge with the user's Ed25519 private key.
 * @param {Object} params
 * @param {string} params.challenge - Raw challenge string supplied by the service.
 * @param {Uint8Array} params.privateKey - Ed25519 private key bytes.
 * @param {string} params.did - User DID to include in the response payload.
 * @returns {Promise<{did: string, signature: string, challenge: string}>}
 */
export const signChallenge = async ({ challenge, privateKey, did }) => {
  assertString(challenge, 'challenge');
  assertString(did, 'did');
  assertUint8Array(privateKey, 'privateKey');

  const challengeBytes = stringToBytes(challenge);
  const signatureBytes = await signMessage(challengeBytes, privateKey);

  return {
    did,
    challenge,
    signature: bytesToBase64(signatureBytes),
  };
};
