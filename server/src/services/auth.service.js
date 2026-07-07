import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { pool } from "../config/db.js";

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
 */

const SALT_ROUNDS = 10;

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
  const secret = process.env.JWT_SECRET ?? "dev-secret";
  const expiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
  return jwt.sign({ userId: user.id }, secret, { expiresIn });
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
    `SELECT criteria_set_id AS criteriaSetId, criteria_key AS \`key\`, min_value AS \`min\`, max_value AS \`max\`
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
 * @param {string} userId
 * @param {{ name: string, criteria: Array<{ key: string, min?: number, max?: number }> }} input
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
        `INSERT INTO saved_criteria_item (id, criteria_set_id, criteria_key, min_value, max_value)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), setId, item.key, item.min ?? null, item.max ?? null]
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
