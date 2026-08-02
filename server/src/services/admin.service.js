import { randomUUID } from "node:crypto";
import { pool } from "../config/db.js";
import { cacheClear, cacheSize } from "../utils/cache.js";
import * as subscriptionService from "./subscription.service.js";
import * as authService from "./auth.service.js";

/**
 * Owner: Person 2 (Charles) - Admin Dashboard.
 *
 * User management for admins: list every user, revoke/restore their access
 * (flips `is_active`, same flag the paywall checks), hard-delete an account
 * (deleteUser() - irreversible, unlike revoke), toggle admin status on other
 * accounts, and a quick stats summary. Deleting keeps the user's payment
 * rows (anonymized, FK ON DELETE SET NULL) so revenue stats stay intact -
 * everything else they own cascades away.
 */

/**
 * All users with their activation/admin status and a payment count, most
 * recently created first.
 */
export async function listUsers() {
  const [rows] = await pool.query(
    `SELECT
       u.id, u.email, u.name, u.avatar, u.is_active AS isActive, u.activated_at AS activatedAt,
       u.is_admin AS isAdmin, u.created_at AS createdAt,
       COUNT(p.id) AS paymentCount
     FROM users u
     LEFT JOIN payment p ON p.user_id = u.id
     GROUP BY u.id, u.email, u.name, u.is_active, u.activated_at, u.is_admin, u.created_at
     ORDER BY u.created_at DESC`
  );
  return rows.map((row) => ({ ...row, isActive: Boolean(row.isActive), isAdmin: Boolean(row.isAdmin) }));
}

/**
 * Admin-side account creation (the "Create" of the admin CRUD). Mirrors
 * authService.createUser() - same UUID id + bcrypt hash (reused, so an
 * admin-made account logs in identically to a self-signed-up one) - but adds
 * two things a public signup can't set: is_active and is_admin. That lets an
 * admin provision an already-active account (skipping the paywall) or another
 * admin directly, instead of creating it and then flipping the flags in two
 * more clicks.
 *
 * activated_at is stamped only when isActive is true, matching restoreUser()'s
 * convention so an admin-granted account doesn't look never-activated.
 *
 * The email UNIQUE constraint surfaces as ER_DUP_ENTRY, which the controller
 * turns into a friendly 409 (same as signup()). Returns the created user
 * shaped like a listUsers() row (with avatar/paymentCount) so the dashboard
 * can prepend it to the table without a refetch.
 *
 * @param {{ email: string, password: string, name: string, isActive?: boolean, isAdmin?: boolean }} input
 */
export async function createUser({ email, password, name, isActive = false, isAdmin = false }) {
  const id = randomUUID();
  const passwordHash = await authService.hashPassword(password);
  await pool.query(
    `INSERT INTO users (id, email, password_hash, name, is_active, is_admin, activated_at)
     VALUES (?, ?, ?, ?, ?, ?, ${isActive ? "NOW()" : "NULL"})`,
    [id, email, passwordHash, name, isActive ? 1 : 0, isAdmin ? 1 : 0]
  );
  const user = await getUser(id);
  // A brand-new account has no photo and no payments yet - fill these so the
  // returned row matches listUsers()' shape (getUser() selects neither).
  return { ...user, avatar: null, paymentCount: 0 };
}

/**
 * @param {string} userId
 */
