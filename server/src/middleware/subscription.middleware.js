import { pool } from "../config/db.js";

/**
 * Owner: Person 2 (Charles) - Data Pipeline + Subscription/Paywall.
 *
 * Paywall gate: blocks any route it's applied to unless the logged-in
 * user has paid the one-time activation fee (`users.is_active = 1`).
 *
 * Must run AFTER requireAuth (see middleware/auth.middleware.js) since it
 * needs req.userId to already be set. Applied at the router level to
 * stocks/screener/dashboard/notifications - i.e. everything past login,
 * per the "paywall blocks everything until paid" decision. Auth routes,
 * subscription routes, and admin routes are deliberately NOT gated by
 * this, since a user has to be able to log in and pay before becoming
 * active, and an admin managing the system shouldn't be locked out by
 * their own paywall status.
 *
 * @param {import("express").Request & { userId?: string }} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
export async function requireActiveAccount(req, res, next) {
  if (!req.userId) {
    // Should never happen if requireAuth ran first, but fail closed just in case.
    return res.status(401).json({ success: false, error: { message: "Missing auth token" } });
  }

  try {
    const [rows] = await pool.query("SELECT is_active AS isActive FROM users WHERE id = ? LIMIT 1", [req.userId]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ success: false, error: { message: "User not found" } });
    }
    if (!user.isActive) {
      return res.status(402).json({
        success: false,
        error: { message: "Account not activated - pay the one-time activation fee to continue.", code: "ACCOUNT_INACTIVE" },
      });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}
