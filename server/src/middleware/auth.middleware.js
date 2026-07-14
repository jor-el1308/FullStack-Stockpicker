import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/jwt.js";

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
 * NOTE for Person 1 (added by Person 2 - security fix, please review): the
 * session token now lives in an httpOnly `token` cookie (set by
 * auth.controller.js) instead of being read from an `Authorization: Bearer`
 * header. This closes the gap where a stolen/XSS-read token stored in
 * localStorage could be replayed from anywhere - httpOnly cookies aren't
 * readable from JS at all. The Authorization header is still accepted as a
 * fallback for now so any non-browser client (e.g. a script hitting the API
 * directly) still works.
 *
 * @param {import("express").Request & { userId?: string }} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const headerToken = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = req.cookies?.token ?? headerToken;

  if (!token) {
    return res.status(401).json({ success: false, error: { message: "Missing auth token" } });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (payload.purpose) {
      return res.status(401).json({ success: false, error: { message: "Invalid or expired token" } });
    }
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ success: false, error: { message: "Invalid or expired token" } });
  }
}
