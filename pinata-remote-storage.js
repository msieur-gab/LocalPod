/**
 * Pinata-based Remote Storage for LocalPod
 *
 * Implements the RemoteStorage interface using Pinata IPFS for:
 * - User profile storage (public data)
 * - Encrypted backup storage (private data)
 * - Collaborator backups
 *
 * File structure:
 * - users/{publicKey}.json - Unified user file (profile + encrypted backup)
 * - collaborators/{publicKey}.json - Encrypted collaborator list
 */

export class PinataRemoteStorage {
  constructor({ jwt, gateway = null }) {
    if (!jwt) {
      throw new Error('Pinata JWT is required');
    }

    this.jwt = jwt;
    this.gateway = gateway || 'gateway.pinata.cloud';
    this.groupName = 'Users';  // Simple, clean group name for all user master files
    this.groupId = null;

    // In-memory cache for unified user files (avoid slow IPFS loads)
    this.unifiedUserCache = new Map();

    // Fallback gateways for faster retrieval
    this.fallbackGateways = [
      this.gateway,                    // Primary (custom or Pinata)
      'dweb.link',                     // Fast, reliable
      'ipfs.io',                       // Official IPFS gateway
      'cloudflare-ipfs.com',          // Cloudflare (very fast)
      'w3s.link'                       // Web3.storage (fast)
    ];

    // Remove duplicates and filter out the primary
    this.fallbackGateways = [...new Set(this.fallbackGateways)];

    console.log('📦 PinataRemoteStorage initialized with in-memory cache');
    console.log(`🚀 Primary gateway: ${this.gateway}`);
  }

  /**
   * Initialize and ensure group exists
   */
  async init() {
    try {
      // Find or create the backups group
      const groups = await this._listGroups();
      const backupGroup = groups.find(g => g.name === this.groupName && g.isPublic);

      if (backupGroup) {
        this.groupId = backupGroup.id;
        console.log(`✅ Found backup group: ${this.groupId}`);
      } else {
        const newGroup = await this._createGroup(this.groupName, true);
        this.groupId = newGroup.id;
        console.log(`✅ Created backup group: ${this.groupId}`);
      }
    } catch (error) {
      console.error('❌ Failed to initialize backup group:', error);
      throw error;
    }
  }

  /**
   * Save or update unified user file (profile + encrypted backup)
   * IMPORTANT: This method saves exactly what you pass in data - no merging with old IPFS data
   */
  async saveUnifiedUser(publicKey, data) {
    if (!publicKey || !data) {
      throw new Error('publicKey and data are required');
    }

    const filename = `${publicKey}.json`;

    try {
      console.log(`📤 Saving unified user file for ${publicKey.substring(0, 12)}...`);

      // Mark old versions as superseded
      await this._markOldVersionsAsSuperseded(publicKey, 'user-backup');

      const response = await this._uploadFile({
        jsonData: data,
        fileName: filename,
        groupId: this.groupId,
        metadataName: filename,
        metadataKeyvalues: {
          type: 'user-backup',
          publicKey: publicKey,
          superseded: 'false',  // Mark as current version
          updatedAt: new Date().toISOString()
        }
      });

      const cid = response?.data?.cid || response?.cid;

      // Cache the data we just saved (avoid reload from IPFS!)
      this.unifiedUserCache.set(publicKey, data);

      console.log(`✅ Unified user file saved - CID: ${cid} (cached)`);

      return cid;
    } catch (error) {
      console.error('❌ Failed to save unified user file:', error);
      throw error;
    }
  }

