import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt, randomUUID } from "node:crypto";
import { pool } from "../config/db.js";
import { getJwtSecret } from "../config/jwt.js";

/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 *
 * Password hashing (bcryptjs), JWT issuance (jsonwebtoken), and CRUD against
 * the `users` / `saved_criteria_set` / `saved_criteria_item` tables.
 *
 * NOTE for Person 1 (added by Person 2 for subscription/paywall + admin
 * dashboard - please review): findUserByEmail/findUserById now also select
 * is_active/activated_at/is_admin so the frontend/controller can tell
 * whether a user still needs to pay the activation fee, and whether they
 * should see the Admin nav link. New users default to is_active = 0 and
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
    `SELECT id, email, password_hash AS passwordHash, name, created_at AS createdAt,
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
    `SELECT id, email, name, created_at AS createdAt, is_active AS isActive,
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
