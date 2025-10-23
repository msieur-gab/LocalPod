/**
 * LocalPod Configuration
 *
 * This configuration enables remote storage with Filebase S3.
 *
 * IMPORTANT: Replace these placeholder values with your actual Filebase credentials.
 *
 * To get credentials:
 * 1. Sign up for Filebase: https://filebase.com
 * 2. Create a bucket
 * 3. Generate API credentials (Access Keys)
 * 4. Replace the values below
 *
 * SECURITY WARNING:
 * - Never commit real credentials to public repositories
 * - For public demos, these placeholders will fail gracefully
 * - For private use, replace with real credentials and add config.js to .gitignore
 */

export const config = {
  filebase: {
    accessKey: 'DF2AA0ECE4C39A50297B',
    secretKey: 'XQyrX3Rbp3hM1QIVmSwfAd9Xhz5iNwWCWvVq0KzU',
    bucket: 'markdown-collab',
    region: 'us-east-1',
  },
  services: [
    {
      id: 'localpod-notes',
      name: 'LocalPod Notes',
      did: 'did:key:z6MkirvHWx3Wvp2YFXSGAizgkNZwPYkXhx2ci2eeoYAuttJX',
      /**
       * IMPORTANT: Replace with the service's X25519 encryption public key (base58).
       * This allows LocalPod to encrypt shared capability keys for the service.
       */
      encryptionPublicKey: '5HnyrpkwFX4NZP5XXesm5kshJRGDdkqm1TTMm43CaK53',
      requestedRights: ['write', 'read'],
      resourcePathTemplate: 'ipfs://${publicKey}/notes/*',
      defaultGrantDurationMs: 365 * 24 * 60 * 60 * 1000,
      description: 'LocalPod Notes demo service for personal IPFS-backed notes.',
    },
  ],
};

/**
 * Configuration Modes:
 *
 * 1. Demo Mode (Current - Placeholder Values):
 *    - Shows remote storage UI
 *    - Will fail gracefully if credentials aren't real
 *    - Good for demonstrations and testing UI
 *
 * 2. Local-Only Mode (Empty Strings):
 *    - Change values to empty strings: ''
 *    - Disables remote storage features
 *    - All data stays in browser IndexedDB
 *
 * 3. Production Mode (Real Credentials):
 *    - Replace with actual Filebase credentials
 *    - Enables profile sync and backup
 *    - Add config.js to .gitignore!
 *
 * Service Manifest:
 * - Populate `services` with trusted service DIDs and their X25519 encryption public keys
 * - Grant flows will refuse to issue capabilities until the encryption key is provided
 */