  /**
   * Save complete user state atomically (RECOMMENDED)
   *
   * This method saves all user data at once without loading from IPFS first.
   * Use this method when you have fresh data from IndexedDB/SDK to avoid data loss.
   *
   * @param {string} publicKey - User's public key
   * @param {Object} completeState - Complete fresh state
   * @param {Object} completeState.profile - Profile data from IndexedDB (username, displayName, avatar, bio)
   * @param {Object} completeState.backup - Backup data from SDK (encryptedPrivateKey, iv, salt, etc.)
   * @param {Object} completeState.collaborators - Collaborators data from SDK
   * @param {string} completeState.encryptionPublicKey - Encryption public key
   */
  async saveCompleteState(publicKey, completeState) {
    const { profile, backup, collaborators, encryptionPublicKey } = completeState;

    console.log('📤 Saving complete user state atomically (no IPFS merge)');

    // Build unified data structure from fresh IndexedDB/SDK data
    const unifiedData = {
      publicKey,
      encryptionPublicKey: encryptionPublicKey || null,
      version: 1,
      public: null,
      private: {}
    };

    // Add profile data if provided
    if (profile) {
      unifiedData.public = {
        username: profile.username || null,
        displayName: profile.displayName || null,
        avatar: profile.avatar || null,
        bio: profile.bio || null,
        updatedAt: new Date().toISOString()
      };
    }

    // Add backup data if provided
    if (backup) {
      unifiedData.private = {
        cipher: backup.encryptedPrivateKey || backup.cipher,
        iv: backup.encryptionIv || backup.iv,
        salt: backup.salt,
        iterations: backup.iterations || 600000,
        encryptionCipher: backup.encryptedEncryptionKey || backup.encryptionCipher || null,
        encryptionIv: backup.encryptionKeyIv || backup.encryptionIv || null,
        encryptionSalt: backup.encryptionSalt || null,
        encryptionIterations: backup.encryptionIterations || 600000,
        updatedAt: new Date().toISOString()
      };

      // Add collaborators to private section if provided
      if (collaborators) {
        unifiedData.private.collaborators = collaborators;
      }
    } else if (collaborators) {
      // If no backup but have collaborators, still add them
      unifiedData.private = {
        collaborators: collaborators,
        updatedAt: new Date().toISOString()
      };
    }

    return await this.saveUnifiedUser(publicKey, unifiedData);
  }

  /**
   * Load unified user file (profile + encrypted backup)
   */
  async loadUnifiedUser(publicKey, { skipCache = false } = {}) {
    if (!publicKey) {
      throw new Error('publicKey is required');
    }

    // Check cache first (FAST!)
    if (!skipCache && this.unifiedUserCache.has(publicKey)) {
      console.log(`✅ Unified user file loaded from cache (instant)`);
      return this.unifiedUserCache.get(publicKey);
    }

    try {
      console.log(`📥 Loading unified user file for ${publicKey.substring(0, 12)} from IPFS...`);

      // Search for the file in the backup group
      const files = await this._listFiles(this.groupId, {
        type: 'user-backup',
        publicKey: publicKey
      });

      if (files.length === 0) {
        console.log('ℹ️ No backup found for this public key');
        return null;
      }

      // Get the most recent file (first in list)
      const file = files[0];
      const data = await this._downloadFile(file.cid);

      // Cache it for next time
      this.unifiedUserCache.set(publicKey, data);

      console.log(`✅ Unified user file loaded from IPFS (now cached)`);
      return data;
    } catch (error) {
      console.error('❌ Failed to load unified user file:', error);
      return null;
    }
  }

  /**
   * Save profile (optimized - uses cache or minimal load)
   */
  async upsertProfile(publicKey, profile) {
    // Try to use cached data first (FAST!)
    let existingData = this.unifiedUserCache.get(publicKey);

    if (!existingData) {
      // Not in cache - load once from IPFS
      existingData = await this.loadUnifiedUser(publicKey);
    }

    if (!existingData) {
      // No existing file - create new one
      existingData = {
        publicKey,
        encryptionPublicKey: profile.encryptionPublicKey || null,
        public: {},
        private: null
      };
    }

    // Update public section - preserve existing keys not in the update
    existingData.public = {
      username: profile.username !== undefined ? profile.username : (existingData.public?.username || null),
      displayName: profile.displayName !== undefined ? profile.displayName : (existingData.public?.displayName || null),
      avatar: profile.avatar !== undefined ? profile.avatar : (existingData.public?.avatar || null),
      bio: profile.bio !== undefined ? profile.bio : (existingData.public?.bio || null),
      updatedAt: new Date().toISOString()
    };

    // Ensure publicKey and encryptionPublicKey are set
    existingData.publicKey = existingData.publicKey || publicKey;
    existingData.encryptionPublicKey = existingData.encryptionPublicKey || profile.encryptionPublicKey || null;

    return await this.saveUnifiedUser(publicKey, existingData);
  }

  /**
   * Load profile (legacy method - now uses loadUnifiedUser)
   */
  async loadProfile(publicKey) {
    const unified = await this.loadUnifiedUser(publicKey);

    if (!unified || !unified.public) {
      return null;
    }

    // Merge publicKey and encryptionPublicKey into profile
    // (SDK expects these fields in the profile object)
    return {
      publicKey: unified.publicKey,
      encryptionPublicKey: unified.encryptionPublicKey,
      ...unified.public
    };
  }

