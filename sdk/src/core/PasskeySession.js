/**
 * Lightweight helper around WebAuthn / Passkeys for browser-only demos.
 * Relies on the browser verifying the authenticator. For production flows
 * a server should verify attestation and assertions before trusting output.
 */

import { randomIv } from './crypto.js';

const toBase64Url = (buffer) => {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  let string = '';
  for (const byte of bytes) {
    string += String.fromCharCode(byte);
  }
  return btoa(string).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64Url = (value) => {
  const str = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const normalized = str + pad;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const isBrowser = () => typeof window !== 'undefined' && typeof navigator !== 'undefined';

const getWindowCrypto = () => {
  if (!isBrowser() || !window.crypto || !window.crypto.getRandomValues) {
    throw new Error('Web Crypto not available in this environment');
  }
  return window.crypto;
};

export const isPasskeySupported = () => {
  if (!isBrowser()) return false;
  return (
    'PublicKeyCredential' in window &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator.credentials?.create === 'function'
  );
};

export const generateChallenge = (length = 32) => {
  const bytes = new Uint8Array(length);
  getWindowCrypto().getRandomValues(bytes);
  return bytes.buffer;
};

/**
 * Serialises a PublicKeyCredential into plain JS objects for storage.
 */
export const serializeCredential = (credential) => {
  if (!credential) return null;
  const { rawId, response, type, id } = credential;

  const attestationResponse = response;

  const serialized = {
    id,
    type,
    rawId: toBase64Url(rawId),
    clientDataJSON: toBase64Url(attestationResponse.clientDataJSON),
  };

  if (typeof attestationResponse.getTransports === 'function') {
    serialized.transports = attestationResponse.getTransports();
  }

  if (typeof attestationResponse.getAuthenticatorData === 'function') {
    serialized.authenticatorData = toBase64Url(attestationResponse.getAuthenticatorData());
  }

  if (typeof attestationResponse.getPublicKeyAlgorithm === 'function') {
    serialized.publicKeyAlgorithm = attestationResponse.getPublicKeyAlgorithm();
  }

  if (typeof attestationResponse.getPublicKey === 'function') {
    const pkBuffer = attestationResponse.getPublicKey();
    if (pkBuffer) {
      serialized.publicKey = toBase64Url(pkBuffer);
    }
  }

  if (attestationResponse.attestationObject) {
    serialized.attestationObject = toBase64Url(attestationResponse.attestationObject);
  }

  return serialized;
};

export const serializeAssertion = (credential) => {
  if (!credential) return null;
  const { rawId, response, type, id } = credential;

  return {
    id,
    type,
    rawId: toBase64Url(rawId),
    authenticatorData: toBase64Url(response.authenticatorData),
    clientDataJSON: toBase64Url(response.clientDataJSON),
    signature: toBase64Url(response.signature),
    userHandle: response.userHandle ? toBase64Url(response.userHandle) : null,
  };
};

/**
 * Derive a short-lived session key using the assertion signature and challenge.
 * This is not a substitute for server-side verification but gives us
 * deterministic per-assertion key material for local encryption.
 */
export const deriveSessionKey = async (serializedAssertion) => {
  if (!serializedAssertion?.signature || !serializedAssertion?.clientDataJSON) {
    throw new Error('Assertion missing signature or clientData');
  }

  const signatureBytes = new Uint8Array(fromBase64Url(serializedAssertion.signature));
  const clientDataBytes = new Uint8Array(fromBase64Url(serializedAssertion.clientDataJSON));

  const combined = new Uint8Array(signatureBytes.length + clientDataBytes.length);
  combined.set(signatureBytes, 0);
  combined.set(clientDataBytes, signatureBytes.length);

  const digest = await getWindowCrypto().subtle.digest('SHA-256', combined);
  return new Uint8Array(digest).slice(0, 32);
};

/**
 * Helper class to register and authenticate passkeys.
 */
export class PasskeySession {
  constructor({ rpId, rpName } = {}) {
    this.rpId = rpId ?? (isBrowser() ? window.location.hostname : undefined);
    this.rpName = rpName ?? 'localPod Identity';
  }

  async register({ username, displayName, userId }) {
    if (!isPasskeySupported()) {
      throw new Error('Passkeys not supported in this environment');
    }

    const userHandle =
      userId ??
      (() => {
        const random = randomIv(32);
        return random.buffer;
      })();

    const challenge = generateChallenge();

    const publicKey = {
      challenge,
      rp: {
        name: this.rpName,
        id: this.rpId,
      },
      user: {
        id: userHandle,
        name: username,
        displayName: displayName ?? username,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -8 }, // Ed25519
        { type: 'public-key', alg: -7 }, // ES256 as fallback
      ],
      timeout: 60_000,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      attestation: 'none',
    };

    const credential = await navigator.credentials.create({ publicKey });
    return {
      credential: serializeCredential(credential),
      challenge: toBase64Url(challenge),
    };
  }

  async authenticate({ allowCredentials } = {}) {
    if (!isPasskeySupported()) {
      throw new Error('Passkeys not supported in this environment');
    }

    const challenge = generateChallenge();

    const publicKey = {
      challenge,
      rpId: this.rpId,
      timeout: 60_000,
      userVerification: 'preferred',
      allowCredentials:
        allowCredentials?.map((cred) => ({
          type: 'public-key',
          id: fromBase64Url(cred.rawId ?? cred.id),
          transports: cred.transports ?? undefined,
        })) ?? undefined,
    };

    const assertion = await navigator.credentials.get({ publicKey });
    const serialized = serializeAssertion(assertion);
    return {
      assertion: serialized,
      challenge: toBase64Url(challenge),
      sessionKey: await deriveSessionKey(serialized),
    };
  }
}
