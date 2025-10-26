/**
 * IPFS Provider Abstraction Layer
 * Supports multiple IPFS pinning services with a unified interface
 */

// ============================================================
// BASE PROVIDER INTERFACE
// ============================================================

/**
 * Base class for IPFS providers
 * All providers must implement: upload(), download(), getGatewayUrl()
 */
export class IPFSProvider {
  constructor(config) {
    this.config = config;
  }

  /**
   * Upload JSON data to IPFS
   * @param {Object} jsonData - Data to upload
   * @param {Object} options - Upload options (provider-specific)
   * @returns {Promise<string>} CID of uploaded content
   */
  async upload(jsonData, options = {}) {
    throw new Error('Must implement upload()');
  }

  /**
   * Download JSON data from IPFS
   * @param {string} cid - Content identifier
   * @returns {Promise<Object>} Downloaded JSON data
   */
  async download(cid) {
    throw new Error('Must implement download()');
  }

  /**
   * Get public gateway URL for a CID
   * @param {string} cid - Content identifier
   * @returns {string} Gateway URL
   */
  getGatewayUrl(cid) {
    throw new Error('Must implement getGatewayUrl()');
  }
}

// ============================================================
// PINATA PROVIDER
// ============================================================

/**
 * Pinata IPFS Provider
 * Documentation: https://docs.pinata.cloud/
 */
export class PinataProvider extends IPFSProvider {
  constructor(config) {
    super(config);

    if (!config.jwt) {
      throw new Error('Pinata JWT is required');
    }

    // Store JWT and decode to extract API key and secret
    // JWT format: header.payload.signature
    const jwt = config.jwt.trim();
    this.jwt = jwt; // Store for v3 API calls (Groups, etc.)

    const parts = jwt.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    try {
      // Decode the payload (base64url encoded)
      const payload = JSON.parse(atob(parts[1]));
      this.apiKey = payload.scopedKeyKey;
      this.secret = payload.scopedKeySecret;
      this.scopes = payload.scopes || [];

      if (!this.apiKey || !this.secret) {
        throw new Error('JWT does not contain scopedKeyKey or scopedKeySecret');
      }

      console.log('✅ Extracted API key from JWT:', this.apiKey);

      // Admin keys have empty scopes array = ALL permissions
      // Scoped keys have specific scopes listed
      if (!this.scopes || this.scopes.length === 0) {
        console.log('🔐 Admin JWT detected - All permissions granted');
      } else {
        console.log('🔐 Scoped JWT - Available scopes:', this.scopes.join(', '));

        // Only warn if using scoped key and missing critical scopes
        const requiredScopes = ['data:read', 'data:write'];
        const v3GroupScopes = ['groups:read', 'groups:write'];

        const missingRequired = requiredScopes.filter(s => !this.scopes.includes(s));
        const missingGroups = v3GroupScopes.filter(s => !this.scopes.includes(s));

        if (missingRequired.length > 0) {
          console.warn('⚠️ Missing required scopes:', missingRequired.join(', '));
        }
        if (missingGroups.length > 0) {
          console.warn('⚠️ Missing v3 Groups API scopes:', missingGroups.join(', '), '(Groups API will fail)');
        }
      }
    } catch (error) {
      console.error('Failed to decode JWT:', error);
      throw new Error('Failed to extract credentials from JWT');
    }

    this.gateway = config.gateway || 'gateway.pinata.cloud';
    this.uploadEndpoint = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
    this.uploadEndpointV3 = 'https://uploads.pinata.cloud/v3/files';
    this.groupsEndpoint = 'https://api.pinata.cloud/v3/groups';
    this.proxyUrl = '/pinata-proxy.php'; // PHP proxy for v3 API
    this.groupCache = {}; // Cache created groups to avoid recreating
  }

  /**
   * Get available scopes from JWT
   * @returns {Array<string>} Array of scope strings
   */
  getScopes() {
    return this.scopes || [];
  }

