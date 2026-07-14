import { pool } from "../config/db.js";
import { cacheClear, cacheSize } from "../utils/cache.js";

/**
 * Owner: Person 2 (Charles) - Admin Dashboard.
 *
 * User management for admins: list every user, revoke/restore their access
 * (flips `is_active`, same flag the paywall checks), toggle admin status on
 * other accounts, and a quick stats summary. No hard-delete here on
 * purpose - revoking access is reversible, deleting a user's data isn't,
 * and this stays a safer default for a prototype. (Easy to add a real
 * DELETE later if the team wants it - see server/src/routes/admin.routes.js.)
 */

/**
 * All users with their activation/admin status and a payment count, most
 * recently created first.
 */
export async function listUsers() {
  const [rows] = await pool.query(
    `SELECT
       u.id, u.email, u.name, u.is_active AS isActive, u.activated_at AS activatedAt,
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
 * Revokes a user's access (sets is_active = 0) without touching activated_at,
 * so restoring later doesn't look like a brand-new activation.
 *
 * @param {string} userId
 */
export async function revokeUser(userId) {
  await pool.query("UPDATE users SET is_active = 0 WHERE id = ?", [userId]);
  return getUser(userId);
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
    // Assumes a single currency in practice (USD, from the Stripe test
    // activation fee) - if the team ever supports multiple payment
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
 * elsewhere.
 */
export async function listAllPaymentsForExport() {
  const [rows] = await pool.query(
    `SELECT
       p.id, u.email AS userEmail, u.name AS userName,
       p.amount_cents AS amountCents, p.currency, p.status,
       p.payment_method AS paymentMethod, p.paid_at AS paidAt
     FROM payment p
     JOIN users u ON u.id = p.user_id
     ORDER BY p.paid_at DESC`
  );
  return rows;
}
