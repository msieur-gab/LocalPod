/**
 * Identity Platform SDK
 * Main entry point for decentralized identity management
 * @module sdk/IdentityPlatform
 */

import { AccountService } from './services/AccountService.js';
import { ProfileService } from './services/ProfileService.js';
import { CollaboratorService } from './services/CollaboratorService.js';
import { ServiceRegistry } from './services/ServiceRegistry.js';
import { signChallenge as signServiceChallengeHelper } from './core/Challenge.js';

/**
 * Identity Platform
 * Unified SDK for DID-based identity, profiles, and collaborators
 *
 * @example
 * const platform = new IdentityPlatform({ remoteStorage });
 * await platform.init();
 *
 * // Create account
 * const identity = await platform.createAccount({ username: 'alice', password: 'secret123' });
 *
 * // Manage profiles
 * await platform.saveProfile({ publicKey: identity.publicKey, displayName: 'Alice' });
 *
 * // Add collaborators
 * await platform.addCollaborator({ publicKey: 'z8mwaSF...', name: 'Bob' });
 */
export class IdentityPlatform {
  /**
   * Create Identity Platform instance
 * @param {Object} [options]
 * @param {Object} [options.remoteStorage] - Remote storage provider (e.g., Filebase)
 * @param {Array} [options.serviceManifest] - Array of known service definitions
 */
  constructor({ remoteStorage = null, serviceManifest = [] } = {}) {
    this.remoteStorage = remoteStorage;

    // Initialize services
    this.accountService = new AccountService();
    this.profileService = new ProfileService(remoteStorage);
    this.collaboratorService = new CollaboratorService(this.profileService, this.accountService);
    this.serviceRegistry = new ServiceRegistry({
      manifest: Array.isArray(serviceManifest) ? serviceManifest : [],
    });

    // Event listeners for cross-service communication
    this.eventListeners = new Map();
  }

  /**
   * Initialize the platform
   * @returns {Promise<void>}
   */
  async init() {
    // Future: Load persisted session, sync data, etc.
    this.emit('initialized');
  }

  // ========== Account Management ==========

  /**
   * List all accounts
   * @returns {Promise<Array>}
   */
  async listAccounts() {
    return this.accountService.listAccounts();
  }

  /**
   * Create a new account
   * @param {Object} params
   * @param {string} params.username
   * @param {string} params.password
   * @returns {Promise<Object>} Unlocked identity
   */
  async createAccount({ username, password }) {
    const identity = await this.accountService.createAccount({ username, password });

    // Sync encrypted backup to remote storage if available
    if (this.remoteStorage) {
      try {
        const backupPayload = this.accountService.getBackupPayload();
        if (backupPayload) {
          await this.remoteStorage.saveIdentityBackup(backupPayload.publicKey, backupPayload);
          console.log('✅ Account backup synced to remote storage');
        }
      } catch (error) {
        console.warn('Failed to sync backup to remote storage:', error);
        // Don't fail account creation if remote sync fails
      }
    }

    this.emit('account-created', identity);
    return identity;
  }

  /**
   * Unlock an account
   * @param {Object} params
   * @param {string} params.username
   * @param {string} params.password
   * @returns {Promise<Object>} Unlocked identity
   */
  async unlock({ username, password }) {
    const identity = await this.accountService.unlock({ username, password });
    if (this.remoteStorage) {
      await this.syncCollaboratorsFromRemote({ replace: false });
    }
    this.emit('account-unlocked', identity);
    return identity;
  }

  /**
   * Lock current account
   */
  lock() {
    this.accountService.lock();
    this.emit('account-locked');
  }

  /**
   * Check if account is unlocked
   * @returns {boolean}
   */
  isUnlocked() {
    return this.accountService.isUnlocked();
  }

  /**
   * Get current identity
   * @returns {Object|null}
   */
  getIdentity() {
    return this.accountService.getUnlockedIdentity();
  }

  async registerPasskey(options) {
    const credential = await this.accountService.registerPasskey(options);
    this.emit('passkey-registered', credential);
    return credential;
  }

  async listPasskeys(username) {
    return this.accountService.listPasskeys(username);
  }

  async removePasskey(credentialId) {
    await this.accountService.removePasskey(credentialId);
    this.emit('passkey-removed', { credentialId });
  }

  /**
   * Get current account record
   * @returns {Object|null}
   */
  getCurrentAccount() {
    return this.accountService.getCurrentAccount();
  }

  /**
   * Sign a service-issued challenge for redirect-based authentication
   * @param {Object} params
   * @param {string} params.challenge - Challenge string issued by the service
   * @returns {Promise<{did: string, signature: string, challenge: string}>}
   */
  async signServiceChallenge({ challenge }) {
    if (!challenge) {
      throw new Error('Challenge is required');
    }

    const identity = this.accountService.requireUnlocked();
    const privateKey = identity.signingPrivateKey;
    if (!privateKey) {
      throw new Error('Signing key unavailable. Unlock your account first.');
    }

    return signServiceChallengeHelper({
      challenge,
      privateKey,
      did: identity.did,
    });
  }