  /**
   * Check if a specific scope is available
   * @param {string} scope - Scope to check (e.g., 'groups:write')
   * @returns {boolean} True if scope is available
   */
  hasScope(scope) {
    // Admin keys (no scopes) have all permissions
    if (!this.scopes || this.scopes.length === 0) {
      return true;
    }
    // Scoped keys must have the specific scope
    return this.scopes.includes(scope);
  }

  /**
   * Call Pinata v3 API via PHP proxy (handles CORS)
   * @param {string} endpoint - API endpoint (e.g., '/v3/groups/public')
   * @param {string} method - HTTP method
   * @param {Object} body - Request body (optional)
   * @returns {Promise<Object>} API response
   */
  async callV3API(endpoint, method = 'GET', body = null) {
    const response = await fetch(this.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        endpoint: endpoint,
        jwt: this.jwt,
        method: method,
        body: body
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMsg = typeof errorData.error === 'object'
        ? JSON.stringify(errorData.error)
        : (errorData.error || 'Unknown error');
      console.error('❌ API Error Response:', errorData);
      throw new Error(`Proxy request failed (${response.status}): ${errorMsg}`);
    }

    return await response.json();
  }

  /**
   * Upload JSON to Pinata using v1 API (pinJSONToIPFS)
   * @param {Object} jsonData - JSON data to upload
   * @param {Object} options - Upload options
   * @param {string} options.userDid - User's DID for folder organization
   * @param {string} options.serviceName - Service name for folder organization
   * @param {string} options.filename - Optional filename (default: data.json)
   * @param {string} options.groupId - Optional group ID to upload to
   * @param {Object} options.metadata - Optional metadata object with name and keyvalues
   * @returns {Promise<string>} IPFS CID
   */
  async upload(jsonData, options = {}) {
    try {
      console.log('📤 Uploading to Pinata (v1 API - pinJSONToIPFS)...');

      const {
        userDid,
        serviceName,
        filename = 'data.json',
        groupId,
        metadata
      } = options;

      // Step 1: Determine group ID
      // Priority: options.groupId > default hardcoded group
      let serviceGroupId = groupId || '2064e757-2f89-4f82-8873-b14a111d28fa';

      console.log('📁 Using group:', serviceGroupId);

      // Step 2: Prepare upload payload (v1 API format)
      const uploadPayload = {
        pinataContent: jsonData,
        pinataMetadata: {
          name: serviceName ? `${serviceName}/${filename}` : filename,
          keyvalues: {
            uploadedAt: new Date().toISOString(),
            type: 'json'
          }
        }
      };

      // Merge custom metadata if provided
      if (metadata) {
        if (metadata.name) {
          uploadPayload.pinataMetadata.name = metadata.name;
        }
        if (metadata.keyvalues && typeof metadata.keyvalues === 'object') {
          uploadPayload.pinataMetadata.keyvalues = {
            ...uploadPayload.pinataMetadata.keyvalues,
            ...metadata.keyvalues
          };
        }
      }

      // Add user DID to metadata
      if (userDid) {
        uploadPayload.pinataMetadata.keyvalues.userDid = userDid;
      }

      // Add service name to metadata
      if (serviceName) {
        uploadPayload.pinataMetadata.keyvalues.service = serviceName;
      }

      // Add group ID to options (use groupID with capital ID as per Pinata docs)
      if (serviceGroupId) {
        uploadPayload.pinataOptions = {
          groupID: serviceGroupId
        };
      }

      console.log('📁 Uploading to group:', serviceGroupId || 'none');
      console.log('📋 Metadata:', uploadPayload.pinataMetadata);

      // Step 3: Upload via v1 API
      const response = await this.callV3API('/pinning/pinJSONToIPFS', 'POST', uploadPayload);

      const cid = response.IpfsHash;
      if (!cid) {
        throw new Error('No CID returned from upload');
      }

      console.log('✅ Uploaded to Pinata');
      console.log('   CID:', cid);
      if (serviceGroupId) {
        console.log('   Group:', serviceGroupId);
      }

      return cid;

    } catch (error) {
      console.error('❌ Pinata upload error:', error);
      throw error;
    }
  }

