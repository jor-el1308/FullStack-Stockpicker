/**
 * Owner: Person 1 (Auth & User Management).
 *
 * Single source of truth for the JWT signing secret. Throws instead of
 * silently falling back to a hardcoded default - a missing JWT_SECRET used
 * to fall back to the literal string "dev-secret", which would let anyone
 * forge a valid session token (including one for an admin account) if that
 * env var was ever left unset in a deployed environment.
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Set it in server/.env (see server/.env.example) before starting the server."
    );
  }
  return secret;
}

const DURATION_UNITS_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/**
 * Parses a jsonwebtoken-style duration string (e.g. "7d", "10m") into
 * milliseconds, for use as a cookie's maxAge. Falls back to 7 days if the
 * format isn't recognized.
 * @param {string} duration
 */
export function parseDurationMs(duration) {
  const match = /^(\d+)\s*([smhd])$/.exec(String(duration).trim());
  if (!match) return 7 * DURATION_UNITS_MS.d;
  return Number(match[1]) * DURATION_UNITS_MS[match[2]];
}
