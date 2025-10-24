/**
 * CapabilityService
 *
 * Implements UCAN (User-Controlled Authorization Networks) token generation and validation.
 *
 * UCANs are JWT-formatted capability tokens that allow:
 * - Fine-grained authorization (specific resources + actions)
 * - Time-limited delegation (expiration timestamps)
 * - Offline verification (cryptographically signed, no live server needed)
 * - Delegation chains (tokens can delegate to other tokens)
 *
 * Reference: https://github.com/ucan-wg/spec
 */

import { ed25519 } from '@noble/curves/ed25519';
import { base64url } from '@scure/base';

const UCAN_VERSION = '0.10.0';
const DEFAULT_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

export class CapabilityService {
  constructor({ accountService }) {
    this.accountService = accountService;
  }

  /**
   * Create a UCAN token
   *
   * @param {Object} params - UCAN parameters
   * @param {string} params.issuerDid - Issuer's DID (user granting permission)
   * @param {Uint8Array} params.issuerPrivateKey - Issuer's Ed25519 private key (32 bytes)
   * @param {string} params.audienceDid - Audience's DID (service receiving permission)
   * @param {Array<{with: string, can: string}>} params.attenuations - Permissions being granted
   * @param {number} [params.expiresIn] - Token lifetime in seconds (default: 7 days)
   * @param {Array<string>} [params.proofs] - Proof chain (array of UCAN tokens for delegation)
   * @param {Object} [params.metadata] - Additional metadata
   * @returns {Promise<string>} - JWT-encoded UCAN token
   *
   * @example
   * const ucan = await capabilityService.createUCAN({
   *   issuerDid: 'did:key:z6Mk...',
   *   issuerPrivateKey: privateKeyBytes,
   *   audienceDid: 'did:key:z6Mk...',
   *   attenuations: [
   *     { with: 'ipfs://userPublicKey/notes/*', can: 'storage/write' }
   *   ],
   *   expiresIn: 7 * 24 * 60 * 60  // 7 days
   * });
   */
  async createUCAN({
    issuerDid,
    issuerPrivateKey,
    audienceDid,
    attenuations,
    expiresIn = DEFAULT_EXPIRY,
    proofs = [],
    metadata = {}
  }) {
    // Validate inputs
    if (!issuerDid || !issuerDid.startsWith('did:')) {
      throw new Error('Invalid issuer DID');
    }
    if (!audienceDid || !audienceDid.startsWith('did:')) {
      throw new Error('Invalid audience DID');
    }
    if (!issuerPrivateKey || issuerPrivateKey.length !== 32) {
      throw new Error('Invalid private key (must be 32 bytes)');
    }
    if (!Array.isArray(attenuations) || attenuations.length === 0) {
      throw new Error('At least one attenuation required');
    }

    // Validate attenuations
    for (const att of attenuations) {
      if (!att.with || typeof att.with !== 'string') {
        throw new Error('Each attenuation must have a "with" resource');
      }
      if (!att.can || typeof att.can !== 'string') {
        throw new Error('Each attenuation must have a "can" capability');
      }
    }

    // Build JWT header
    const header = {
      alg: 'EdDSA',  // Ed25519 signature algorithm
      typ: 'JWT',
      ucv: UCAN_VERSION  // UCAN version
    };

    // Build JWT payload
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: issuerDid,          // Issuer (user)
      aud: audienceDid,        // Audience (service)
      nbf: now,                // Not before (effective immediately)
      exp: now + expiresIn,    // Expiration
      att: attenuations,       // Attenuations (permissions)
      prf: proofs,             // Proof chain (for delegation)
      fct: [],                 // Facts (additional context)
      ...metadata              // Custom metadata
    };

    // Encode header and payload
    const encodedHeader = this._base64urlEncode(JSON.stringify(header));
    const encodedPayload = this._base64urlEncode(JSON.stringify(payload));

    // Create signing input
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const messageBytes = new TextEncoder().encode(signingInput);

    // Sign with Ed25519
    const signatureBytes = ed25519.sign(messageBytes, issuerPrivateKey);
    const encodedSignature = this._base64urlEncode(signatureBytes);

    // Return complete JWT
    const jwt = `${signingInput}.${encodedSignature}`;

    console.log('✅ UCAN token created:', {
      issuer: issuerDid,
      audience: audienceDid,
      attenuations: attenuations.length,
      expiresAt: new Date(payload.exp * 1000).toISOString()
    });