  /**
   * Sign a challenge and optionally POST the payload to a callback URL.
   * @param {Object} params
  * @param {string} params.challenge - Challenge string issued by the service
  * @param {string} [params.serviceDid] - DID of the requesting service
  * @param {string} [params.callbackUrl] - HTTPS endpoint to receive the signed payload
  * @param {boolean} [params.autoSubmit=true] - When true, POST to callback automatically
  * @returns {Promise<{payload: Object, submitted: boolean, response?: Object}>}
  */
  async respondToServiceChallenge({
    challenge,
    serviceDid = null,
    callbackUrl = null,
    autoSubmit = true,
  }) {
    if (!challenge) {
      throw new Error('Challenge is required');
    }

    const identity = this.accountService.getUnlockedIdentity();
    if (!identity) {
      throw new Error('Identity locked. Unlock before signing challenges.');
    }

    const signed = await this.signServiceChallenge({ challenge });
    const payload = {
      ...signed,
      serviceDid,
      publicKey: identity.signingPublicKey || identity.publicKey,
      encryptionPublicKey: identity.encryptionPublicKey ?? null,
      issuedAt: new Date().toISOString(),
    };

    if (!callbackUrl || autoSubmit === false) {
      return {
        payload,
        submitted: false,
      };
    }

    let url;
    try {
      url = new URL(callbackUrl);
    } catch {
      throw new Error('Invalid callback URL supplied');
    }

    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    const isSecure = url.protocol === 'https:' || (url.protocol === 'http:' && isLocalhost);
    if (!isSecure) {
      throw new Error('Callback URL must be HTTPS (or localhost/127.0.0.1 for development)');
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let responseBody = null;
      const rawText = await response.text();
      if (rawText) {
        try {
          responseBody = JSON.parse(rawText);
        } catch {
          responseBody = rawText;
        }
      }

      return {
        payload,
        submitted: true,
        response: {
          status: response.status,
          ok: response.ok,
          body: responseBody,
        },
      };
    } catch (error) {
      return {
        payload,
        submitted: false,
        error: error?.message ?? String(error),
      };
    }
  }

  /**
   * Delete account
   * @param {string} username
   * @returns {Promise<void>}
   */
  async deleteAccount(username) {
    await this.accountService.deleteAccount(username);
    this.emit('account-deleted', { username });
  }

  /**
   * Import account from backup
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async importAccountFromBackup(params) {
    const identity = await this.accountService.importAccountFromBackup(params);
    if (this.remoteStorage) {
      await this.syncCollaboratorsFromRemote({ replace: true });
    }
    this.emit('account-imported', identity);
    return identity;
  }

  // ========== Profile Management ==========

  /**
   * Get profile
   * @param {string} publicKey
   * @param {Object} [options]
   * @returns {Promise<Object|null>}
   */
  async getProfile(publicKey, options) {
    return this.profileService.getProfile(publicKey, options);
  }

  /**
   * Save profile
   * @param {Object} profile
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async saveProfile(profile, options) {
    const saved = await this.profileService.saveProfile(profile, options);
    this.emit('profile-updated', saved);
    return saved;
  }

  /**
   * Update profile
   * @param {string} publicKey
   * @param {Object} updates
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async updateProfile(publicKey, updates, options) {
    const updated = await this.profileService.updateProfile(publicKey, updates, options);
    this.emit('profile-updated', updated);
    return updated;
  }

  /**
   * Delete profile
   * @param {string} publicKey
   * @returns {Promise<void>}
   */
  async deleteProfile(publicKey) {
    await this.profileService.deleteProfile(publicKey);
    this.emit('profile-deleted', { publicKey });
  }

  /**
   * List all profiles
   * @returns {Promise<Array>}
   */
  async listProfiles() {
    return this.profileService.listProfiles();
  }

  /**
   * Ensure profiles exist for public keys
   * @param {Set<string>|Array<string>} publicKeys
   * @returns {Promise<Map<string, Object>>}
   */
  async ensureProfiles(publicKeys) {
    return this.profileService.ensureProfiles(publicKeys);
  }

  // ========== Collaborator Management ==========

  /**
   * List all collaborators
   * @returns {Promise<Array>}
   */
  async listCollaborators() {
    return this.collaboratorService.listCollaborators();
  }

  /**
   * Get collaborator by ID
   * @param {string} id
   * @returns {Promise<Object|undefined>}
   */
  async getCollaborator(id) {
    return this.collaboratorService.getCollaborator(id);
  }

  /**
   * Add collaborator
   * @param {Object} collaborator
   * @param {Object} [options]
   * @returns {Promise<Array>}
   */
  async addCollaborator(collaborator, options) {
    const result = await this.collaboratorService.addCollaborator(collaborator, options);
    this.emit('collaborator-added', collaborator);
    return result;
  }

