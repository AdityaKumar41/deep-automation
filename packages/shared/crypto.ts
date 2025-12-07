import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derives an encryption key from the master secret using PBKDF2
 */
function deriveKey(salt: Buffer): Buffer {
  const masterSecret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET || 'default-secret-change-in-production';
  return crypto.pbkdf2Sync(masterSecret, salt, 100000, KEY_LENGTH, 'sha512');
}

/**
 * Encrypts a string value using AES-256-GCM
 * @param plaintext The string to encrypt
 * @returns Base64 encoded encrypted string with salt, IV, and auth tag
 */
export function encrypt(plaintext: string): string {
  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Derive encryption key from salt
  const key = deriveKey(salt);
  
  // Create cipher and encrypt
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  
  // Get authentication tag
  const tag = cipher.getAuthTag();
  
  // Combine salt + IV + tag + encrypted and encode as base64
  const combined = Buffer.concat([salt, iv, tag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypts an encrypted string
 * @param ciphertext Base64 encoded encrypted string
 * @returns Decrypted plaintext string
 */
export function decrypt(ciphertext: string): string {
  // Decode from base64
  const combined = Buffer.from(ciphertext, 'base64');
  
  // Extract salt, IV, tag, and encrypted data
  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  
  // Derive decryption key from salt
  const key = deriveKey(salt);
  
  // Create decipher and decrypt
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Encrypts GitHub secrets using libsodium (required for GitHub API)
 * @param publicKey Base64 encoded repository public key
 * @param secret Secret value to encrypt
 * @returns Base64 encoded encrypted secret
 */
export async function encryptGitHubSecret(publicKey: string, secret: string): Promise<string> {
  // Import libsodium
  const sodium = await import('libsodium-wrappers');
  await sodium.ready;
  
  // Convert base64 public key to binary
  const binaryKey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  
  // Convert secret to binary
  const binarySecret = sodium.from_string(secret);
  
  // Encrypt using sealed box (anonymous public key encryption)
  const encryptedBytes = sodium.crypto_box_seal(binarySecret, binaryKey);
  
  // Convert to base64
  return sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);
}
