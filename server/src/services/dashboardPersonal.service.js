/**
 * Owner: Person 4 (Enrico) — Dashboard & Stock Report.
 * Data access for the personal, user-owned features: stock notes, starred
 * stocks, and price targets. Every query is scoped by user_id so one user
 * can never read or change another user's rows. Mirrors the criteria-set
 * pattern in auth.service.js (pool.query + explicit UUIDs).
 */
import { randomUUID } from "crypto";
import { pool } from "../config/db.js";

/* ------------------------------ Stock notes ------------------------------ */

export async function listNotes(userId, exchangeCode, stockCode) {
  const [rows] = await pool.query(
    `SELECT id, exchange_code AS exchangeCode, stock_code AS stockCode, body,
            created_at AS createdAt, updated_at AS updatedAt
       FROM stock_note
      WHERE user_id = ? AND exchange_code = ? AND stock_code = ?
      ORDER BY created_at DESC`,
    [userId, exchangeCode, stockCode]
  );
  return rows;
}

export async function createNote(userId, exchangeCode, stockCode, body) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO stock_note (id, user_id, exchange_code, stock_code, body)
     VALUES (?, ?, ?, ?, ?)`,
    [id, userId, exchangeCode, stockCode, body]
  );
  const now = new Date().toISOString();
  return { id, exchangeCode, stockCode, body, createdAt: now, updatedAt: now };
}

export async function updateNote(userId, id, body) {
  const [result] = await pool.query(
    `UPDATE stock_note SET body = ? WHERE id = ? AND user_id = ?`,
    [body, id, userId]
  );
  return result.affectedRows > 0;
}

export async function deleteNote(userId, id) {
  const [result] = await pool.query(
    `DELETE FROM stock_note WHERE id = ? AND user_id = ?`,
    [id, userId]
  );
  return result.affectedRows > 0;
}

/* ----------------------------- Starred stocks ---------------------------- */

/**
 * Starred stocks are read from their own table, independent of any screener
 * filter — this is what keeps them pinned on the dashboard even when a stock
 * no longer matches the current criteria. Joined to `stock` for the display
 * name (LEFT JOIN so a missing stock row still returns the star).
 */
export async function listStarred(userId) {
  const [rows] = await pool.query(
    `SELECT ss.exchange_code AS exchangeCode, ss.stock_code AS stockCode,
            st.stock_name AS stockName, ss.created_at AS createdAt
       FROM starred_stock ss
       LEFT JOIN stock st
         ON st.exchange_code = ss.exchange_code AND st.stock_code = ss.stock_code
      WHERE ss.user_id = ?
      ORDER BY ss.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function addStar(userId, exchangeCode, stockCode) {
  // INSERT ... ON DUPLICATE makes re-starring a no-op instead of an error.
  await pool.query(
    `INSERT INTO starred_stock (id, user_id, exchange_code, stock_code)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE created_at = created_at`,
    [randomUUID(), userId, exchangeCode, stockCode]
  );
  return { exchangeCode, stockCode };
}

export async function removeStar(userId, exchangeCode, stockCode) {
  const [result] = await pool.query(
    `DELETE FROM starred_stock
      WHERE user_id = ? AND exchange_code = ? AND stock_code = ?`,
    [userId, exchangeCode, stockCode]
  );
  return result.affectedRows > 0;
}

/* ----------------------------- Price targets ----------------------------- */

export async function getTarget(userId, exchangeCode, stockCode) {
  const [rows] = await pool.query(
    `SELECT exchange_code AS exchangeCode, stock_code AS stockCode,
            target_price AS targetPrice, updated_at AS updatedAt
       FROM price_target
      WHERE user_id = ? AND exchange_code = ? AND stock_code = ?`,
    [userId, exchangeCode, stockCode]
  );
  return rows[0] ?? null;
}

/** Set or update the target (one per user per stock) — an upsert. */
export async function setTarget(userId, exchangeCode, stockCode, targetPrice) {
  await pool.query(
    `INSERT INTO price_target (id, user_id, exchange_code, stock_code, target_price)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE target_price = VALUES(target_price)`,
    [randomUUID(), userId, exchangeCode, stockCode, targetPrice]
  );
  return { exchangeCode, stockCode, targetPrice };
}

export async function deleteTarget(userId, exchangeCode, stockCode) {
  const [result] = await pool.query(
    `DELETE FROM price_target
      WHERE user_id = ? AND exchange_code = ? AND stock_code = ?`,
    [userId, exchangeCode, stockCode]
  );
  return result.affectedRows > 0;
}