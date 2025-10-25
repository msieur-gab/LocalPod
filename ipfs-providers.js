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

      if (!this.apiKey || !this.secret) {
        throw new Error('JWT does not contain scopedKeyKey or scopedKeySecret');
      }

      console.log('✅ Extracted API key from JWT:', this.apiKey);
    } catch (error) {
      console.error('Failed to decode JWT:', error);
      throw new Error('Failed to extract credentials from JWT');
    }

    this.gateway = config.gateway || 'gateway.pinata.cloud';
    this.uploadEndpoint = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
    this.groupsEndpoint = 'https://api.pinata.cloud/v3/groups';
    this.groupCache = {}; // Cache created groups to avoid recreating
  }

  /**
   * Upload JSON to Pinata using v1 API (like pebbble-write)
   * @param {Object} jsonData - JSON data to upload
   * @param {Object} options - Upload options
   * @param {string} options.userDid - User's DID for folder organization
   * @param {string} options.serviceName - Service name for folder organization
   * @param {string} options.filename - Optional filename (default: data.json)
   * @returns {Promise<string>} IPFS CID
   */
  async upload(jsonData, options = {}) {
    try {
      console.log('📤 Uploading to Pinata v1 API...');

      const { userDid, serviceName, filename = 'data.json' } = options;

      // Step 1: Get or create user group (one group per user)
      let userGroupId = null;
      if (userDid) {
        // Use full DID as group name for easy discovery
        userGroupId = await this.getOrCreateGroup(userDid, true);
      }

      // Convert JSON to File object
      const jsonString = JSON.stringify(jsonData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const file = new File([blob], filename, { type: 'application/json' });

      // Create FormData
      const formData = new FormData();
      formData.append('file', file);

      // Step 2: Build metadata with service tagging
      const metadata = {
        name: serviceName ? `${serviceName}/${filename}` : filename,
      };

      // Add keyvalues for organization and searchability
      const keyvalues = {
        uploadedAt: new Date().toISOString(),
        type: 'json'
      };

      if (userDid) {
        keyvalues.userDid = userDid;
      }

      if (serviceName) {
        keyvalues.service = serviceName;
      }

      if (userGroupId) {
        keyvalues.groupId = userGroupId;
      }

      metadata.keyvalues = keyvalues;

      console.log('📁 Pinata metadata:', metadata);
      formData.append('pinataMetadata', JSON.stringify(metadata));

      // Step 3: Upload file using API key + secret headers
      const response = await fetch(this.uploadEndpoint, {
        method: 'POST',
        headers: {
          'pinata_api_key': this.apiKey,
          'pinata_secret_api_key': this.secret
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinata upload failed (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      const cid = result.IpfsHash;

      if (!cid) {
        throw new Error('No CID returned from Pinata');
      }

      console.log('✅ Uploaded to Pinata, CID:', cid);

      // Step 4: Add file to user's group
      if (userGroupId) {
        await this.addFileToGroup(userGroupId, cid, true);
      }

      return cid;

    } catch (error) {
      console.error('❌ Pinata upload error:', error);
      throw error;
    }
  }

  /**
   * Get or create a group (folder) in Pinata
   * Checks if group exists first, creates only if needed
   * @param {string} groupName - Name of the group
   * @param {boolean} isPublic - Whether the group is public (default: true)
   * @returns {Promise<string|null>} Group ID or null if failed
   */
  async getOrCreateGroup(groupName, isPublic = true) {
    // Check cache first
    if (this.groupCache[groupName]) {
      console.log('📁 Using cached group:', groupName);
      return this.groupCache[groupName];
    }

    try {
      const network = isPublic ? 'public' : 'private';

      // Step 1: Check if group already exists
      console.log('🔍 Checking if group exists:', groupName);
      const listResponse = await fetch(`${this.groupsEndpoint}/${network}?name=${encodeURIComponent(groupName)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.jwt}`
        }
      });

      if (listResponse.ok) {
        const listData = await listResponse.json();
        console.log('📋 List response:', listData);

        if (listData.groups && listData.groups.length > 0) {
          const existingGroup = listData.groups.find(g => g.name === groupName);
          if (existingGroup) {
            console.log('✅ Group already exists:', groupName, 'ID:', existingGroup.id);
            this.groupCache[groupName] = existingGroup.id;
            return existingGroup.id;
          }
        }
      } else {
        console.warn('⚠️ List groups failed:', listResponse.status);
      }

      // Step 2: Create group if it doesn't exist
      console.log('📁 Creating new group:', groupName);
      const createResponse = await fetch(`${this.groupsEndpoint}/${network}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.jwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: groupName,
          is_public: isPublic
        })
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();

        // If 409 Conflict, the group exists - fetch it
        if (createResponse.status === 409) {
          console.log('⚠️ Group already exists (409), fetching ID...');

          // Try to list and find it
          const retryListResponse = await fetch(`${this.groupsEndpoint}/${network}?name=${encodeURIComponent(groupName)}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.jwt}`
            }
          });

          if (retryListResponse.ok) {
            const retryListData = await retryListResponse.json();
            console.log('📋 Retry list response:', retryListData);

            if (retryListData.groups && retryListData.groups.length > 0) {
              const existingGroup = retryListData.groups.find(g => g.name === groupName);
              if (existingGroup) {
                console.log('✅ Found existing group:', groupName, 'ID:', existingGroup.id);
                this.groupCache[groupName] = existingGroup.id;
                return existingGroup.id;
              }
            }
          }
        }

        throw new Error(`Failed to create group (${createResponse.status}): ${errorText}`);
      }

      const createData = await createResponse.json();
      const groupId = createData.id;

      // Cache the group ID
      this.groupCache[groupName] = groupId;

      console.log('✅ Created group:', groupName, 'ID:', groupId);
      return groupId;

    } catch (error) {
      console.warn('⚠️ Group management failed (continuing anyway):', error.message);
      return null;
    }
  }

  /**
   * Add a file to a group in Pinata
   * @param {string} groupId - Group ID to add file to
   * @param {string} cid - File CID to add
   * @param {boolean} isPublic - Whether the group is public
   * @returns {Promise<boolean>} Success status
   */
  async addFileToGroup(groupId, cid, isPublic = true) {
    if (!groupId || !cid) {
      console.warn('⚠️ Missing groupId or CID, skipping add to group');
      return false;
    }

    try {
      const network = isPublic ? 'public' : 'private';
      console.log(`📂 Adding file ${cid} to group ${groupId}`);

      const response = await fetch(`${this.groupsEndpoint}/${network}/${groupId}/ids/${cid}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.jwt}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`⚠️ Failed to add file to group (${response.status}):`, errorText);
        return false;
      }

      console.log('✅ File added to group successfully');
      return true;

    } catch (error) {
      console.warn('⚠️ Add file to group failed:', error.message);
      return false;
    }
  }

  /**
   * Download JSON from IPFS via Pinata gateway
   * @param {string} cid - IPFS content identifier
   * @returns {Promise<Object>} Downloaded JSON data
   */
  async download(cid) {
    try {
      const url = this.getGatewayUrl(cid);
      console.log('📥 Downloading from Pinata gateway:', url);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Pinata download failed (${response.status}): ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Downloaded from IPFS via Pinata');
      return data;

    } catch (error) {
      console.error('❌ Pinata download error:', error);
      throw error;
    }
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