  /**
   * List all groups (v3 API - both public and private)
   * @returns {Promise<Array>} Array of groups with {id, name, isPublic, ...}
   */
  async listGroups() {
    try {
      const publicGroups = [];
      const privateGroups = [];

      // Fetch public groups
      try {
        const publicData = await this.callV3API('/v3/groups/public', 'GET');
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
        const privateData = await this.callV3API('/v3/groups/private', 'GET');
        const items = privateData?.data?.groups || privateData?.groups || [];
        items.forEach(g => {
          g.isPublic = false;
          privateGroups.push(g);
        });
      } catch (error) {
        console.warn('⚠️ Could not fetch private groups:', error.message);
      }

      const allGroups = [...publicGroups, ...privateGroups];
      console.log(`📋 Found ${allGroups.length} groups (${publicGroups.length} public, ${privateGroups.length} private)`);
      return allGroups;

    } catch (error) {
      console.error('❌ List groups failed:', error);
      return [];
    }
  }

  /**
   * Create a new group (v1 API)
   * @param {string} groupName - Name of the group
   * @returns {Promise<Object|null>} Group object with id, name, etc.
   */
  async createGroup(groupName) {
    try {
      console.log('📁 Creating group:', groupName);

      const data = await this.callV3API('/groups', 'POST', {
        name: groupName
      });

      console.log('✅ Created group:', groupName, 'ID:', data.id);

      // Cache it
      this.groupCache[groupName] = data.id;

      return data;

    } catch (error) {
      console.error('❌ Create group failed:', error);
      throw error;
    }
  }

  /**
   * Get or create a group (folder) in Pinata (v1 API)
   * Checks if group exists first, creates only if needed
   * @param {string} groupName - Name of the group
   * @returns {Promise<string|null>} Group ID or null if failed
   */
  async getOrCreateGroup(groupName) {
    // Check cache first
    if (this.groupCache[groupName]) {
      console.log('📁 Using cached group:', groupName);
      return this.groupCache[groupName];
    }

    try {
      // Step 1: Check if group already exists
      console.log('🔍 Checking if group exists:', groupName);
      const groups = await this.listGroups();
      const existingGroup = groups.find(g => g.name === groupName);

      if (existingGroup) {
        console.log('✅ Group already exists:', groupName, 'ID:', existingGroup.id);
        this.groupCache[groupName] = existingGroup.id;
        return existingGroup.id;
      }

      // Step 2: Create group if it doesn't exist
      console.log('📁 Creating new group:', groupName);
      const newGroup = await this.createGroup(groupName);

      if (newGroup && newGroup.id) {
        this.groupCache[groupName] = newGroup.id;
        return newGroup.id;
      }

      return null;

    } catch (error) {
      console.warn('⚠️ Group management failed (continuing anyway):', error.message);
      return null;
    }
  }

  /**
   * Add a file to a group in Pinata
   * @param {string} groupId - Group ID to add file to
   * @param {string} fileId - File ID (UUID) to add
   * @param {boolean} isPublic - Whether the group is public
   * @param {number} retries - Number of retries (default 3)
   * @returns {Promise<boolean>} Success status
   */
  async addFileToGroup(groupId, fileId, isPublic = true, retries = 3) {
    if (!groupId || !fileId) {
      console.warn('⚠️ Missing groupId or fileId, skipping add to group');
      return false;
    }

    const network = isPublic ? 'public' : 'private';

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`📂 Adding file ${fileId} to group ${groupId} (attempt ${attempt}/${retries})`);

        await this.callV3API(`/v3/groups/${network}/${groupId}/ids/${fileId}`, 'PUT');

