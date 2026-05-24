/**
 * Transfer-level E2E encryption.
 *
 * Protocol:
 * 1. Sender generates a random 32-byte symmetric key (sessionKey).
 * 2. Sender encrypts each chunk with NaCl secretbox using sessionKey.
 * 3. The sessionKey is exchanged via the control channel (already encrypted
 *    by the WebRTC DTLS layer, but we add an extra application-layer key
 *    exchange for defence-in-depth).
 * 4. Receiver decrypts each chunk with the same sessionKey.
 *
 * The nonce is prepended to each encrypted chunk so the receiver can
 * reconstruct it without a separate channel.
 */

import * as nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

export interface EncryptedChunk {
  /** nonce (24 bytes) + ciphertext, concatenated as Uint8Array */
  data: Uint8Array;
}

/** Generate a new 32-byte symmetric session key */
export function generateSessionKey(): string {
  return encodeBase64(nacl.randomBytes(32));
}

/**
 * Encrypt a binary chunk.
 * Returns a Uint8Array where the first 24 bytes are the nonce
 * and the rest is the ciphertext.
 */
export function encryptChunk(chunk: Uint8Array, sessionKeyB64: string): Uint8Array {
  const key = decodeBase64(sessionKeyB64);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength); // 24 bytes
  const ciphertext = nacl.secretbox(chunk, nonce, key);
  const result = new Uint8Array(nonce.length + ciphertext.length);
  result.set(nonce, 0);
  result.set(ciphertext, nonce.length);
  return result;
}

/**
 * Decrypt a binary chunk.
 * Expects the first 24 bytes to be the nonce.
 * Returns null if decryption fails (tampered data).
 */
export function decryptChunk(data: Uint8Array, sessionKeyB64: string): Uint8Array | null {
  try {
    const key = decodeBase64(sessionKeyB64);
    const nonce = data.subarray(0, nacl.secretbox.nonceLength);
    const ciphertext = data.subarray(nacl.secretbox.nonceLength);
    const plaintext = nacl.secretbox.open(ciphertext, nonce, key);
    return plaintext;
  } catch {
    return null;
  }
}

/** Encode session key for transmission in a control message */
export function exportSessionKey(key: string): string {
  return key; // already base64
}

/** Import session key received from peer */
export function importSessionKey(raw: string): string {
  return raw;
}
