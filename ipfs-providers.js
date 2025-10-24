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

    this.jwt = config.jwt;
    this.gateway = config.gateway || 'gateway.pinata.cloud';
    this.uploadEndpoint = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
  }

  /**
   * Upload JSON to Pinata
   * @param {Object} jsonData - JSON data to upload
   * @returns {Promise<string>} IPFS CID
   */
  async upload(jsonData) {
    try {
      // Convert JSON to File object
      const jsonString = JSON.stringify(jsonData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const file = new File([blob], 'data.json', { type: 'application/json' });

      // Create FormData
      const formData = new FormData();
      formData.append('file', file);

      // Upload to Pinata using v1 API (better CORS support)
      const response = await fetch(this.uploadEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.jwt}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinata upload failed (${response.status}): ${errorText}`);
      }

      const result = await response.json();

      // Pinata v1 API returns: { IpfsHash, ... }
      const cid = result.IpfsHash;

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
