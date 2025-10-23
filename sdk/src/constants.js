/**
 * SDK Configuration Constants
 * @module sdk/constants
 */

// ========== Cryptography ==========

/**
 * PBKDF2 iteration count for key derivation
 * Higher = more secure but slower (600k iterations ≈ 100-200ms on modern hardware)
 */
export const PBKDF2_ITERATIONS = 600000;

/**
 * Backup format version
 */
export const BACKUP_VERSION = 1;

// ========== Password Requirements ==========

/**
 * Minimum password length
 */
export const PASSWORD_MIN_LENGTH = 12;

// ========== Caching ==========

/**
 * Profile cache time-to-live in milliseconds (5 minutes)
 */
export const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

// ========== Login Protection ==========

/**
 * Minimum failed login attempts before lockout starts
 */
export const LOGIN_LOCKOUT_MIN_ATTEMPTS = 3;

/**
 * Maximum lockout delay in seconds
 */
export const LOGIN_LOCKOUT_MAX_DELAY_SEC = 32;

/**
 * Base for exponential backoff calculation (2^(attempts-3))
 */
export const LOGIN_LOCKOUT_BASE = 2;
