/**
 * End-to-end encryption for the password vault (Web Crypto API).
 *
 * - The key is derived from the master password with PBKDF2-SHA256 (600,000 iterations,
 *   random 16-byte salt) and is non-extractable: JavaScript can use it but not read it.
 * - Each item is encrypted with AES-GCM-256 and a fresh random 12-byte IV; the stored value
 *   is base64(IV + ciphertext). GCM also detects any tampering.
 * - A "verifier" (a known text encrypted with the key) lets the browser tell a wrong master
 *   password from a right one without the server ever seeing either.
 */
import type { VaultSetup, VaultStatus } from "../types";

export const ITERATIONS = 600_000;
const VERIFIER_TEXT = "ai-notes-vault-v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class WrongMasterPasswordError extends Error {
  constructor() {
    super("Wrong master password.");
    this.name = "WrongMasterPasswordError";
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function deriveKey(password: string, salt: string, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv);
  out.set(new Uint8Array(cipher), iv.length);
  return toBase64(out);
}

export async function decryptJson<T>(key: CryptoKey, data: string): Promise<T> {
  const bytes = fromBase64(data);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12),
  );
  return JSON.parse(decoder.decode(plain)) as T;
}

/** New key material for a master password (setup or change). */
export async function createKeyMaterial(password: string): Promise<{ key: CryptoKey; setup: VaultSetup }> {
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(password, salt, ITERATIONS);
  const verifier = await encryptJson(key, { check: VERIFIER_TEXT });
  return { key, setup: { kdf: "pbkdf2-sha256", iterations: ITERATIONS, salt, verifier } };
}

/** Derives the key and checks it against the verifier. */
export async function unlockKey(password: string, status: VaultStatus): Promise<CryptoKey> {
  if (!status.salt || !status.iterations || !status.verifier) throw new WrongMasterPasswordError();
  const key = await deriveKey(password, status.salt, status.iterations);
  try {
    const check = await decryptJson<{ check: string }>(key, status.verifier);
    if (check.check !== VERIFIER_TEXT) throw new WrongMasterPasswordError();
  } catch {
    throw new WrongMasterPasswordError();
  }
  return key;
}
