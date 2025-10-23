import { isValidDid, isValidPublicKey } from '../core/DID.js';
import { base58ToBytes } from '../utils/encoding.js';

const normalizeRights = (rights) => {
  if (!rights) return [];
  const list = Array.isArray(rights) ? rights : String(rights).split(',');
  return Array.from(
    new Set(
      list
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  );
};

const coerceString = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

export class ServiceRegistry {
  constructor({ manifest = [] } = {}) {
    this.serviceMap = new Map();
    this.registerManifest(manifest);
  }

  registerManifest(manifest = []) {
    if (!Array.isArray(manifest)) return;
    manifest.forEach((entry) => {
      try {
        this.registerService(entry);
      } catch (error) {
        console.warn('ServiceRegistry: skipping invalid manifest entry', entry, error);
      }
    });
  }

  registerService(entry) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('ServiceRegistry.registerService expects an object');
    }

    const did = coerceString(entry.did);
    if (!did) {
      throw new Error('Service registry entry requires a did');
    }
    if (!isValidDid(did)) {
      throw new Error(`Invalid service DID: ${did}`);
    }

    let encryptionPublicKey = coerceString(entry.encryptionPublicKey ?? entry.encryptionKey ?? null);
    if (encryptionPublicKey) {
      try {
        const keyBytes = base58ToBytes(encryptionPublicKey);
        if (!isValidPublicKey(keyBytes)) {
          throw new Error('Key must decode to 32 bytes');
        }
      } catch (error) {
        console.warn(
          `ServiceRegistry: ignoring invalid encryption public key for service ${did}. Expected base58 X25519 key.`,
        );
        encryptionPublicKey = null;
      }
    }

    const normalized = {
      id: coerceString(entry.id) ?? did,
      did,
      name: coerceString(entry.name) ?? did,
      description: coerceString(entry.description) ?? null,
      website: coerceString(entry.website) ?? null,
      icon: coerceString(entry.icon) ?? null,
      encryptionPublicKey,
      defaultGrantDurationMs: Number.isFinite(entry.defaultGrantDurationMs)
        ? entry.defaultGrantDurationMs
        : null,
      requestedRights: normalizeRights(entry.requestedRights ?? entry.rights ?? []),
      resourcePathTemplate: coerceString(entry.resourcePathTemplate ?? entry.resourceTemplate ?? null),
      metadata: entry.metadata ? { ...entry.metadata } : {},
    };

    this.serviceMap.set(did, normalized);
    return normalized;
  }

  listServices() {
    return Array.from(this.serviceMap.values());
  }

  hasService(did) {
    return this.serviceMap.has(did);
  }

  getService(did) {
    if (!did) return null;
    return this.serviceMap.get(did) ?? null;
  }

  removeService(did) {
    if (!did) return false;
    return this.serviceMap.delete(did);
  }
}

export default ServiceRegistry;
