/**
 * AES-256-GCM encryption/decryption for session private keys at rest.
 *
 * The 32-byte encryption key is derived from the env var
 * SESSION_ENCRYPTION_KEY (hex-encoded, 64 chars).
 *
 * Stored format:  <iv_hex>:<ciphertext_hex>:<authtag_hex>
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(): Buffer {
  const hex = process.env.SESSION_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64)
    throw new Error(
      "SESSION_ENCRYPTION_KEY must be a 64-char hex string (32 bytes).",
    );
  return Buffer.from(hex, "hex");
}

export function encryptPrivateKey(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

export function decryptPrivateKey(blob: string): string {
  const [ivHex, ctHex, tagHex] = blob.split(":");
  if (!ivHex || !ctHex || !tagHex) throw new Error("Invalid encrypted blob");

  const key = getKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ctHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}


