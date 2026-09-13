import crypto from "crypto";

/**
 * AES-256-GCM encryption for contact details (phone/email/address) at the
 * app layer — mirrors Trip App's vault-crypto.ts pattern for the same
 * reason: plaintext should never reach Supabase (live data or a backup
 * file), and this avoids depending on a Postgres extension. Needs a
 * server-only VAULT_ENCRYPTION_KEY (32 random bytes, base64) — see
 * README.md for how to generate one.
 */

function getKey(): Buffer {
  const key = process.env.VAULT_ENCRYPTION_KEY;
  if (!key) throw new Error("VAULT_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) throw new Error("VAULT_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return buf;
}

export function encryptValue(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptValue(ciphertext: string): string {
  const [ivB64, authTagB64, dataB64] = ciphertext.split(":");
  if (!ivB64 || !authTagB64 || !dataB64) throw new Error("Malformed ciphertext");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
