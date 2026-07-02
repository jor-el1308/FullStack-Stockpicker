import jwt from "jsonwebtoken";

/**
 * Owned by Person 1 (Auth & User Management).
 * Verifies the JWT issued at login and attaches userId to the request.
 * Used by any route that needs "who is logged in" (saved criteria, watchlist).
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
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ success: false, error: { message: "Invalid or expired token" } });
  }
}
