// ============================================================================
// LovConnect — secure crypto helpers (Web Crypto, available in the Edge runtime)
//
//   - Secure random license keys / API tokens
//   - SHA-256 hashing (deterministic, so validate-license can match by hash)
//   - Only the HASH and a short PREFIX/MASK are ever stored in the database.
// ============================================================================

// Unambiguous alphabet for license keys (no I, L, O, 0, 1).
const LICENSE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// Full base62 for API tokens.
const TOKEN_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Cryptographically secure random string from the given alphabet. */
export function randomString(length: number, alphabet = LICENSE_ALPHABET): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/** Four 5-char groups, e.g. XXXXX-XXXXX-XXXXX-XXXXX */
function keyGroups(): string {
  const group = () => randomString(5, LICENSE_ALPHABET);
  return `${group()}-${group()}-${group()}-${group()}`;
}

/** Normal / lifetime license key, e.g. LC-XXXXX-XXXXX-XXXXX-XXXXX */
export function generateLicenseKey(): string {
  return `LC-${keyGroups()}`;
}

/** Trial license key, e.g. TRIAL-XXXXX-XXXXX-XXXXX-XXXXX */
export function generateTrialKey(): string {
  return `TRIAL-${keyGroups()}`;
}

/** API token like: rsl_<40 base62 chars> */
export function generateApiToken(): string {
  return `rsl_${randomString(40, TOKEN_ALPHABET)}`;
}

/** Deterministic SHA-256 hex digest. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Visible portion stored for display (never the full secret). */
export function maskKey(key: string): string {
  return `${key.slice(0, 8)}••••`;
}

/** Stable, queryable prefix for a secret. */
export function keyPrefix(key: string, len = 8): string {
  return key.slice(0, len);
}
