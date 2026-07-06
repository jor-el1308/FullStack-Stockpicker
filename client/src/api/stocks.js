// Stock/screener-specific calls. Uses the shared `api` wrapper from client.js —
// do not fetch() directly here, so auth headers and error handling stay consistent.
//
// Shapes below follow shared/types/index.js:
//   ScreenerResponse   = { criteriaUsed, results: ScreenerResultRow[] }
//   ScreenerResultRow  = StockIdentity & { values: Partial<Record<CriteriaKey, number>> }
//   StockDetail        = StockIdentity & { latestMarketCap?, fiftyTwoWeekHigh?,
//                          fiftyTwoWeekLow?, financials: FinancialsPerYear[], dividends: DividendPerYear[] }
//                        (priceHistory is fetched separately, see getStockPrices)
//   DailyPrice[]       = the /prices response

import { api } from "./client";

// GET /api/screener — results table data. Unwraps { criteriaUsed, results } to just the rows,
// since ResultsTable only needs ScreenerResultRow[].
// TODO: once the screener criteria UI exists, this should POST a ScreenerRequest
// ({ criteria, exchanges?, excludeSectors?, minCompanyAgeYears? }) instead of a bare GET.
export async function getStocks() {
  const response = await api.get("/screener");
  return response.results;
}

// GET /api/stocks/:exchangeCode/:stockCode — everything on StockDetail
// EXCEPT price history (fetched separately below).
export function getStockDetail(exchangeCode, stockCode) {
  return api.get(`/stocks/${exchangeCode}/${stockCode}`);
}

// GET /api/stocks/:exchangeCode/:stockCode/prices — DailyPrice[], used for the
// closing-price chart and to derive current price / day change.
export function getStockPrices(exchangeCode, stockCode) {
  return api.get(`/stocks/${exchangeCode}/${stockCode}/prices`);
}