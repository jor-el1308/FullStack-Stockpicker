/**
 * Owner: Person 2 (Charles) - Data Collection & Database Design.
 *
 * NOTE: for the prototype, actual data ingestion happens OUTSIDE the Node
 * API - see /ingestion (a standalone Python script using yfinance) which
 * writes directly into the MySQL tables this API reads from. Run it with:
 *
 *   cd ingestion && python ingest.py
 *
 * See ingestion/README.md for setup and known limitations (EBITDA-as-EBITA
 * proxy, missing listed_date, dividend currency, Yahoo Finance being an
 * unofficial API).
 *
 * The functions below are kept as placeholders in case this workstream
 * later wants an on-demand refresh endpoint (e.g. POST /api/stocks/:code/refresh
 * that triggers a re-fetch for a single stock from the Node side instead of
 * waiting for the next batch run). Not needed for the prototype.
 */

/**
 * @param {string} _exchangeCode
 * @param {string} _stockCode
 */
export async function fetchAndUpsertDailyPrices(_exchangeCode, _stockCode) {
  throw new Error("Not implemented on the Node side - see ingestion/ingest.py");
}

/**
 * @param {string} _exchangeCode
 * @param {string} _stockCode
 */
export async function fetchAndUpsertMarketCap(_exchangeCode, _stockCode) {
  throw new Error("Not implemented on the Node side - see ingestion/ingest.py");
}

/**
 * @param {string} _exchangeCode
 * @param {string} _stockCode
 */
export async function fetchAndUpsertFinancials(_exchangeCode, _stockCode) {
  throw new Error("Not implemented on the Node side - see ingestion/ingest.py");
}

/**
 * @param {string} _exchangeCode
 * @param {string} _stockCode
 */
export async function fetchAndUpsertDividends(_exchangeCode, _stockCode) {
  throw new Error("Not implemented on the Node side - see ingestion/ingest.py");
}
