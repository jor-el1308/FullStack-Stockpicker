import { pool } from "../config/db.js";

/**
 * Owner: Person 2 (Charles) - Admin Dashboard.
 *
 * Gate for admin-only routes. Must run AFTER requireAuth (needs req.userId
 * already set). Deliberately NOT combined with requireActiveAccount - an
 * admin managing the system shouldn't get locked out by their own paywall
 * status.
 *
 * @param {import("express").Request & { userId?: string }} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export async function requireAdmin(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ success: false, error: { message: "Missing auth token" } });
  }

  try {
    const [rows] = await pool.query("SELECT is_admin AS isAdmin FROM users WHERE id = ? LIMIT 1", [req.userId]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ success: false, error: { message: "User not found" } });
    }
    if (!user.isAdmin) {
      return res.status(403).json({ success: false, error: { message: "Admin access required" } });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}