  /**
   * Save identity backup (optimized - uses cache)
   */
  async saveIdentityBackup(publicKey, backup) {
    // Use cached data first (FAST!)
    let existingData = this.unifiedUserCache.get(publicKey);

    if (!existingData) {
      // Not in cache - load once
      existingData = await this.loadUnifiedUser(publicKey);
    }

    if (!existingData) {
      existingData = {
        publicKey,
        encryptionPublicKey: backup.encryptionPublicKey || null,
        public: null,
        private: {}
      };
    }

    const previousPrivate = existingData.private ?? {};

    const updatedPrivate = {
      cipher: backup.encryptedPrivateKey || backup.cipher,
      iv: backup.encryptionIv || backup.iv,
      salt: backup.salt,
      iterations: backup.iterations || 600000,
      encryptionCipher: backup.encryptedEncryptionKey || backup.encryptionCipher || null,
      encryptionIv: backup.encryptionKeyIv || backup.encryptionIv || null,
      encryptionSalt: backup.encryptionSalt || null,
      encryptionIterations: backup.encryptionIterations || 600000,
      updatedAt: new Date().toISOString()
    };

    // Preserve additional private fields (e.g., collaborators) while updating the core keys
    existingData.private = {
      ...previousPrivate,
      ...updatedPrivate,
    };

    existingData.publicKey = existingData.publicKey || publicKey;
    existingData.encryptionPublicKey = existingData.encryptionPublicKey || backup.encryptionPublicKey || null;
    existingData.version = backup.version || existingData.version || 1;

    return await this.saveUnifiedUser(publicKey, existingData);
  }

  /**
   * Load identity backup (legacy method - now uses loadUnifiedUser)
   */
  async loadIdentityBackup(publicKey) {
    const unified = await this.loadUnifiedUser(publicKey);
    return unified?.private || null;
  }

  /**
   * Save collaborator backup (optimized - uses cache)
   * Merges into the unified user file's private.collaborators section
   */
  async saveCollaboratorBackup(publicKey, payload) {
    try {
      console.log(`📤 Saving collaborator backup for ${publicKey.substring(0, 12)}...`);

      // Use cached data first (FAST!)
      let existingData = this.unifiedUserCache.get(publicKey);

      if (!existingData) {
        // Not in cache - load once
        existingData = await this.loadUnifiedUser(publicKey);
      }

      if (!existingData) {
        console.warn('⚠️ No unified user file found - creating one');
        existingData = {
          publicKey,
          encryptionPublicKey: null,
          public: null,
          private: {}
        };
      }

      // Ensure private section exists
      if (!existingData.private) {
        existingData.private = {};
      }

      // Add collaborators to private section
      existingData.private.collaborators = payload;

      // Save updated unified file (will update cache automatically)
      const cid = await this.saveUnifiedUser(publicKey, existingData);

      console.log(`✅ Collaborator backup saved (cached) - CID: ${cid}`);

      return cid;
    } catch (error) {
      console.error('❌ Failed to save collaborator backup:', error);
      throw error;
    }
  }

  /**
   * Load collaborator backup
   * Reads from the unified user file's private.collaborators section
   */
  async loadCollaboratorBackup(publicKey) {
    if (!publicKey) {
      throw new Error('publicKey is required');
    }

    try {
      console.log(`📥 Loading collaborator backup for ${publicKey.substring(0, 12)}...`);

      // Load unified user file
      const unified = await this.loadUnifiedUser(publicKey);

      if (!unified || !unified.private || !unified.private.collaborators) {
        console.log('ℹ️ No collaborator backup found in unified file');
        return null;
      }

      console.log(`✅ Collaborator backup loaded from unified file`);
      return unified.private.collaborators;
    } catch (error) {
      console.error('❌ Failed to load collaborator backup:', error);
      return null;
    }
  }

  // ========================================================================
  // PRIVATE METHODS - Pinata API interactions
  // ========================================================================

