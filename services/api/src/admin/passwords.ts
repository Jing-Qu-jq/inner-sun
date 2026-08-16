// Password hashing for admin accounts (Feature 17).
//
// Uses **scrypt from Node's standard library** rather than Argon2id. Argon2id is the
// stronger modern default and would be the right call at scale, but every Node binding
// for it is a native module, and this service deploys to a free-tier host where a missing
// prebuilt binary is an opaque startup crash for whoever is on call. scrypt is memory-hard,
// in core, needs no build step, and is an accepted password KDF; against a closed list of
// three accounts behind rate limiting it is amply strong. Everything Argon2id-specific is
// contained in this file, so swapping later means changing `hashPassword`/`verifyPassword`
// and re-hashing on next login — the stored format is self-describing to allow exactly that.

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Hand-rolled rather than `promisify(scrypt)`: promisify resolves to the overload without
 * an options argument, so the cost parameters below would not typecheck through it.
 */
function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

// N=2^15 with r=8 needs ~32MB per hash. Chosen to stay comfortable on a 512MB instance
// while costing an attacker real memory per guess. Node's default maxmem is 32MB, which
// this would exceed, so maxmem is raised explicitly or the call throws.
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Shortest password an admin account may have. These guard the clinical knowledge base. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Hash a password into a self-describing string:
 *   scrypt$N$r$p$<salt base64>$<key base64>
 * Storing the parameters alongside the hash means raising them later does not invalidate
 * existing accounts — old hashes still verify against the parameters they were made with.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/**
 * Check a password against a stored hash. Returns false rather than throwing on a
 * malformed hash: a corrupt row should fail the login, not crash the login route.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltB64, keyB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });
  } catch {
    // Stored parameters we can no longer satisfy (e.g. they exceed maxmem).
    return false;
  }

  // Constant-time: a byte-by-byte early exit leaks how much of the hash matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Human-readable reason a password is unacceptable, or null when it is fine. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