  /**
   * Remove collaborator
   * @param {string} id
   * @param {Object} [options]
   * @returns {Promise<Array>}
   */
  async removeCollaborator(id, options) {
    const result = await this.collaboratorService.removeCollaborator(id, options);
    this.emit('collaborator-removed', { id });
    return result;
  }

  /**
   * Sync collaborators from remote encrypted backup
   * @param {Object} [options]
   * @param {boolean} [options.replace=false] - Replace local state when true
   * @returns {Promise<Array|null>}
   */
  async syncCollaboratorsFromRemote({ replace = false } = {}) {
    if (!this.remoteStorage) return null;

    const identity = this.accountService.getUnlockedIdentity();
    if (!identity?.publicKey) return null;

    try {
      const backup = await this.remoteStorage.loadCollaboratorBackup(identity.publicKey);
      if (!backup) return null;
      return this.collaboratorService.restoreCollaboratorsFromEncryptedBackup(backup, {
        replace,
      });
    } catch (error) {
      console.warn('Failed to sync collaborators from remote storage:', error);
      return null;
    }
  }

  /**
   * List collaborators with profiles
   * @returns {Promise<Array>}
   */
  async listCollaboratorsWithProfiles(options) {
    return this.collaboratorService.listCollaboratorsWithProfiles(options);
  }

  /**
   * Refresh a collaborator's profile from remote storage
   * @param {string} publicKey - Public key of collaborator
   * @returns {Promise<Object|null>} Updated profile
   */
  async refreshCollaboratorProfile(publicKey) {
    return this.collaboratorService.refreshCollaboratorProfile(publicKey);
  }

  /**
   * Sync all collaborator profiles from remote storage
   * Useful to get latest profile updates (bio, avatar, etc.)
   * @returns {Promise<Map<string, Object>>} Map of updated profiles
   */
  async syncCollaboratorProfiles() {
    return this.collaboratorService.syncCollaboratorProfiles();
  }

  /**
   * Search collaborators
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async searchCollaborators(query) {
    return this.collaboratorService.searchCollaborators(query);
  }

  /**
   * Check if public key is a trusted collaborator
   * @param {string} publicKey
   * @returns {Promise<boolean>}
   */
  async isTrustedCollaborator(publicKey) {
    return this.collaboratorService.isTrustedCollaborator(publicKey);
  }

  // ========== Capability Grants ==========

  async issueCapabilityGrant(params) {
    const grant = await this.collaboratorService.issueCapabilityGrant(params);
    this.emit('capability-issued', grant);
    return grant;
  }

  async listIssuedCapabilities() {
    return this.collaboratorService.listIssuedCapabilities();
  }

  async listReceivedCapabilities(options) {
    return this.collaboratorService.listReceivedCapabilities(options);
  }

  async revokeCapabilityGrant(grantId) {
    await this.collaboratorService.revokeCapabilityGrant(grantId);
    this.emit('capability-revoked', { grantId });
  }

  async unwrapCapabilityGrant(grant) {
    return this.collaboratorService.unwrapCapabilityGrant(grant);
  }

  async validateCapabilityGrant(grant, granterPublicKey) {
    return this.collaboratorService.validateCapabilityGrant(grant, granterPublicKey);
  }

  async acceptCapabilityGrant(grant) {
    const stored = await this.collaboratorService.acceptCapabilityGrant(grant);
    this.emit('capability-accepted', stored);
    return stored;
  }

  // ========== Service Registry ==========

  registerServiceManifest(manifest) {
    this.serviceRegistry.registerManifest(manifest);
  }

  registerService(entry) {
    return this.serviceRegistry.registerService(entry);
  }

  listServices() {
    return this.serviceRegistry.listServices();
  }

  getServiceByDid(did) {
    return this.serviceRegistry.getService(did);
  }

  // ========== Event System ==========

  /**
   * Subscribe to platform events
   * @param {string} event - Event name
   * @param {Function} callback - Event handler
   * @returns {Function} Unsubscribe function
   *
   * @example
   * const unsubscribe = platform.on('account-unlocked', (identity) => {
   *   console.log('Unlocked:', identity.username);
   * });
   *
   * // Later...
   * unsubscribe();
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }

    this.eventListeners.get(event).push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Emit platform event
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @private
   */
  emit(event, data) {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;

    for (const callback of listeners) {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for "${event}":`, error);
      }
    }
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners() {
    this.eventListeners.clear();
  }

  // ========== Utilities ==========

  /**
   * Get platform statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const [accounts, collaborators, profiles] = await Promise.all([
      this.listAccounts(),
      this.listCollaborators(),
      this.listProfiles(),
    ]);

    return {
      accounts: accounts.length,
      collaborators: collaborators.length,
      profiles: profiles.length,
      unlocked: this.isUnlocked(),
      cacheStats: this.profileService.getCacheStats(),
    };
  }

  /**
   * Clear all caches
   */
  clearCaches() {
    this.profileService.clearCache();
  }
}
