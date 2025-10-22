/**
 * Collaborator Service - Manages trusted collaborators and their public keys
 * @module sdk/services/CollaboratorService
 */

import {
  listCollaborators,
  getCollaborator,
  getCollaboratorByPublicKey,
  getCollaboratorByDid,
  addCollaborator,
  removeCollaborator,
  saveCapabilityGrant,
  listCapabilityGrantsByGranter,
  listCapabilityGrantsBySubject,
  getCapabilityGrant,
  deleteCapabilityGrant,
  setCapabilityVersion,
  getCapabilityVersion,
} from '../storage/PlatformDatabase.js';
import { didFromPublicKey, publicKeyFromDid, isValidPublicKey } from '../core/DID.js';
import { base58ToBytes, bytesToBase58 } from '../utils/encoding.js';
import {
  createCapabilityGrant,
  verifyCapabilityGrant,
  unwrapCapabilityKey,
  buildGrantRecord,
} from '../core/CapabilityGrant.js';

/**
 * Collaborator Service
 * Handles collaborator registry and trust network
 */
export class CollaboratorService {
  constructor(profileService = null, accountService = null) {
    this.profileService = profileService;
    this.accountService = accountService;
  }

  /**
   * List all collaborators
   * @returns {Promise<Array>}
   */
  async listCollaborators() {
    return listCollaborators();
  }

  /**
   * Get collaborator by ID
   * @param {string} id
   * @returns {Promise<Object|undefined>}
   */
  async getCollaborator(id) {
    return getCollaborator(id);
  }

  /**
   * Get collaborator by public key
   * @param {string} publicKey
   * @returns {Promise<Object|undefined>}
   */
  async getCollaboratorByPublicKey(publicKey) {
    return getCollaboratorByPublicKey(publicKey);
  }

  /**
   * Add a new collaborator
   * @param {Object} collaborator
   * @param {string} collaborator.publicKey - Base58-encoded public key
   * @param {string} [collaborator.name] - Optional display name
   * @param {string} [collaborator.id] - Optional custom ID (defaults to publicKey)
   * @param {Object} [options]
   * @param {boolean} [options.createProfile=true] - Create profile entry automatically
   * @returns {Promise<Array>}
   * @throws {Error} If publicKey is invalid
   */
  async addCollaborator(collaborator, { createProfile = true } = {}) {
    let signingPublicKey = collaborator?.publicKey ?? null;
    let collaboratorDid = collaborator?.did ?? null;

    if (!signingPublicKey && collaboratorDid) {
      const keyBytes = publicKeyFromDid(collaboratorDid);
      signingPublicKey = bytesToBase58(keyBytes);
    }

    if (!signingPublicKey) {
      throw new Error('Collaborator requires publicKey or did');
    }

    // Validate signing public key format
    let signingKeyBytes;
    try {
      signingKeyBytes = base58ToBytes(signingPublicKey);
      if (!isValidPublicKey(signingKeyBytes)) {
        throw new Error('Invalid signing public key format');
      }
    } catch (error) {
      throw new Error(`Invalid public key: ${error.message}`);
    }

    if (!collaborator?.encryptionPublicKey) {
      throw new Error('Collaborator requires encryptionPublicKey');
    }

    let encryptionKeyBytes;
    try {
      encryptionKeyBytes = base58ToBytes(collaborator.encryptionPublicKey);
      if (encryptionKeyBytes.length !== 32) {
        throw new Error('Encryption public key must be 32 bytes');
      }
    } catch (error) {
      throw new Error(`Invalid encryption public key: ${error.message}`);
    }

    if (!collaboratorDid) {
      collaboratorDid = didFromPublicKey(signingKeyBytes);
    }

    // Check if already exists
    const existing = await getCollaboratorByPublicKey(signingPublicKey);
    if (existing) {
      throw new Error('Collaborator already exists');
    }

    // Generate ID if not provided
    const id = collaborator.id || signingPublicKey;

    // Add to database
    const result = await addCollaborator({
      id,
      publicKey: signingPublicKey,
      encryptionPublicKey: collaborator.encryptionPublicKey,
      did: collaboratorDid,
      name: collaborator.name ?? null,
    });

    // Auto-fetch remote profile if enabled
    if (createProfile && this.profileService) {
      try {
        // First, try to fetch the remote profile
        const remoteProfile = await this.profileService.getProfile(signingPublicKey, {
          useCache: false,
          fetchRemote: true,
        });

        // If remote profile not found, create a local one with provided name
        if (!remoteProfile && collaborator.name) {
          await this.profileService.saveProfile({
            publicKey: signingPublicKey,
            displayName: collaborator.name,
          });
        }
      } catch (error) {
        console.warn('Failed to fetch/create profile for collaborator:', error);
        // Don't fail - collaborator was added successfully
      }
    }

    return result;
  }

