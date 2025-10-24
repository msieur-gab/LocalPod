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
   * @returns {Promise<string>} CID of uploaded content
   */
  async upload(jsonData) {
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

    this.jwt = config.jwt.trim(); // Remove any whitespace
    this.gateway = config.gateway || 'gateway.pinata.cloud';
    this.signEndpoint = 'https://uploads.pinata.cloud/v3/files/sign';
  }

  /**
   * Upload JSON to Pinata using v3 signed URL approach
   * @param {Object} jsonData - JSON data to upload
   * @returns {Promise<string>} IPFS CID
   */
  async upload(jsonData) {
    try {
      console.log('📤 Uploading to Pinata v3 API (signed URL)...');

      // Convert JSON to File object
      const jsonString = JSON.stringify(jsonData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const file = new File([blob], 'data.json', { type: 'application/json' });

      // Step 1: Get signed upload URL
      console.log('🔑 Requesting signed upload URL...');
      const signResponse = await fetch(this.signEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.jwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filename: 'data.json',
          max_file_size: file.size,
          allow_mime_types: ['application/json']
        })
      });

      if (!signResponse.ok) {
        const errorText = await signResponse.text();
        throw new Error(`Failed to get signed URL (${signResponse.status}): ${errorText}`);
      }

      const signData = await signResponse.json();
      console.log('✅ Got signed URL');

      // Step 2: Upload file to signed URL
      console.log('📤 Uploading file to signed URL...');
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch(signData.data.url, {
        method: 'PUT',
        body: file
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload to signed URL failed (${uploadResponse.status}): ${errorText}`);
      }

      const uploadResult = await uploadResponse.json();
      const cid = uploadResult.data?.cid;

      if (!cid) {
        throw new Error('No CID returned from Pinata');
      }

      console.log('✅ Uploaded to Pinata, CID:', cid);
      return cid;

    } catch (error) {
      console.error('❌ Pinata upload error:', error);
      throw error;
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
