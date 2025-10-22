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
    accessKey: 'YOUR_FILEBASE_ACCESS_KEY',
    secretKey: 'YOUR_FILEBASE_SECRET_KEY',
    bucket: 'your-collab-writer-bucket',
    region: 'us-east-1',
  },
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
 */
