import { pool } from "../config/db.js";
import { cached } from "../utils/cache.js";

/**
 * Owner: Person 2 (Charles) - Data Collection & Database Design.
 *
 * Read queries against the schema in server/src/db/schema.sql. These are
 * working examples (not stubs) so Persons 3 and 4 have real endpoints to
 * build against once the DB is migrated and seeded.
 *
 * Caching: this data only changes when ingestion/ingest.py runs (a batch
 * job, not per-request), so every read here goes through utils/cache.js's
 * get-or-compute wrapper instead of hitting MySQL every time - see that
 * file's docstring for the tradeoffs (mainly: it doesn't know when
 * ingestion just ran, entries just expire after TTL_MS).
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes - short enough that a re-ingest shows up reasonably soon on its own

/**
 * @param {string} query
 */
export async function searchStocks(query) {
  return cached(`stocks:search:${query}`, TTL_MS, async () => {
    const like = `%${query}%`;
    const [rows] = await pool.query(
      `SELECT exchange_code AS exchangeCode, stock_code AS stockCode, stock_name AS stockName
       FROM stock
       WHERE stock_code LIKE ? OR stock_name LIKE ?
       ORDER BY stock_name
       LIMIT 50`,
      [like, like]
    );
    return rows;
  });
}

/**
 * @param {string} exchangeCode
 * @param {string} stockCode
 */
export async function getStockDetail(exchangeCode, stockCode) {
  return cached(`stocks:detail:${exchangeCode}:${stockCode}`, TTL_MS, async () => {
    const [rows] = await pool.query(
      `SELECT exchange_code AS exchangeCode, stock_code AS stockCode, stock_name AS stockName,
              sector, listed_date AS listedDate, is_active AS isActive
       FROM stock
       WHERE exchange_code = ? AND stock_code = ?
       LIMIT 1`,
      [exchangeCode, stockCode]
    );
    return rows[0] ?? null;
  });
}

/**
 * @param {string} exchangeCode
 * @param {string} stockCode
 * @param {number} [limit]
 */
export async function getDailyPrices(exchangeCode, stockCode, limit = 260) {
  return cached(`stocks:prices:${exchangeCode}:${stockCode}:${limit}`, TTL_MS, async () => {
    const [rows] = await pool.query(
      `SELECT price_date AS date, open, high, low, close, volume
       FROM daily_price
       WHERE exchange_code = ? AND stock_code = ?
       ORDER BY price_date DESC
       LIMIT ?`,
      [exchangeCode, stockCode, limit]
    );
    return rows;
  });
}

/**
 * @param {string} exchangeCode
 * @param {string} stockCode
 */
export async function getFinancials(exchangeCode, stockCode) {
  return cached(`stocks:financials:${exchangeCode}:${stockCode}`, TTL_MS, async () => {
    const [rows] = await pool.query(
      `SELECT year, revenue, profit_before_tax AS profitBeforeTax,
              profit_after_tax AS profitAfterTax, ebita
       FROM financials
       WHERE exchange_code = ? AND stock_code = ?
       ORDER BY year DESC`,
      [exchangeCode, stockCode]
    );
    return rows;
  });
}