        console.log('✅ File added to group successfully');
        return true;

      } catch (error) {
        if (attempt < retries && error.message.includes('403')) {
          console.warn(`⚠️ Attempt ${attempt} failed (file may not be indexed yet), retrying in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.warn('⚠️ Add file to group failed:', error.message);
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Remove a file from a group
   * @param {string} groupId - Group ID
   * @param {string} fileId - File ID (UUID) to remove
   * @param {boolean} isPublic - Whether the group is public
   * @returns {Promise<boolean>} Success status
   */
  async removeFileFromGroup(groupId, fileId, isPublic = true) {
    try {
      const network = isPublic ? 'public' : 'private';
      console.log(`🗑️ Removing file ${fileId} from group ${groupId}`);

      await this.callV3API(`/v3/groups/${network}/${groupId}/ids/${fileId}`, 'DELETE');

      console.log('✅ File removed from group successfully');
      return true;

    } catch (error) {
      console.error('❌ Remove file from group failed:', error);
      return false;
    }
  }

  /**
   * Get a specific group by ID
   * @param {string} groupId - Group ID
   * @param {boolean} isPublic - Whether the group is public
   * @returns {Promise<Object|null>} Group object
   */
  async getGroup(groupId, isPublic = true) {
    try {
      const network = isPublic ? 'public' : 'private';
      const data = await this.callV3API(`/v3/groups/${network}/${groupId}`, 'GET');
      return data.data || data;

    } catch (error) {
      console.error('❌ Get group failed:', error);
      return null;
    }
  }

  /**
   * Delete a group
   * @param {string} groupId - Group ID to delete
   * @param {boolean} isPublic - Whether the group is public
   * @returns {Promise<boolean>} Success status
   */
  async deleteGroup(groupId, isPublic = true) {
    try {
      const network = isPublic ? 'public' : 'private';
      console.log('🗑️ Deleting group:', groupId);

      await this.callV3API(`/v3/groups/${network}/${groupId}`, 'DELETE');

      console.log('✅ Group deleted successfully');

      // Remove from cache
      for (const [name, id] of Object.entries(this.groupCache)) {
        if (id === groupId) {
          delete this.groupCache[name];
          break;
        }
      }

      return true;

    } catch (error) {
      console.error('❌ Delete group failed:', error);
      return false;
    }
  }

  /**
   * List files in a group
   * @param {string} groupId - Group ID
   * @param {boolean} isPublic - Whether the group is public
   * @param {Object} options - Query options (limit, offset, etc.)
   * @returns {Promise<Object>} Files in the group with pagination info
   */
  async listFilesInGroup(groupId, isPublic = true, options = {}) {
    try {
      const network = isPublic ? 'public' : 'private';
      console.log(`📂 Listing files in group ${groupId} (${network})`);

      // Get group details from v3 API
      const groupData = await this.callV3API(`/v3/groups/${network}/${groupId}`, 'GET');

      // Also fetch file list using v1 pinList API (filtered by group_id)
      const query = new URLSearchParams({
        status: 'pinned',
        group_id: groupId,
        pageLimit: options.limit || 100,
        pageOffset: options.offset || 0
      });

      // Add optional filters
      if (options.nameContains) {
        query.set('metadata[nameContains]', options.nameContains);
      }

      const pinList = await this.callV3API(`/data/pinList?${query.toString()}`, 'GET');

      const result = {
        group: groupData?.data || groupData,
        files: pinList?.rows || [],
        count: pinList?.count || 0
      };

      console.log(`✅ Found ${result.files.length} files in group`);
      return result;

    } catch (error) {
      console.error('❌ List files in group failed:', error);
      throw error;
    }
  }

  /**
   * Download JSON from IPFS via Pinata gateway with fallbacks
   * @param {string} cid - IPFS content identifier
   * @returns {Promise<Object>} Downloaded JSON data
   */
  async download(cid) {
    const fallbackGateways = [
      this.gateway,              // Primary (custom or Pinata)
      'dweb.link',               // Fast, reliable
      'ipfs.io',                 // Official IPFS gateway
      'cloudflare-ipfs.com',    // Cloudflare (very fast)
      'w3s.link'                 // Web3.storage (fast)
    ];

    // Remove duplicates
    const gateways = [...new Set(fallbackGateways)];
    const timeout = 5000; // 5 seconds

    // Try primary gateway first
    const primaryUrl = `https://${gateways[0]}/ipfs/${cid}`;
    console.log(`📥 Downloading from primary: ${gateways[0]}`);

    try {
      const response = await this._fetchWithTimeout(primaryUrl, timeout);

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Downloaded from ${gateways[0]}`);
        return data;
      }
    } catch (error) {
      console.warn(`⚠️ Primary gateway failed: ${error.message}`);
    }

    // Primary failed - race all gateways
    console.log(`🏁 Racing ${gateways.length} gateways for faster retrieval...`);

    return await this._raceGateways(cid, gateways);
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
  async _raceGateways(cid, gateways) {
    return new Promise((resolve, reject) => {
      let successfulResponse = null;
      let completedCount = 0;
      const errors = [];

      gateways.forEach(async (gateway) => {
        const url = `https://${gateway}/ipfs/${cid}`;

        try {
          const response = await this._fetchWithTimeout(url, 8000);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();

          // First successful response wins!
          if (!successfulResponse) {
            successfulResponse = data;
            console.log(`✅ Downloaded from ${gateway} (winner!)`);
            resolve(data);
          }
        } catch (error) {
          console.warn(`✗ ${gateway} failed: ${error.message}`);
          errors.push(`${gateway}: ${error.message}`);
        } finally {
          completedCount++;

          // All gateways failed
          if (completedCount === gateways.length && !successfulResponse) {
            reject(new Error(`All gateways failed: ${errors.join(', ')}`));
          }
        }
      });
    });
  }

  /**
   * Get Pinata gateway URL for a CID
   * @param {string} cid - IPFS content identifier
   * @returns {string} Gateway URL
   */
  getGatewayUrl(cid) {
    return `https://${this.gateway}/ipfs/${cid}`;
  }
}

