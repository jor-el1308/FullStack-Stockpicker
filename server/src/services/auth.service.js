import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt, randomUUID } from "node:crypto";
import { pool } from "../config/db.js";
import { getJwtSecret } from "../config/jwt.js";
import * as subscriptionService from "./subscription.service.js";

/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 *
 * Password hashing (bcryptjs), JWT issuance (jsonwebtoken), and CRUD against
 * the `users` / `saved_criteria_set` / `saved_criteria_item` tables.
 *
 * NOTE for Person 1 (added by Person 2 for subscription/paywall + admin
 * dashboard - please review): findUserByEmail/findUserById now also select
 * is_active/activated_at/is_admin so the frontend/controller can tell
 * whether a user still needs to subscribe, and whether they should see the
 * Admin nav link. New users default to is_active = 0 and
 * is_admin = 0 at the DB level (see schema.sql) - createUser() doesn't need
 * to set either.
 *
 * NOTE for Person 1 (added by Person 2 for login 2FA - please review): login
 * is now two steps. issueToken()/verifyPassword() are unchanged, but
 * auth.controller.js's login() no longer calls issueToken() directly on a
 * password match - it emails a one-time code (createLoginOtp() below) and
 * hands back a short-lived issuePreAuthToken() instead. The real session
 * token only gets issued from the new POST /auth/verify-otp once
 * verifyLoginOtp() confirms the code. See server/src/db/schema.sql's new
 * `login_otp` table.
 */

const SALT_ROUNDS = 10;
const OTP_EXPIRY_MINUTES = 10;

/**
 * @param {string} password
 */
export function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * @param {string} password
 * @param {string} hash
 */
export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * @param {{ id: string }} user
 */
export function issueToken(user) {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
  return jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn });
}

/**
 * Login 2FA (Person 1's auth flow, added by Person 2). Short-lived token
 * binding a login-OTP session to a specific user, handed to the client
 * after step 1 (email+password) and required - alongside the emailed code -
 * to complete step 2 (POST /auth/verify-otp). Deliberately a different
 * shape than issueToken()'s real session JWT: requireAuth only accepts
 * tokens without a `purpose` claim, so this one can't be used to call any
 * authenticated route - it only proves "step 1 already passed" for this
 * specific login attempt.
 * @param {{ id: string }} user
 */
export function issuePreAuthToken(user) {
  return jwt.sign({ userId: user.id, purpose: "login-otp" }, getJwtSecret(), {
    expiresIn: `${OTP_EXPIRY_MINUTES}m`,
  });
}

/**
 * @param {string} token
 * @returns {string} userId
 */
export function verifyPreAuthToken(token) {
  const payload = jwt.verify(token, getJwtSecret());
  if (payload.purpose !== "login-otp") {
    throw new Error("Invalid verification token");
  }
  return payload.userId;
}

/**
 * Generates a 6-digit one-time code, stores only its bcrypt hash (never the
 * raw code) with a 10-minute expiry, and invalidates any still-unused codes
 * for this user first so only the most recently sent code can ever be
 * accepted.
 * @param {string} userId
 * @returns {Promise<string>} the raw 6-digit code, to be emailed immediately - never persisted in plaintext
 */
