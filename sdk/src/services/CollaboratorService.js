/**
 * Collaborator Service - Manages trusted collaborators and their public keys
 * @module sdk/services/CollaboratorService
 */

import {
  listCollaborators,
  getCollaborator,
  getCollaboratorByPublicKey,
  addCollaborator,
  removeCollaborator,
} from '../storage/PlatformDatabase.js';
import { isValidPublicKey } from '../core/DID.js';
import { base58ToBytes } from '../utils/encoding.js';

/**
 * Collaborator Service
 * Handles collaborator registry and trust network
 */
export class CollaboratorService {
  constructor(profileService = null) {
    this.profileService = profileService;
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
    if (!collaborator?.publicKey) {
      throw new Error('Collaborator requires publicKey');
    }

    // Validate public key format
    try {
      const publicKeyBytes = base58ToBytes(collaborator.publicKey);
      if (!isValidPublicKey(publicKeyBytes)) {
        throw new Error('Invalid public key format');
      }
    } catch (error) {
      throw new Error(`Invalid public key: ${error.message}`);
    }

    // Check if already exists
    const existing = await getCollaboratorByPublicKey(collaborator.publicKey);
    if (existing) {
      throw new Error('Collaborator already exists');
    }

    // Generate ID if not provided
    const id = collaborator.id || collaborator.publicKey;

    // Add to database
    const result = await addCollaborator({
      id,
      publicKey: collaborator.publicKey,
      name: collaborator.name ?? null,
    });

    // Auto-fetch remote profile if enabled
    if (createProfile && this.profileService) {
      try {
        // First, try to fetch the remote profile
        const remoteProfile = await this.profileService.getProfile(collaborator.publicKey, {
          useCache: false,
          fetchRemote: true,
        });

        // If remote profile not found, create a local one with provided name
        if (!remoteProfile && collaborator.name) {
          await this.profileService.saveProfile({
            publicKey: collaborator.publicKey,
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
