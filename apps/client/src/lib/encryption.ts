import * as nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

/**
 * Generate a new keypair for the device
 */
export function generateDeviceKeyPair() {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    secretKey: encodeBase64(keyPair.secretKey)
  };
}

/**
 * Encrypt data with recipient's public key
 */
export function encryptForRecipient(
  data: Uint8Array,
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
 * Decrypt data from sender
 */
export function decryptFromSender(
  ciphertext: string,
  nonce: string,
  senderPublicKey: string,
  recipientSecretKey: string
): Uint8Array | null {
  try {
    const decrypted = nacl.box.open(
      decodeBase64(ciphertext),
      decodeBase64(nonce),
      decodeBase64(senderPublicKey),
      decodeBase64(recipientSecretKey)
    );

    return decrypted || null;
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
}

/**
 * Encrypt file chunk with symmetric key
 */
export function encryptFileChunk(
  chunk: Uint8Array,
  symmetricKey: string
): { ciphertext: string; nonce: string } {
  const keyBytes = decodeBase64(symmetricKey);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

  const ciphertext = nacl.secretbox(chunk, nonce, keyBytes);

  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce)
  };
}

/**
 * Decrypt file chunk with symmetric key
 */
export function decryptFileChunk(
  ciphertext: string,
  nonce: string,
  symmetricKey: string
): Uint8Array | null {
  try {
    const keyBytes = decodeBase64(symmetricKey);
    const decrypted = nacl.secretbox.open(
      decodeBase64(ciphertext),
      decodeBase64(nonce),
      keyBytes
    );

    return decrypted || null;
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
}

/**
 * Generate a new symmetric key for file transfer
 */
export function generateSymmetricKey(): string {
  const key = nacl.randomBytes(32);
  return encodeBase64(key);
}

/**
 * Hash a string (for integrity verification)
 */
export function hashString(data: Uint8Array): string {
  const hash = nacl.hash(data);
  return encodeBase64(hash);
}

/**
 * Sign data with secret key
 */
export function signData(
  data: Uint8Array,
  secretKey: string
): string {
  const sig = nacl.sign.detached(data, decodeBase64(secretKey));
  return encodeBase64(sig);
}

/**
 * Verify signature with public key
 */
export function verifySignature(
  data: Uint8Array,
  signature: string,
  publicKey: string
): boolean {
  try {
    return nacl.sign.detached.verify(
      data,
      decodeBase64(signature),
      decodeBase64(publicKey)
    );
  } catch {
    return false;
  }
}