export async function createLoginOtp(userId) {
  const code = String(randomInt(100000, 1000000));
  const codeHash = await bcrypt.hash(code, SALT_ROUNDS);

  await pool.query(`DELETE FROM login_otp WHERE user_id = ? AND consumed_at IS NULL`, [userId]);
  await pool.query(
    `INSERT INTO login_otp (id, user_id, code_hash, expires_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [randomUUID(), userId, codeHash, OTP_EXPIRY_MINUTES]
  );

  return code;
}

/**
 * Checks a submitted code against the most recent unconsumed, unexpired
 * code for this user, and marks it consumed on a match so it can't be
 * replayed.
 * @param {string} userId
 * @param {string} code
 * @returns {Promise<boolean>}
 */
export async function verifyLoginOtp(userId, code) {
  const [rows] = await pool.query(
    `SELECT id, code_hash AS codeHash FROM login_otp
     WHERE user_id = ? AND consumed_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const otp = rows[0];
  if (!otp) return false;

  const matches = await bcrypt.compare(code, otp.codeHash);
  if (!matches) return false;

  await pool.query(`UPDATE login_otp SET consumed_at = NOW() WHERE id = ?`, [otp.id]);
  return true;
}

/**
 * @param {string} email
 */
export async function findUserByEmail(email) {
  const [rows] = await pool.query(
    `SELECT id, email, password_hash AS passwordHash, name, avatar, created_at AS createdAt,
            is_active AS isActive, activated_at AS activatedAt, is_admin AS isAdmin
     FROM users WHERE email = ? LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
}

/**
 * @param {string} id
 */
export async function findUserById(id) {
  const [rows] = await pool.query(
    `SELECT id, email, name, avatar, created_at AS createdAt, is_active AS isActive,
            activated_at AS activatedAt, is_admin AS isAdmin
     FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * @param {{ email: string, password: string, name: string }} input
 */
export async function createUser({ email, password, name }) {
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  // is_active and is_admin both default to 0 at the DB level (see
  // schema.sql) - new accounts start inactive and non-admin until they pay
  // via POST /api/subscription/pay, or an admin grants access/promotes them.
  await pool.query(`INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)`, [
    id,
    email,
    passwordHash,
    name,
  ]);
  return findUserById(id);
}

/**
 * @param {string} googleId
 */
export async function findUserByGoogleId(googleId) {
  const [rows] = await pool.query(
    `SELECT id, email, name, avatar, created_at AS createdAt, is_active AS isActive,
            activated_at AS activatedAt, is_admin AS isAdmin
     FROM users WHERE google_id = ? LIMIT 1`,
    [googleId]
  );
  return rows[0] ?? null;
}

/**
 * Finds or creates a user for "Sign in with Google" (see auth.controller.js's
 * googleOAuthCallback()). Tries, in order:
 *   1. An account already linked to this Google id (repeat sign-in).
 *   2. An existing password account with the same email - linked onto in
 *      place rather than creating a duplicate account, which is safe
 *      because Google has already verified the caller controls that email
 *      (see googleOAuthCallback()'s use of `email_verified`).
 *   3. Otherwise, a brand-new account with no password
 *      (password_hash NULL - see migration 014) since Google is the only
 *      way in for it.
 * @param {{ googleId: string, email: string, name: string, avatar?: string | null }} profile
 */
export async function findOrCreateGoogleUser({ googleId, email, name, avatar }) {
  const byGoogleId = await findUserByGoogleId(googleId);
  if (byGoogleId) return byGoogleId;

  const existing = await findUserByEmail(email);
  if (existing) {
    await pool.query(`UPDATE users SET google_id = ? WHERE id = ?`, [googleId, existing.id]);
    return findUserById(existing.id);
  }

  const id = randomUUID();
  // is_active/is_admin default to 0 at the DB level, same as createUser() -
  // a Google-created account still has to subscribe like any other.
  await pool.query(`INSERT INTO users (id, email, google_id, name, avatar) VALUES (?, ?, ?, ?, ?)`, [
    id,
    email,
    googleId,
    name,
    avatar ?? null,
  ]);
  return findUserById(id);
}

/**
 * Fetches just the id + password hash for a user, for re-authenticating a
 * sensitive action (account deletion). Kept separate from findUserById(),
 * which deliberately never selects password_hash.
 * @param {string} id
 */
export async function findAuthById(id) {
  const [rows] = await pool.query(
    `SELECT id, password_hash AS passwordHash FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Sets a new password for a user (already-authenticated - the caller is
 * responsible for verifying the current password first, same split as
 * deleteAccount's password re-confirmation in the controller).
 * @param {string} userId
 * @param {string} newPassword plaintext - hashed here before storage
 */
export async function updatePassword(userId, newPassword) {
  const passwordHash = await hashPassword(newPassword);
  await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, userId]);
}

/**
 * Emails a 6-digit code to a *pending* new address to prove the user
 * controls it before it becomes their login email. Same hashed-storage +
 * single-live-code pattern as createLoginOtp(), in a separate table that
 * also remembers which new_email the code was issued for, so verification
 * can only ever apply the exact address the code was sent to.
 * @param {string} userId
 * @param {string} newEmail
 * @returns {Promise<string>} the raw 6-digit code, to be emailed immediately - never persisted in plaintext
 */
export async function createEmailChangeOtp(userId, newEmail) {
  const code = String(randomInt(100000, 1000000));
  const codeHash = await bcrypt.hash(code, SALT_ROUNDS);

  await pool.query(`DELETE FROM email_change_otp WHERE user_id = ? AND consumed_at IS NULL`, [userId]);
  await pool.query(
    `INSERT INTO email_change_otp (id, user_id, new_email, code_hash, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [randomUUID(), userId, newEmail, codeHash, OTP_EXPIRY_MINUTES]
  );

  return code;
}

/**
 * Confirms an email-change code against the most recent unconsumed,
 * unexpired code for this user AND that exact pending address, and marks it
 * consumed on a match so it can't be replayed. The address is matched too
 * (not just the code) so a code issued for one address can never be used to
 * confirm a different one.
 * @param {string} userId
 * @param {string} newEmail
 * @param {string} code
 * @returns {Promise<boolean>}
 */
export async function verifyEmailChangeOtp(userId, newEmail, code) {
  const [rows] = await pool.query(
    `SELECT id, code_hash AS codeHash FROM email_change_otp
     WHERE user_id = ? AND new_email = ? AND consumed_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId, newEmail]
  );
  const otp = rows[0];
  if (!otp) return false;

  const matches = await bcrypt.compare(code, otp.codeHash);
  if (!matches) return false;

  await pool.query(`UPDATE email_change_otp SET consumed_at = NOW() WHERE id = ?`, [otp.id]);
  return true;
}

/**
 * Updates the logged-in user's own profile (display name and/or login
 * email). Only the fields present in `patch` are written, so the caller can
 * send just a name change without touching the email. Email uniqueness is
 * enforced by the DB's UNIQUE constraint - the controller turns the
 * resulting ER_DUP_ENTRY into a friendly 409, same as signup(). Note the
 * email path here is internal-only: it runs *after* verifyEmailChangeOtp()
 * has proven ownership of the new address (see auth.controller.js).
 *
 * `avatar` may be a data-URL string (set/replace the photo) or null (remove
 * it and fall back to initials in the UI). It's the one field where an
 * explicit null is meaningful, hence the `in` check rather than `!== undefined`.
 * @param {string} userId
 * @param {{ name?: string, email?: string, avatar?: string | null }} patch
 * @returns {Promise<object|null>} the refreshed public user
 */
export async function updateProfile(userId, patch) {
  const fields = [];
  const values = [];
  if (patch.name !== undefined) {
    fields.push("name = ?");
    values.push(patch.name);
  }
  if (patch.email !== undefined) {
    fields.push("email = ?");
    values.push(patch.email);
  }
  if ("avatar" in patch) {
    fields.push("avatar = ?");
    values.push(patch.avatar ?? null);
  }
  if (fields.length > 0) {
    values.push(userId);
    await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
  }
  return findUserById(userId);
}

/**
 * Permanently deletes a user's own account. Cancels their live Stripe
 * subscription first (best-effort - immediate, not at period end, since the
 * account is going away) so a now-deleted user is never billed again, then
 * deletes the `users` row.
 *
 * Everything owned by the user cascades away via ON DELETE CASCADE
 * (login_otp, saved_criteria_set -> _item, watchlist -> alert_log). The one
 * exception is `payment`, whose FK is ON DELETE SET NULL - those rows are
 * kept (detached/anonymized) so collected revenue stays on the books. See
 * schema.sql / migration 007.
 *
 * A failed Stripe cancellation never blocks the deletion (the row is removed
 * regardless), but is logged so it can be followed up in the Stripe
 * Dashboard - an orphaned live subscription would otherwise keep charging a
 * card for an account that no longer exists.
 *
 * @param {string} userId
 * @returns {Promise<boolean>} true if an account row was actually deleted
 */
export async function deleteAccount(userId) {
  try {
    await subscriptionService.cancelSubscriptionForUser(userId);
  } catch (err) {
    console.error(`[auth] deleteAccount: failed to cancel Stripe subscription for user ${userId}:`, err.message);
  }
  const [result] = await pool.query(`DELETE FROM users WHERE id = ?`, [userId]);
  return result.affectedRows > 0;
}

/**
 * @param {string} userId
 */
export async function listCriteriaSets(userId) {
  const [sets] = await pool.query(
    `SELECT id, name, created_at AS createdAt FROM saved_criteria_set WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  if (sets.length === 0) return [];

  const [items] = await pool.query(
    `SELECT criteria_set_id AS criteriaSetId, criteria_key AS \`key\`, min_value AS \`min\`,
            max_value AS \`max\`, weight_value AS weight
     FROM saved_criteria_item WHERE criteria_set_id IN (?)`,
    [sets.map((set) => set.id)]
  );

  return sets.map((set) => ({
    ...set,
    criteria: items
      .filter((item) => item.criteriaSetId === set.id)
      .map(({ criteriaSetId, ...range }) => range),
  }));
}

/**
 * Delete a saved criteria set (and its items, via ON DELETE CASCADE).
 * Scoped to the owning user so one user can't delete another's screens.
 * @param {string} userId
 * @param {string} setId
 * @returns {Promise<boolean>} true if a row was deleted
 */
export async function deleteCriteriaSet(userId, setId) {
  const [result] = await pool.query(
    `DELETE FROM saved_criteria_set WHERE id = ? AND user_id = ?`,
    [setId, userId]
  );
  return result.affectedRows > 0;
}

/**
 * @param {string} userId
 * @param {{ name: string, criteria: Array<{ key: string, min?: number, max?: number, weight?: number }> }} input
 */
export async function saveCriteriaSet(userId, { name, criteria }) {
  const setId = randomUUID();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`INSERT INTO saved_criteria_set (id, user_id, name) VALUES (?, ?, ?)`, [
      setId,
      userId,
      name,
    ]);
    for (const item of criteria) {
      await conn.query(
        `INSERT INTO saved_criteria_item (id, criteria_set_id, criteria_key, min_value, max_value, weight_value)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), setId, item.key, item.min ?? null, item.max ?? null, item.weight ?? null]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return { id: setId, userId, name, criteria, createdAt: new Date().toISOString() };
}