export async function getUser(userId) {
  const [rows] = await pool.query(
    `SELECT id, email, name, is_active AS isActive, activated_at AS activatedAt,
            is_admin AS isAdmin, created_at AS createdAt
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;
  return { ...user, isActive: Boolean(user.isActive), isAdmin: Boolean(user.isAdmin) };
}

/**
 * Revokes a user's access: cancels their actual Stripe subscription (so it
 * doesn't renew and silently undo this) and sets is_active = 0, without
 * touching activated_at so restoring later doesn't look like a brand-new
 * activation.
 *
 * The Stripe cancellation is attempted but not required for the revoke to
 * take effect - is_active is always flipped off regardless, since that's
 * the flag the paywall actually checks and it must never stay stuck open
 * because Stripe was briefly unreachable or misconfigured. If cancellation
 * fails (or the user never subscribed - nothing to cancel), the returned
 * user carries a `stripeCancelError` so the admin UI can surface it; the
 * caller should follow up in the Stripe Dashboard directly in that case.
 *
 * @param {string} userId
 */
export async function revokeUser(userId) {
  let stripeCancelError;
  try {
    await subscriptionService.cancelSubscriptionForUser(userId);
  } catch (err) {
    console.error(`[admin] revokeUser: failed to cancel Stripe subscription for user ${userId}:`, err.message);
    stripeCancelError = err.message;
  }

  await pool.query("UPDATE users SET is_active = 0 WHERE id = ?", [userId]);
  const user = await getUser(userId);
  return stripeCancelError ? { ...user, stripeCancelError } : user;
}

/**
 * Permanently deletes a user account (admin hard-delete, the irreversible
 * counterpart to revokeUser() above). Cancels their live Stripe subscription
 * first - best-effort, immediately, so a deleted user is never billed again -
 * then deletes the `users` row.
 *
 * The user's own data cascades away (login_otp, saved_criteria_set -> _item,
 * watchlist -> alert_log), but their `payment` rows are kept and anonymized
 * (FK ON DELETE SET NULL) so collected revenue stays in the admin stats. See
 * schema.sql / migration 007.
 *
 * Returns { deleted } (false if no such user), plus a `stripeCancelError`
 * when the Stripe cancellation failed - same contract as revokeUser(), so
 * the admin UI can warn that an orphaned live subscription may still need
 * canceling in the Stripe Dashboard. The row is deleted regardless.
 *
 * @param {string} userId
 */
export async function deleteUser(userId) {
  let stripeCancelError;
  try {
    await subscriptionService.cancelSubscriptionForUser(userId);
  } catch (err) {
    console.error(`[admin] deleteUser: failed to cancel Stripe subscription for user ${userId}:`, err.message);
    stripeCancelError = err.message;
  }

  const [result] = await pool.query("DELETE FROM users WHERE id = ?", [userId]);
  const deleted = result.affectedRows > 0;
  return stripeCancelError ? { deleted, stripeCancelError } : { deleted };
}

/**
 * Restores a revoked user's access without requiring them to pay again -
 * an admin override. Sets activated_at if it was never set (e.g. an admin
 * granting access to someone who never actually paid).
 *
 * @param {string} userId
 */
export async function restoreUser(userId) {
  await pool.query(
    "UPDATE users SET is_active = 1, activated_at = COALESCE(activated_at, NOW()) WHERE id = ?",
    [userId]
  );
  return getUser(userId);
}

/**
 * @param {string} userId
 * @param {boolean} isAdmin
 */
export async function setAdmin(userId, isAdmin) {
  await pool.query("UPDATE users SET is_admin = ? WHERE id = ?", [isAdmin ? 1 : 0, userId]);
  return getUser(userId);
}

/**
 * @param {string} userId
 */
export async function getUserPayments(userId) {
  const [rows] = await pool.query(
    `SELECT id, amount_cents AS amountCents, currency, status, payment_method AS paymentMethod, paid_at AS paidAt
     FROM payment WHERE user_id = ? ORDER BY paid_at DESC`,
    [userId]
  );
  return rows;
}

/**
 * Quick summary numbers for the dashboard header: user counts by status
 * and total revenue collected from succeeded payments (in cents - the
 * frontend formats currency, this stays currency-agnostic since payments
 * can be in different currencies; see note in the return value).
 */
export async function getStats() {
  const [[userCounts]] = await pool.query(
    `SELECT COUNT(*) AS totalUsers, COALESCE(SUM(is_active), 0) AS activeUsers
     FROM users`
  );
  const [[revenue]] = await pool.query(
    `SELECT COALESCE(SUM(amount_cents), 0) AS totalRevenueCents
     FROM payment WHERE status = 'succeeded'`
  );

  const totalUsers = Number(userCounts.totalUsers);
  const activeUsers = Number(userCounts.activeUsers);

  return {
    totalUsers,
    activeUsers,
    inactiveUsers: totalUsers - activeUsers,
    // Assumes a single currency in practice (SGD, from the Stripe test
    // subscription fee) - if the team ever supports multiple payment
    // currencies this would need to be broken out per-currency instead.
    totalRevenueCents: Number(revenue.totalRevenueCents),
  };
}

/**
 * Wipes the in-memory stock-data cache (see utils/cache.js) so the next
 * request re-reads MySQL instead of serving a stale cached value. Useful
 * right after re-running ingestion/ingest.py if you don't want to wait out
 * the cache's TTL or restart the server.
 */
export function clearCache() {
  const entriesCleared = cacheSize();
  cacheClear();
  return { entriesCleared };
}

/**
 * All users plus a per-user paid-total, for the "Export users CSV" button.
 * Same shape as listUsers() with one extra aggregate column - kept as a
 * separate query rather than reusing listUsers() so this can grow its own
 * export-specific columns later without affecting the dashboard table.
 */
export async function listUsersForExport() {
  const [rows] = await pool.query(
    `SELECT
       u.id, u.email, u.name, u.is_active AS isActive, u.activated_at AS activatedAt,
       u.is_admin AS isAdmin, u.created_at AS createdAt,
       COUNT(p.id) AS paymentCount,
       COALESCE(SUM(CASE WHEN p.status = 'succeeded' THEN p.amount_cents ELSE 0 END), 0) AS totalPaidCents
     FROM users u
     LEFT JOIN payment p ON p.user_id = u.id
     GROUP BY u.id, u.email, u.name, u.is_active, u.activated_at, u.is_admin, u.created_at
     ORDER BY u.created_at DESC`
  );
  return rows.map((row) => ({ ...row, isActive: Boolean(row.isActive), isAdmin: Boolean(row.isAdmin) }));
}

/**
 * Every payment across every user (not scoped to one user, unlike
 * getUserPayments() above), for the "Export payments CSV" button - includes
 * the owning user's email so the CSV is self-contained without a join
 * elsewhere. LEFT JOIN (not inner) so payments detached by an account
 * deletion (user_id NULL - see deleteUser()) still appear, with a
 * "(deleted account)" label instead of vanishing from the revenue export.
 */
export async function listAllPaymentsForExport() {
  const [rows] = await pool.query(
    `SELECT
       p.id,
       COALESCE(u.email, '(deleted account)') AS userEmail,
       COALESCE(u.name, '(deleted account)') AS userName,
       p.amount_cents AS amountCents, p.currency, p.status,
       p.payment_method AS paymentMethod, p.paid_at AS paidAt
     FROM payment p
     LEFT JOIN users u ON u.id = p.user_id
     ORDER BY p.paid_at DESC`
  );
  return rows;
}