  /**
   * Remove a collaborator
   * @param {string} id - Collaborator ID
   * @param {Object} [options]
   * @param {boolean} [options.deleteProfile=false] - Also delete associated profile
   * @returns {Promise<Array>}
   */
  async removeCollaborator(id, { deleteProfile = false } = {}) {
    const collaborator = await getCollaborator(id);
    if (!collaborator) {
      throw new Error('Collaborator not found');
    }

    // Remove from database
    const result = await removeCollaborator(id);

    // Optionally delete profile
    if (deleteProfile && this.profileService && collaborator.publicKey) {
      try {
        await this.profileService.deleteProfile(collaborator.publicKey);
      } catch (error) {
        console.warn('Failed to delete profile for collaborator:', error);
      }
    }

    return result;
  }

  /**
   * Update collaborator name
   * @param {string} id
   * @param {string} name
   * @returns {Promise<Array>}
   */
  async updateCollaboratorName(id, name) {
    const collaborator = await getCollaborator(id);
    if (!collaborator) {
      throw new Error('Collaborator not found');
    }

    return addCollaborator({
      ...collaborator,
      name,
    });
  }

  /**
   * Get collaborator with enriched profile data
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getCollaboratorWithProfile(id) {
    const collaborator = await getCollaborator(id);
    if (!collaborator) return null;

    let profile = null;
    if (this.profileService && collaborator.publicKey) {
      profile = await this.profileService.getProfile(collaborator.publicKey, {
        useCache: true,
        fetchRemote: true,
      });
    }

    return {
      ...collaborator,
      profile,
    };
  }

  /**
   * List all collaborators with enriched profile data
   * @param {Object} [options]
   * @param {boolean} [options.syncRemote=false] - Force refresh profiles from remote storage
   * @returns {Promise<Array>}
   */
  async listCollaboratorsWithProfiles({ syncRemote = false } = {}) {
    const collaborators = await listCollaborators();

    if (!this.profileService) {
      return collaborators.map((c) => ({ ...c, profile: null }));
    }

    // Get all public keys
    const publicKeys = collaborators.map((c) => c.publicKey).filter(Boolean);

    // If syncRemote is true, force refresh from remote storage
    let profileMap;
    if (syncRemote && this.profileService.remoteStorage) {
      profileMap = await this.syncCollaboratorProfiles();
    } else {
      // Use local cache
      profileMap = await this.profileService.ensureProfiles(publicKeys);
    }

    // Merge data
    return collaborators.map((collaborator) => ({
      ...collaborator,
      profile: profileMap.get(collaborator.publicKey) ?? null,
    }));
  }

  // ========== Capability Grants ==========

