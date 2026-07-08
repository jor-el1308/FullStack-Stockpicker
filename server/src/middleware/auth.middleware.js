import jwt from "jsonwebtoken";

/**
 * Owned by Person 1 (Auth & User Management).
 * Verifies the JWT issued at login and attaches userId to the request.
 * Used by any route that needs "who is logged in" (saved criteria, watchlist).
 *
 * NOTE for Person 1 (added by Person 2 for login 2FA - please review): now
 * also rejects tokens carrying a `purpose` claim. auth.service.js's
 * issuePreAuthToken() (step 1 of login, before the emailed code is
 * verified) sets `purpose: "login-otp"` specifically so those short-lived
 * tokens can't be replayed here to reach an authenticated route before 2FA
 * actually completes - only issueToken()'s real session JWTs (no `purpose`
 * claim) are accepted.
 *
 * @param {import("express").Request & { userId?: string }} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ success: false, error: { message: "Missing auth token" } });
  }

  try {
    const secret = process.env.JWT_SECRET ?? "dev-secret";
    const payload = jwt.verify(token, secret);
    if (payload.purpose) {
      return res.status(401).json({ success: false, error: { message: "Invalid or expired token" } });
    }
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ success: false, error: { message: "Invalid or expired token" } });
  }
}