  /**
   * Upload file to Pinata (direct API call, no proxy needed)
   */
  async _uploadFile({ jsonData, fileName, groupId, metadataName, metadataKeyvalues }) {
    const jsonString = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });

    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('network', 'public'); // Use public network for easier access

    if (groupId) {
      formData.append('group_id', groupId);
    }

    if (metadataName) {
      formData.append('name', metadataName);
    }

    if (metadataKeyvalues && Object.keys(metadataKeyvalues).length > 0) {
      formData.append('keyvalues', JSON.stringify(metadataKeyvalues));
    }

    const response = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.jwt}`
        // Don't set Content-Type - browser sets it with boundary for multipart/form-data
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || errorData?.message || 'Upload failed';
      throw new Error(`${errorMsg} (${response.status})`);
    }

    return await response.json();
  }

  /**
   * Download file with gateway fallback and racing
   */
  async _downloadFile(cid) {
    const primaryGateway = this.fallbackGateways[0];
    const primaryUrl = `https://${primaryGateway}/ipfs/${cid}`;
    const timeout = 5000; // 5 seconds

    console.log(`📥 Fetching from primary gateway: ${primaryGateway}`);

    try {
      // Try primary gateway with timeout
      const response = await this._fetchWithTimeout(primaryUrl, timeout);

      if (response.ok) {
        console.log(`✅ Retrieved from ${primaryGateway}`);
        return await response.json();
      }
    } catch (error) {
      console.warn(`⚠️ Primary gateway failed: ${error.message}`);
    }

    // Primary failed - race all fallback gateways
    console.log(`🏁 Racing ${this.fallbackGateways.length} gateways...`);

    return await this._raceGateways(cid);
  }

  /**
   * Fetch with timeout
   */
  async _fetchWithTimeout(url, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Race all gateways and return first successful response
   */
  async _raceGateways(cid) {
    return new Promise((resolve, reject) => {
      let successfulResponse = null;
      let completedCount = 0;
      const errors = [];

      this.fallbackGateways.forEach(async (gateway) => {
        const url = `https://${gateway}/ipfs/${cid}`;

        try {
          const response = await this._fetchWithTimeout(url, 8000); // 8 second timeout per gateway

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();

          // First successful response wins!
          if (!successfulResponse) {
            successfulResponse = data;
            console.log(`✅ Retrieved from ${gateway} (winner!)`);
            resolve(data);
          }
        } catch (error) {
          console.warn(`✗ ${gateway} failed: ${error.message}`);
          errors.push(`${gateway}: ${error.message}`);
        } finally {
          completedCount++;

          // All gateways failed
          if (completedCount === this.fallbackGateways.length && !successfulResponse) {
            reject(new Error(`All gateways failed: ${errors.join(', ')}`));
          }
        }
      });
    });
  }

  /**
   * List files in group
   */
  async _listFiles(groupId, filters = {}) {
    const url = `https://api.pinata.cloud/v3/files/public?group=${groupId}&limit=100`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.jwt}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to list files: ${response.status}`);
    }

    const data = await response.json();
    let files = data?.data?.files || [];

    // Apply filters
    if (filters.type) {
      files = files.filter(f => f.keyvalues?.type === filters.type);
    }
    if (filters.publicKey) {
      files = files.filter(f => f.keyvalues?.publicKey === filters.publicKey);
    }

    // Filter out superseded versions (only show current)
    files = files.filter(f => f.keyvalues?.superseded !== 'true');

    // Sort by created_at desc (most recent first)
    files.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return files;
  }

  /**
   * Delete old versions of a file (cleanup to avoid duplicates)
   */
  async _deleteOldVersions(publicKey, type) {
    try {
      // Find all existing files for this publicKey and type
      const url = `https://api.pinata.cloud/v3/files/public?group=${this.groupId}&limit=100`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.jwt}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn('Could not list files to delete old versions');
        return;
      }

      const data = await response.json();
      let files = data?.data?.files || [];

      // Filter to matching files
      const matchingFiles = files.filter(
        f => f.keyvalues?.type === type &&
             f.keyvalues?.publicKey === publicKey
      );

      if (matchingFiles.length === 0) {
        console.log('ℹ️ No old versions to delete');
        return;
      }

      console.log(`🗑️ Found ${matchingFiles.length} old version(s) to delete`);

      // Delete each old version
      for (const file of matchingFiles) {
        try {
          await this._deleteFile(file.id);
          console.log(`✓ Deleted old version: ${file.id.substring(0, 12)}... (CID: ${file.cid.substring(0, 12)}...)`);
        } catch (error) {
          console.warn(`Failed to delete file ${file.id}:`, error.message);
        }
      }
    } catch (error) {
      console.warn('Failed to delete old versions:', error);
      // Don't throw - this is cleanup, not critical
    }
  }

  /**
   * Mark old versions as superseded (legacy - prefer _deleteOldVersions)
   */
  async _markOldVersionsAsSuperseded(publicKey, type) {
    // Just call delete now - simpler and cleaner
    return this._deleteOldVersions(publicKey, type);
  }

  /**
   * Clean up all duplicate files - keeps only the most recent version for each user
   * Useful for manual cleanup after testing
   */
  async cleanupAllDuplicates() {
    try {
      console.log('🧹 Starting cleanup of all duplicate files...');

      const url = `https://api.pinata.cloud/v3/files/public?group=${this.groupId}&limit=100`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.jwt}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to list files for cleanup');
      }

      const data = await response.json();
      const allFiles = data?.data?.files || [];

      // Group files by publicKey
      const filesByUser = {};
      allFiles.forEach(file => {
        const pk = file.keyvalues?.publicKey;
        const type = file.keyvalues?.type;

        if (pk && type === 'user-backup') {
          if (!filesByUser[pk]) {
            filesByUser[pk] = [];
          }
          filesByUser[pk].push(file);
        }
      });

      let totalDeleted = 0;

      // For each user, keep only the most recent file
      for (const [publicKey, files] of Object.entries(filesByUser)) {
        if (files.length <= 1) {
          console.log(`✓ User ${publicKey.substring(0, 12)}... has only 1 file (no cleanup needed)`);
          continue;
        }

        // Sort by created_at descending (most recent first)
        files.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const keepFile = files[0];
        const deleteFiles = files.slice(1);

        console.log(`🗑️ User ${publicKey.substring(0, 12)}... has ${files.length} files, keeping newest, deleting ${deleteFiles.length} old versions`);
        console.log(`   ✓ Keeping: ${keepFile.id.substring(0, 12)}... (created ${new Date(keepFile.created_at).toISOString()})`);

        for (const file of deleteFiles) {
          try {
            await this._deleteFile(file.id);
            console.log(`   ✓ Deleted: ${file.id.substring(0, 12)}... (created ${new Date(file.created_at).toISOString()})`);
            totalDeleted++;
          } catch (error) {
            console.warn(`   ✗ Failed to delete ${file.id}:`, error.message);
          }
        }
      }

      console.log(`✅ Cleanup complete! Deleted ${totalDeleted} duplicate files`);
      return { totalDeleted, usersProcessed: Object.keys(filesByUser).length };

    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Delete a file from Pinata
   */
  async _deleteFile(fileId) {
    const url = `https://api.pinata.cloud/v3/files/public/${fileId}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.jwt}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const errorMsg = data?.error?.message || data?.message || 'Delete failed';
      throw new Error(`${errorMsg} (${response.status})`);
    }

    return await response.json();
  }

  /**
   * Update file metadata
   */
  async _updateFileMetadata(fileId, updates) {
    const url = `https://api.pinata.cloud/v3/files/public/${fileId}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.jwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const data = await response.json();
      const errorMsg = data?.error?.message || data?.message || 'Update failed';
      throw new Error(`${errorMsg} (${response.status})`);
    }

    return await response.json();
  }

  /**
   * List groups using direct v3 API
   */
  async _listGroups() {
    const publicGroups = [];
    const privateGroups = [];

    // Fetch public groups
    try {
      const publicData = await this._callApi('/v3/groups/public', 'GET');
      const items = publicData?.data?.groups || publicData?.groups || [];
      items.forEach(g => {
        g.isPublic = true;
        publicGroups.push(g);
      });
    } catch (error) {
      console.warn('⚠️ Could not fetch public groups:', error.message);
    }

    // Fetch private groups
    try {
      const privateData = await this._callApi('/v3/groups/private', 'GET');
      const items = privateData?.data?.groups || privateData?.groups || [];
      items.forEach(g => {
        g.isPublic = false;
        privateGroups.push(g);
      });
    } catch (error) {
      console.warn('⚠️ Could not fetch private groups:', error.message);
    }

    return [...publicGroups, ...privateGroups];
  }

  /**
   * Create group using direct v3 API
   */
  async _createGroup(name, isPublic = true) {
    const network = isPublic ? 'public' : 'private';
    const data = await this._callApi(`/v3/groups/${network}`, 'POST', { name });
    return data?.data || data;
  }

  /**
   * Call Pinata v3 API directly
   */
  async _callApi(endpoint, method = 'GET', body = null) {
    const url = `https://api.pinata.cloud${endpoint}`;

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.jwt}`,
        'Content-Type': 'application/json'
      }
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error || data?.message || 'API request failed';
      throw new Error(`${errorMsg} (${response.status})`);
    }

    return data;
  }

}