  async issueCapabilityGrant({
    subjectDid,
    subjectEncryptionPublicKey,
    resourceId,
    rights = [],
    expiresAt = null,
    metadata = null,
    documentKey = null,
  }) {
    if (!this.accountService) {
      throw new Error('Capability issuance requires account service context');
    }

    const identity = this.accountService.requireUnlocked();
    const signingPrivateKey = this.accountService.getSigningPrivateKeyBytes();
    const encryptionPrivateKey = this.accountService.getEncryptionPrivateKeyBytes();

    if (!signingPrivateKey || !encryptionPrivateKey) {
      throw new Error('Current account does not have loaded key material');
    }

    const normalizedRights = Array.isArray(rights)
      ? Array.from(new Set(rights.map((value) => String(value))))
      : [];

    let resolvedSubjectEncryptionKey = subjectEncryptionPublicKey;
    if (!resolvedSubjectEncryptionKey && subjectDid) {
      const collaborator = await getCollaboratorByDid(subjectDid);
      resolvedSubjectEncryptionKey = collaborator?.encryptionPublicKey ?? null;
    }

    if (!resolvedSubjectEncryptionKey) {
      throw new Error('Subject encryption public key is required to issue capability');
    }

    const grant = await createCapabilityGrant({
      granterDid: identity.did,
      granterSigningPrivateKey: signingPrivateKey,
      granterEncryptionPrivateKey: encryptionPrivateKey,
      subjectDid,
      subjectEncryptionPublicKey: resolvedSubjectEncryptionKey,
      resourceId,
      rights: normalizedRights,
      expiresAt,
      metadata,
      documentKey,
    });

    const currentVersion = await getCapabilityVersion(resourceId);
    const nextSequence = (currentVersion?.version ?? 0) + 1;

    await saveCapabilityGrant(buildGrantRecord(grant, nextSequence));
    await setCapabilityVersion({ resourceId, version: nextSequence });

    return {
      ...grant,
      sequence: nextSequence,
    };
  }

  async listIssuedCapabilities() {
    if (!this.accountService) return [];
    const identity = this.accountService.getUnlockedIdentity();
    if (!identity) return [];
    return listCapabilityGrantsByGranter(identity.did);
  }

  async listReceivedCapabilities({ subjectDid } = {}) {
    const did = subjectDid ?? this.accountService?.getUnlockedIdentity()?.did ?? null;
    if (!did) return [];
    return listCapabilityGrantsBySubject(did);
  }

  async revokeCapabilityGrant(grantId) {
    if (!grantId) return;
    const existing = await getCapabilityGrant(grantId);
    await deleteCapabilityGrant(grantId);
    if (existing?.resourceId) {
      const currentVersion = await getCapabilityVersion(existing.resourceId);
      const nextSequence = (currentVersion?.version ?? 0) + 1;
      await setCapabilityVersion({ resourceId: existing.resourceId, version: nextSequence });
    }
  }

  async unwrapCapabilityGrant(grant) {
    if (!this.accountService) {
      throw new Error('Capability unwrap requires account service context');
    }

    const encryptionPrivateKey = this.accountService.getEncryptionPrivateKeyBytes();
    if (!encryptionPrivateKey) {
      throw new Error('Current account is locked or missing encryption key');
    }

    return unwrapCapabilityKey({
      grant,
      recipientEncryptionPrivateKey: encryptionPrivateKey,
    });
  }

  async validateCapabilityGrant(grant, granterPublicKey) {
    let publicKey = granterPublicKey ?? null;

    if (!publicKey && grant?.granterDid) {
      const collaborator = await getCollaboratorByDid(grant.granterDid);
      publicKey = collaborator?.publicKey ?? null;
    }

    if (!publicKey) {
      throw new Error('Unable to determine granter public key for verification');
    }

    return verifyCapabilityGrant(grant, publicKey);
  }

