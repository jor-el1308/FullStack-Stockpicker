/**
 * Owner: Person 2 (Charles) - Data Collection & Database Design.
 *
 * This is where the external stock data API integration lives
 * (Alpha Vantage / FMP / Yahoo Finance - see STOCK_DATA_PROVIDER in
 * server/.env.example). Responsibilities:
 *
 *  1. fetchAndUpsertDailyPrices(exchangeCode, stockCode) - pull OHLC and
 *     upsert into `daily_price`.
 *  2. fetchAndUpsertMarketCap(exchangeCode, stockCode) - pull latest market
 *     cap into `market_cap`.
 *  3. fetchAndUpsertFinancials(exchangeCode, stockCode) - pull
 *     revenue/PBT/PAT/EBITA per year into `financials`.
 *  4. fetchAndUpsertDividends(exchangeCode, stockCode) - pull dividend per
 *     year (in cents) into `dividend`.
 *
 * Notes for the 7 May feedback writeup (per the requirement doc, this
 * workstream also owns documenting data-collection logistics):
 *  - Confirm which provider covers both SGX and the target US exchanges
 *    without hitting rate limits for the full stock universe.
 *  - Decide how to handle dual-listed stocks (same company, two exchange
 *    codes) so they don't get double-counted in screener results.
 *  - Free-tier API rate limits will likely require a scheduled batch job
 *    (e.g. nightly cron) rather than fetching live on each request.
 */

/**
 * @param {string} _exchangeCode
 * @param {string} _stockCode
 */
export async function fetchAndUpsertDailyPrices(_exchangeCode, _stockCode) {
  throw new Error("Not implemented: connect to STOCK_DATA_PROVIDER and upsert into daily_price");
}

/**
 * @param {string} _exchangeCode
 * @param {string} _stockCode
 */
export async function fetchAndUpsertMarketCap(_exchangeCode, _stockCode) {
  throw new Error("Not implemented: connect to STOCK_DATA_PROVIDER and upsert into market_cap");
}

/**
 * @param {string} _exchangeCode
 * @param {string} _stockCode
 */
export async function fetchAndUpsertFinancials(_exchangeCode, _stockCode) {
  throw new Error("Not implemented: connect to STOCK_DATA_PROVIDER and upsert into financials");
}

/**
 * @param {string} _exchangeCode
 * @param {string} _stockCode
 */
export async function fetchAndUpsertDividends(_exchangeCode, _stockCode) {
  throw new Error("Not implemented: connect to STOCK_DATA_PROVIDER and upsert into dividend");
}