    return jwt;
  }

  /**
   * Parse a UCAN token (without validation)
   *
   * @param {string} ucanToken - JWT-encoded UCAN token
   * @returns {Object} - Parsed UCAN components
   * @throws {Error} - If token format is invalid
   */
  parseUCAN(ucanToken) {
    if (!ucanToken || typeof ucanToken !== 'string') {
      throw new Error('Invalid UCAN token');
    }

    const parts = ucanToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format (expected 3 parts)');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    try {
      const header = JSON.parse(this._base64urlDecode(encodedHeader));
      const payload = JSON.parse(this._base64urlDecode(encodedPayload));
      const signature = base64url.decode(encodedSignature);

      return {
        header,
        payload,
        signature,
        raw: ucanToken
      };
    } catch (error) {
      throw new Error(`Failed to parse UCAN: ${error.message}`);
    }
  }

  /**
   * Validate a UCAN token
   *
   * Checks:
   * 1. Token format (JWT structure)
   * 2. Signature validity (Ed25519 verification)
   * 3. Expiration (not expired)
   * 4. Not-before (currently valid)
   *
   * @param {string} ucanToken - JWT-encoded UCAN token
   * @returns {Promise<{valid: boolean, payload: Object, error?: string}>}
   */
  async validateUCAN(ucanToken) {
    try {
      // Parse token
      const parsed = this.parseUCAN(ucanToken);
      const { header, payload, signature } = parsed;

      // Check algorithm
      if (header.alg !== 'EdDSA') {
        return { valid: false, error: 'Unsupported algorithm (expected EdDSA)' };
      }

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return {
          valid: false,
          error: `Token expired at ${new Date(payload.exp * 1000).toISOString()}`
        };
      }

      // Check not-before
      if (payload.nbf && payload.nbf > now) {
        return {
          valid: false,
          error: `Token not yet valid (starts at ${new Date(payload.nbf * 1000).toISOString()})`
        };
      }

      // Extract issuer's public key from DID
      const issuerPublicKey = this._extractPublicKeyFromDid(payload.iss);
      if (!issuerPublicKey) {
        return { valid: false, error: 'Could not extract public key from issuer DID' };
      }

      // Verify signature
      const parts = ucanToken.split('.');
      const signingInput = `${parts[0]}.${parts[1]}`;
      const messageBytes = new TextEncoder().encode(signingInput);

      const isValidSignature = ed25519.verify(signature, messageBytes, issuerPublicKey);

      if (!isValidSignature) {
        return { valid: false, error: 'Invalid signature' };
      }

      console.log('✅ UCAN token validated:', {
        issuer: payload.iss,
        audience: payload.aud,
        expiresAt: new Date(payload.exp * 1000).toISOString()
      });

      return {
        valid: true,
        payload
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Check if a UCAN token grants permission for a specific resource and action
   *
   * @param {string} ucanToken - JWT-encoded UCAN token
   * @param {string} resourcePath - Resource path to check (e.g., "ipfs://pubkey/notes/doc1.json")
   * @param {string} capability - Capability to check (e.g., "storage/write")
   * @returns {Promise<{authorized: boolean, error?: string}>}
   */
  async checkCapability(ucanToken, resourcePath, capability) {
    // Validate token first
    const validation = await this.validateUCAN(ucanToken);
    if (!validation.valid) {
      return {
        authorized: false,
        error: validation.error
      };
    }

    const { payload } = validation;

    // Check if any attenuation matches
    for (const att of payload.att || []) {
      // Check capability match
      if (att.can !== capability) {
        continue;
      }

      // Check resource match (with wildcard support)
      if (this._matchesResourcePattern(resourcePath, att.with)) {
        console.log('✅ Capability authorized:', {
          resource: resourcePath,
          capability: capability,
          pattern: att.with
        });

        return { authorized: true };
      }
    }

    return {
      authorized: false,
      error: `No matching capability for ${capability} on ${resourcePath}`
    };
  }

  /**
   * Extract public key bytes from a DID
   * Supports did:key format with multibase encoding
   *
   * @param {string} did - DID string (e.g., "did:key:z6Mk...")
   * @returns {Uint8Array|null} - 32-byte Ed25519 public key or null if invalid
   * @private
   */
  _extractPublicKeyFromDid(did) {
    if (!did || !did.startsWith('did:key:')) {
      return null;
    }

    try {
      // Extract multibase-encoded key
      const multibaseKey = did.replace('did:key:', '');

      // For did:key with z prefix (base58btc encoding)
      if (multibaseKey.startsWith('z')) {
        // Remove 'z' prefix and decode base58
        const base58Key = multibaseKey.slice(1);
        const decoded = this._base58Decode(base58Key);

        // Remove multicodec prefix (0xed 0x01 for Ed25519)
        // The first two bytes are the multicodec identifier
        if (decoded.length < 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
          console.warn('Invalid multicodec prefix for Ed25519 key');
          return null;
        }

        // Return 32-byte public key
        return decoded.slice(2);
      }

      return null;
    } catch (error) {
      console.error('Failed to extract public key from DID:', error);
      return null;
    }
  }

  /**
   * Check if a resource path matches a pattern (with wildcard support)
   *
   * @param {string} path - Resource path to check
   * @param {string} pattern - Pattern with optional * wildcard
   * @returns {boolean}
   * @private
   */
  _matchesResourcePattern(path, pattern) {
    // Convert pattern to regex
    // ipfs://pubkey/notes/* becomes /^ipfs:\/\/pubkey\/notes\/.*$/
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars
      .replace(/\*/g, '.*');                    // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Base64url encode (JWT-compatible)
   * @private
   */
  _base64urlEncode(data) {
    if (typeof data === 'string') {
      data = new TextEncoder().encode(data);
    }
    return base64url.encode(data);
  }

  /**
   * Base64url decode (JWT-compatible)
   * @private
   */
  _base64urlDecode(encoded) {
    const decoded = base64url.decode(encoded);
    return new TextDecoder().decode(decoded);
  }

  /**
   * Base58 decode (for DID keys)
   * @private
   */
  _base58Decode(str) {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const ALPHABET_MAP = {};
    for (let i = 0; i < ALPHABET.length; i++) {
      ALPHABET_MAP[ALPHABET[i]] = i;
    }

    let result = [];
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      let value = ALPHABET_MAP[char];
      if (value === undefined) {
        throw new Error(`Invalid base58 character: ${char}`);
      }

      for (let j = 0; j < result.length; j++) {
        value += result[j] * 58;
        result[j] = value & 0xff;
        value >>= 8;
      }

      while (value > 0) {
        result.push(value & 0xff);
        value >>= 8;
      }
    }

    // Handle leading zeros
    for (let i = 0; i < str.length && str[i] === '1'; i++) {
      result.push(0);
    }

    return new Uint8Array(result.reverse());
  }
}

export default CapabilityService;
