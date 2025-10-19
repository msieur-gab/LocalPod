/**
 * Profile Service - Manages user profiles with local cache and remote sync
 * @module sdk/services/ProfileService
 */

import { saveProfile, getProfile, listProfiles, deleteProfile } from '../storage/PlatformDatabase.js';

/**
 * Profile Service
 * Handles profile CRUD operations with caching
 */
export class ProfileService {
  constructor(remoteStorage = null) {
    this.remoteStorage = remoteStorage;
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get profile with optional caching
   * @param {string} publicKey - Base58-encoded public key
   * @param {Object} [options]
   * @param {boolean} [options.useCache=true] - Use in-memory cache
   * @param {boolean} [options.fetchRemote=false] - Fetch from remote storage if not found locally
   * @returns {Promise<Object|null>}
   */
  async getProfile(publicKey, { useCache = true, fetchRemote = false } = {}) {
    if (!publicKey) return null;

    // Check cache first
    if (useCache && this.cache.has(publicKey)) {
      const cached = this.cache.get(publicKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.profile;
      }
      this.cache.delete(publicKey);
    }

    // Check local database
    let profile = await getProfile(publicKey);

    // Fetch from remote if enabled and not found locally
    if (!profile && fetchRemote && this.remoteStorage) {
      try {
        profile = await this.remoteStorage.loadProfile(publicKey);
        if (profile) {
          await saveProfile(profile);
        }
      } catch (error) {
        console.warn(`Failed to fetch remote profile for ${publicKey}:`, error);
      }
    }

    // Update cache
    if (profile && useCache) {
      this.cache.set(publicKey, {
        profile,
        timestamp: Date.now(),
      });
    }

    return profile;
  }

  /**
   * Save profile locally and optionally sync to remote
   * @param {Object} profile
   * @param {string} profile.publicKey - Base58-encoded public key
   * @param {string} [profile.displayName] - Human-readable name
   * @param {string} [profile.avatar] - Avatar URL or data URI
   * @param {Object} [options]
   * @param {boolean} [options.syncRemote=false] - Sync to remote storage
   * @returns {Promise<Object>}
   */
  async saveProfile(profile, { syncRemote = false } = {}) {
    if (!profile?.publicKey) {
      throw new Error('Profile requires publicKey');
    }

    // Save locally
    const saved = await saveProfile(profile);

    // Invalidate cache
    this.cache.delete(profile.publicKey);

    // Sync to remote if enabled
    if (syncRemote && this.remoteStorage) {
      try {
        await this.remoteStorage.upsertProfile(profile.publicKey, saved);
      } catch (error) {
        console.warn(`Failed to sync profile to remote storage:`, error);
        // Don't throw - local save succeeded
      }
    }

    return saved;
  }

  /**
   * Update profile fields
   * @param {string} publicKey
   * @param {Object} updates - Fields to update
   * @param {Object} [options]
   * @param {boolean} [options.syncRemote=false] - Sync to remote storage
   * @returns {Promise<Object>}
   */
  async updateProfile(publicKey, updates, { syncRemote = false } = {}) {
    const existing = await getProfile(publicKey);

    const updated = {
      ...existing,
      ...updates,
      publicKey, // Ensure publicKey doesn't change
      updatedAt: new Date().toISOString(),
    };

    return this.saveProfile(updated, { syncRemote });
  }

  /**
   * Delete profile
   * @param {string} publicKey
   * @returns {Promise<void>}
   */
  async deleteProfile(publicKey) {
    await deleteProfile(publicKey);
    this.cache.delete(publicKey);
  }

  /**
   * List all local profiles
   * @returns {Promise<Array>}
   */
  async listProfiles() {
    return listProfiles();
  }

  /**
   * Ensure profiles exist for multiple public keys
   * Fetches missing profiles from remote storage
   * @param {Set<string>|Array<string>} publicKeys - Public keys to check
   * @returns {Promise<Map<string, Object>>} Map of publicKey -> profile
   */
  async ensureProfiles(publicKeys) {
    const keysArray = Array.isArray(publicKeys) ? publicKeys : Array.from(publicKeys);
    const profileMap = new Map();
    const missing = [];

    // Check local storage first
    for (const key of keysArray) {
      if (!key) continue;

      const profile = await this.getProfile(key, { useCache: true, fetchRemote: false });

      if (profile) {
        profileMap.set(key, profile);
      } else {
        missing.push(key);
      }
    }

    // Fetch missing profiles from remote
    if (missing.length > 0 && this.remoteStorage) {
      await Promise.all(
        missing.map(async (key) => {
          try {
            const remoteProfile = await this.remoteStorage.loadProfile(key);
            if (remoteProfile) {
              await saveProfile(remoteProfile);
              profileMap.set(key, remoteProfile);

              // Update cache
              this.cache.set(key, {
                profile: remoteProfile,
                timestamp: Date.now(),
              });
            }
          } catch (error) {
            console.warn(`Failed to load profile for ${key}:`, error);
          }
        })
      );
    }

    return profileMap;
  }

  /**
   * Clear in-memory cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      ttl: this.cacheTTL,
      entries: Array.from(this.cache.keys()),
    };
  }
}