// ============================================================
// FUTURE PROVIDERS (Placeholders)
// ============================================================

/**
 * Scaleway Labs IPFS Provider (France)
 * TODO: Implement when API details are available
 */
export class ScalewayProvider extends IPFSProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.region = config.region || 'fr-par';
    this.gateway = config.gateway || 'ipfs.scaleway.com';
  }

  async upload(jsonData) {
    throw new Error('ScalewayProvider not yet implemented');
  }

  async download(cid) {
    const url = this.getGatewayUrl(cid);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Scaleway download failed: ${response.statusText}`);
    }
    return await response.json();
  }

  getGatewayUrl(cid) {
    return `https://${this.gateway}/ipfs/${cid}`;
  }
}

/**
 * 4everland IPFS Provider
 * TODO: Implement when needed
 */
export class FourEverLandProvider extends IPFSProvider {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.gateway = config.gateway || '4everland.io';
  }

  async upload(jsonData) {
    throw new Error('FourEverLandProvider not yet implemented');
  }

  async download(cid) {
    const url = this.getGatewayUrl(cid);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`4everland download failed: ${response.statusText}`);
    }
    return await response.json();
  }

  getGatewayUrl(cid) {
    return `https://${this.gateway}/ipfs/${cid}`;
  }
}

// ============================================================
// PROVIDER FACTORY
// ============================================================

/**
 * Create an IPFS provider instance
 * @param {string} providerName - Provider name ('pinata', 'scaleway', '4everland')
 * @param {Object} config - Provider-specific configuration
 * @returns {IPFSProvider} Provider instance
 *
 * @example
 * const provider = createProvider('pinata', {
 *   jwt: 'your_pinata_jwt',
 *   gateway: 'gateway.pinata.cloud'
 * });
 *
 * const cid = await provider.upload({ hello: 'world' });
 * const data = await provider.download(cid);
 */
export function createProvider(providerName, config) {
  switch (providerName.toLowerCase()) {
    case 'pinata':
      return new PinataProvider(config);

    case 'scaleway':
      return new ScalewayProvider(config);

    case '4everland':
      return new FourEverLandProvider(config);

    default:
      throw new Error(`Unknown IPFS provider: ${providerName}`);
  }
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  IPFSProvider,
  PinataProvider,
  ScalewayProvider,
  FourEverLandProvider,
  createProvider
};
