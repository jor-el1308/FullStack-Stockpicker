/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine.
 *
 * Implements the range-based screener described in the requirement doc:
 *  - buildScreenerQuery()   -> parameterized SQL joining stock + latest
 *                              market_cap / financials / dividend.
 *  - applyDefaultExclusions -> company age < 5y, gambling/tobacco sectors.
 *  - applyCriteriaWeighting -> optional per-criterion weight; scores + ranks
 *                              results instead of only filtering.
 *
 * Request/response shapes: shared/types/index.js (ScreenerRequest / ScreenerResponse).
 * Depends on the schema owned by Person 2 (server/src/db/schema.sql).
 */
import { pool } from "../config/db.js";

/** All criteria the engine understands, with UI-friendly defaults. */
export const CRITERIA_DEFS = [
  { key: "marketCap", label: "Market Cap" },
  { key: "peRatio", label: "P/E Ratio" },
  { key: "dividendCents", label: "Dividend (cents)" },
  { key: "revenue", label: "Revenue" },
  { key: "profitBeforeTax", label: "Profit Before Tax" },
  { key: "profitAfterTax", label: "Profit After Tax" },
  { key: "ebita", label: "EBITA" },
  { key: "companyAgeYears", label: "Company Age (yrs)" },
];

// Higher-is-better vs lower-is-better, used only for weighting/scoring.
const DIRECTION = {
  marketCap: "higher",
  peRatio: "lower",
  dividendCents: "higher",
  revenue: "higher",
  profitBeforeTax: "higher",
  profitAfterTax: "higher",
  ebita: "higher",
  companyAgeYears: "higher",
};

// Each criterion -> the SQL expression that produces its per-stock value.
const COLUMN_EXPR = {
  marketCap: "mc.market_cap",
  dividendCents: "dv.dividend_cents",
  revenue: "fin.revenue",
  profitBeforeTax: "fin.profit_before_tax",
  profitAfterTax: "fin.profit_after_tax",
  ebita: "fin.ebita",
  peRatio: "(mc.market_cap / NULLIF(fin.profit_after_tax, 0))",
  companyAgeYears: "TIMESTAMPDIFF(YEAR, s.listed_date, CURDATE())",
};

const DEFAULT_EXCLUDED_SECTORS = ["Gambling", "Tobacco"];

/**
 * Build the parameterized SELECT and its bound params from a ScreenerRequest.
 * @param {import("../../../shared/types/index.js").ScreenerRequest & { criteria?: any[] }} request
 */
export function buildScreenerQuery(request = {}) {
  const criteria = Array.isArray(request.criteria) ? request.criteria : [];
  const params = [];

  // Latest-value subqueries so "current" == max(date/year).
  const base = `
    SELECT s.exchange_code AS exchangeCode,
           s.stock_code    AS stockCode,
           s.stock_name    AS stockName,
           s.sector        AS sector,
           mc.market_cap                         AS marketCap,
           dv.dividend_cents                     AS dividendCents,
           fin.revenue                           AS revenue,
           fin.profit_before_tax                 AS profitBeforeTax,
           fin.profit_after_tax                  AS profitAfterTax,
           fin.ebita                             AS ebita,
           (mc.market_cap / NULLIF(fin.profit_after_tax, 0)) AS peRatio,
           TIMESTAMPDIFF(YEAR, s.listed_date, CURDATE())     AS companyAgeYears
    FROM stock s
    LEFT JOIN market_cap mc
      ON mc.exchange_code = s.exchange_code AND mc.stock_code = s.stock_code
     AND mc.as_of_date = (SELECT MAX(as_of_date) FROM market_cap m2
                          WHERE m2.exchange_code = s.exchange_code AND m2.stock_code = s.stock_code)
    LEFT JOIN financials fin
      ON fin.exchange_code = s.exchange_code AND fin.stock_code = s.stock_code
     AND fin.year = (SELECT MAX(year) FROM financials f2
                     WHERE f2.exchange_code = s.exchange_code AND f2.stock_code = s.stock_code)
    LEFT JOIN dividend dv
      ON dv.exchange_code = s.exchange_code AND dv.stock_code = s.stock_code
     AND dv.year = (SELECT MAX(year) FROM dividend d2
                    WHERE d2.exchange_code = s.exchange_code AND d2.stock_code = s.stock_code)
  `;

  const where = ["s.is_active = 1"];

  // Range filters (min/max) per criterion.
  for (const c of criteria) {
    const expr = COLUMN_EXPR[c.key];
    if (!expr) continue;
    if (c.min != null && c.min !== "") {
      where.push(`${expr} >= ?`);
      params.push(Number(c.min));
    }
    if (c.max != null && c.max !== "") {
      where.push(`${expr} <= ?`);
      params.push(Number(c.max));
    }
  }

  // ---- default exclusions ----
  // Company-age exclusion (< N years; defaults to 5).
  const minAge = request.minCompanyAgeYears != null ? Number(request.minCompanyAgeYears) : 5;
  where.push(`TIMESTAMPDIFF(YEAR, s.listed_date, CURDATE()) >= ?`);
  params.push(minAge);

  // Sector exclusions (gambling/tobacco by default).
  const excluded = request.excludeSectors?.length ? request.excludeSectors : DEFAULT_EXCLUDED_SECTORS;
  if (excluded.length) {
    where.push(`(s.sector IS NULL OR s.sector NOT IN (${excluded.map(() => "?").join(",")}))`);
    params.push(...excluded);
  }

  // Optional exchange filter.
  if (request.exchanges?.length) {
    where.push(`s.exchange_code IN (${request.exchanges.map(() => "?").join(",")})`);
    params.push(...request.exchanges);
  }

  const sql = `${base}\n    WHERE ${where.join("\n      AND ")}\n    ORDER BY mc.market_cap DESC\n    LIMIT 500`;
  return { sql, params };
}

