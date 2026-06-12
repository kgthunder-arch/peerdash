import * as nacl from "tweetnacl";

// Helper functions for base64 encoding/decoding
function encodeBase64(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString('base64');
}

function decodeBase64(str: string): Uint8Array {
  return Buffer.from(str, 'base64');
}

/**
 * Generate a new keypair for encryption
 */
export function generateKeyPair() {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    secretKey: encodeBase64(keyPair.secretKey)
  };
}

/**
 * Encrypt data with recipient's public key
 */
export function encryptData(
  data: Buffer,
  recipientPublicKey: string,
  senderSecretKey: string
): { ciphertext: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  
  const ciphertext = nacl.box(
    data,
    nonce,
    decodeBase64(recipientPublicKey),
    decodeBase64(senderSecretKey)
  );

  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce)
  };
}

/**
 * Decrypt data with sender's public key
 */
export function decryptData(
  ciphertext: string,
  nonce: string,
  senderPublicKey: string,
  recipientSecretKey: string
): Buffer | null {
  try {
    const decrypted = nacl.box.open(
      decodeBase64(ciphertext),
      decodeBase64(nonce),
      decodeBase64(senderPublicKey),
      decodeBase64(recipientSecretKey)
    );

    if (!decrypted) return null;
    return Buffer.from(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
}

/**
 * Generate a symmetric key for file encryption
 */
export function generateSymmetricKey(): string {
  const key = nacl.randomBytes(32);
  return encodeBase64(key);
}

/**
 * Encrypt data with symmetric key (for file transfer)
 */
export function encryptSymmetric(
  data: Buffer,
  key: string
): { ciphertext: string; nonce: string } {
  const keyBytes = decodeBase64(key);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  
  const ciphertext = nacl.secretbox(data, nonce, keyBytes);

  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce)
  };
}

/**
 * Decrypt data with symmetric key
 */
export function decryptSymmetric(
  ciphertext: string,
  nonce: string,
  key: string
): Buffer | null {
  try {
    const keyBytes = decodeBase64(key);
    const decrypted = nacl.secretbox.open(
      decodeBase64(ciphertext),
      decodeBase64(nonce),
      keyBytes
    );

    if (!decrypted) return null;
    return Buffer.from(decrypted);
  } catch (error) {
    console.error("Symmetric decryption failed:", error);
    return null;
  }
}

/**
 * Hash password with Argon2 (should use bcrypt in production)
 */
export function hashString(str: string): string {
  // In production, use bcrypt or argon2
  // For now, using a simple base64 encoding (NOT SECURE - for demo only)
  return encodeBase64(Buffer.from(str));
}

/**
 * Verify password hash
 */
export function verifyHash(str: string, hash: string): boolean {
  return hashString(str) === hash;
}
