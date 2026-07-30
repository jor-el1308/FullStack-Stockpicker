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
 * Compact "ticker tape" feed for the top-bar marquee (client/src/components/
 * TickerTape.jsx): the largest stocks by latest market cap, each with its
 * latest close, the day-over-day change, and a short run of recent closes to
 * draw a sparkline from. One roundtrip's worth of data for the whole strip,
 * cached like everything else here (only changes when ingestion re-runs).
 *
 * @param {{ limit?: number, points?: number }} [opts]
 *   limit  - how many stocks to include in the strip
 *   points - how many recent daily closes to return per stock (sparkline length)
 */
export async function getTickerTape({ limit = 24, points = 24 } = {}) {
  return cached(`stocks:ticker:${limit}:${points}`, TTL_MS, async () => {
    // 1. Pick the stocks to show: biggest by latest market cap first, but only
    //    ones that actually have price history to chart. Stocks with no market
    //    cap on file still qualify - they just sort to the end.
    const [stocks] = await pool.query(
      `SELECT s.exchange_code AS exchangeCode, s.stock_code AS stockCode,
              s.stock_name AS stockName, e.currency AS currency,
              latest_mcap.market_cap AS marketCap
       FROM stock s
       JOIN exchange e ON e.exchange_code = s.exchange_code
       JOIN (SELECT exchange_code, stock_code
             FROM daily_price
             GROUP BY exchange_code, stock_code) has_prices
         ON has_prices.exchange_code = s.exchange_code
        AND has_prices.stock_code = s.stock_code
       LEFT JOIN (
         SELECT mc.exchange_code, mc.stock_code, mc.market_cap
         FROM market_cap mc
         JOIN (SELECT exchange_code, stock_code, MAX(as_of_date) AS as_of_date
               FROM market_cap
               GROUP BY exchange_code, stock_code) m
           ON m.exchange_code = mc.exchange_code
          AND m.stock_code = mc.stock_code
          AND m.as_of_date = mc.as_of_date
       ) latest_mcap
         ON latest_mcap.exchange_code = s.exchange_code
        AND latest_mcap.stock_code = s.stock_code
       WHERE s.is_active = 1
       ORDER BY latest_mcap.market_cap IS NULL, latest_mcap.market_cap DESC, s.stock_name
       LIMIT ?`,
      [limit]
    );

    if (stocks.length === 0) return [];

    // 2. Grab the last `points` closes for exactly those stocks in a single
    //    query (window function, MySQL 8+), returned oldest-first so the
    //    sparkline reads left-to-right.
    const pairs = stocks.map((s) => [s.exchangeCode, s.stockCode]);
    const [priceRows] = await pool.query(
      `SELECT exchangeCode, stockCode, close
       FROM (
         SELECT exchange_code AS exchangeCode, stock_code AS stockCode, close, price_date,
                ROW_NUMBER() OVER (PARTITION BY exchange_code, stock_code
                                   ORDER BY price_date DESC) AS rn
         FROM daily_price
         WHERE (exchange_code, stock_code) IN (?)
       ) recent
       WHERE rn <= ?
       ORDER BY exchangeCode, stockCode, price_date ASC`,
      [pairs, points]
    );

    const closesByStock = new Map();
    for (const row of priceRows) {
      const key = `${row.exchangeCode}:${row.stockCode}`;
      if (!closesByStock.has(key)) closesByStock.set(key, []);
      closesByStock.get(key).push(Number(row.close));
    }

    return stocks.map((s) => {
      const spark = closesByStock.get(`${s.exchangeCode}:${s.stockCode}`) ?? [];
      const price = spark.length ? spark[spark.length - 1] : null;
      const prevClose = spark.length > 1 ? spark[spark.length - 2] : null;
      const change = price != null && prevClose != null ? price - prevClose : 0;
      const changePct = prevClose ? (change / prevClose) * 100 : 0;
      return {
        exchangeCode: s.exchangeCode,
        stockCode: s.stockCode,
        stockName: s.stockName,
        currency: s.currency,
        price,
        change,
        changePct,
        spark,
      };
    });
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