/**
 * Optional weighting: normalize each requested criterion across the result set
 * and rank by the weighted, direction-aware composite score (0..100).
 */
export function applyCriteriaWeighting(rows, criteria) {
  const weighted = criteria.filter((c) => c.weight && c.weight > 0 && COLUMN_EXPR[c.key]);
  if (!weighted.length || rows.length === 0) return rows;

  const bounds = {};
  for (const c of weighted) {
    const vals = rows.map((r) => Number(r[c.key])).filter((n) => Number.isFinite(n));
    bounds[c.key] = { min: Math.min(...vals), max: Math.max(...vals) };
  }

  const scored = rows.map((r) => {
    let acc = 0;
    let wSum = 0;
    for (const c of weighted) {
      const v = Number(r[c.key]);
      if (!Number.isFinite(v)) continue;
      const { min, max } = bounds[c.key];
      const span = max - min || 1;
      let norm = (v - min) / span;
      if (DIRECTION[c.key] === "lower") norm = 1 - norm;
      acc += norm * c.weight;
      wSum += c.weight;
    }
    return { ...r, _score: wSum ? Math.round((acc / wSum) * 100) : 0 };
  });

  scored.sort((a, b) => b._score - a._score);
  return scored;
}

/**
 * Run the full screen.
 * @returns {Promise<import("../../../shared/types/index.js").ScreenerResponse>}
 */
export async function runScreen(request = {}) {
  const criteria = Array.isArray(request.criteria) ? request.criteria : [];
  const { sql, params } = buildScreenerQuery(request);
  const [rows] = await pool.query(sql, params);

  const ranked = applyCriteriaWeighting(rows, criteria);

  const keys = criteria.map((c) => c.key).filter((k) => COLUMN_EXPR[k]);
  const results = ranked.map((r) => {
    const values = {};
    // Always surface the criteria that were filtered on, plus market cap.
    const surface = new Set([...keys, "marketCap", "peRatio", "dividendCents"]);
    for (const k of surface) {
      if (r[k] != null) values[k] = Number(r[k]);
    }
    return {
      exchangeCode: r.exchangeCode,
      stockCode: r.stockCode,
      stockName: r.stockName,
      values,
      ...(r._score != null ? { score: r._score } : {}),
    };
  });

  return {
    criteriaUsed: criteria.length ? criteria : getDefaultCriteria(),
    results,
  };
}

/** Sensible starting criteria for the UI (GET /api/screener/default-criteria). */
export function getDefaultCriteria() {
  return [
    { key: "marketCap", label: "Market Cap", min: 1_000_000_000 },
    { key: "peRatio", label: "P/E Ratio", min: 0, max: 35 },
    { key: "dividendCents", label: "Dividend (cents)", min: 0 },
  ];
}