  async acceptCapabilityGrant(grant) {
    if (!this.accountService) {
      throw new Error('Capability import requires account service context');
    }

    if (!grant?.subjectDid || !grant?.granterDid) {
      throw new Error('Invalid capability grant payload');
    }

    const identity = this.accountService.getUnlockedIdentity();
    if (!identity || identity.did !== grant.subjectDid) {
      throw new Error('Capability grant not intended for this identity');
    }

    const granterPublicKeyBytes = publicKeyFromDid(grant.granterDid);
    const granterPublicKey = bytesToBase58(granterPublicKeyBytes);

    const isValid = await verifyCapabilityGrant(grant, granterPublicKey);
    if (!isValid) {
      throw new Error('Capability signature invalid or tampered');
    }

    const existingCollaborator = await getCollaboratorByPublicKey(granterPublicKey);
    if (!existingCollaborator) {
      try {
        await this.addCollaborator(
          {
            publicKey: granterPublicKey,
            encryptionPublicKey: grant.encryptionPublicKey,
            did: grant.granterDid,
            name: grant.metadata?.granterName ?? null,
          },
          { createProfile: true }
        );
      } catch (error) {
        console.warn('Failed to auto-create collaborator for capability grant:', error);
      }
    }

    await saveCapabilityGrant(buildGrantRecord(grant));
    return grant;
  }

  /**
   * Search collaborators by name or public key
   * @param {string} query - Search query
   * @returns {Promise<Array>}
   */
  async searchCollaborators(query) {
    if (!query) return [];

    const collaborators = await listCollaborators();
    const lowerQuery = query.toLowerCase();

    return collaborators.filter((c) => {
      return (
        c.name?.toLowerCase().includes(lowerQuery) ||
        c.publicKey?.toLowerCase().includes(lowerQuery) ||
        c.id?.toLowerCase().includes(lowerQuery)
      );
    });
  }

  /**
   * Validate if a public key belongs to a trusted collaborator
   * @param {string} publicKey
   * @returns {Promise<boolean>}
   */
  async isTrustedCollaborator(publicKey) {
    if (!publicKey) return false;
    const collaborator = await getCollaboratorByPublicKey(publicKey);
    return Boolean(collaborator);
  }

  /**
   * Refresh a collaborator's profile from remote storage
   * Forces a fresh fetch, bypassing cache
   * @param {string} publicKey - Public key of collaborator
   * @returns {Promise<Object|null>} Updated profile or null
   */
  async refreshCollaboratorProfile(publicKey) {
    if (!publicKey || !this.profileService || !this.profileService.remoteStorage) {
      return null;
    }

    try {
      // Bypass cache and fetch directly from remote
      const remoteProfile = await this.profileService.remoteStorage.loadProfile(publicKey);

      if (remoteProfile) {
        // Save to local database and update cache
        await this.profileService.saveProfile(remoteProfile, { syncRemote: false });
        return remoteProfile;
      }
    } catch (error) {
      console.warn(`Failed to refresh profile for ${publicKey}:`, error);
    }

    return null;
  }

  /**
   * Sync all collaborator profiles from remote storage
   * Refreshes profiles for all collaborators to get latest updates
   * @returns {Promise<Map<string, Object>>} Map of publicKey -> updated profile
   */
  async syncCollaboratorProfiles() {
    const collaborators = await listCollaborators();
    const publicKeys = collaborators.map((c) => c.publicKey).filter(Boolean);
    const updatedProfiles = new Map();

    if (!this.profileService || !this.profileService.remoteStorage) {
      console.warn('Remote storage not configured - cannot sync profiles');
      return updatedProfiles;
    }

    console.log(`Syncing ${publicKeys.length} collaborator profiles from remote...`);

    // Fetch all profiles from remote in parallel
    await Promise.all(
      publicKeys.map(async (publicKey) => {
        try {
          const profile = await this.refreshCollaboratorProfile(publicKey);
          if (profile) {
            updatedProfiles.set(publicKey, profile);
          }
        } catch (error) {
          console.warn(`Failed to sync profile for ${publicKey}:`, error);
        }
      })
    );

    console.log(`✅ Synced ${updatedProfiles.size} profiles`);
    return updatedProfiles;
  }
}
