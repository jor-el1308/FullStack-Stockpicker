// Stock/screener-specific calls. Uses the shared `api` wrapper from client.js —
// do not fetch() directly here, so auth headers and error handling stay consistent.
//
// Shapes below follow shared/types/index.js:
//   ScreenerRequest    = { criteria, exchanges?, excludeSectors?, minCompanyAgeYears? }
//   ScreenerResponse   = { criteriaUsed, results: ScreenerResultRow[] }
//   ScreenerResultRow  = StockIdentity & { values: Partial<Record<CriteriaKey, number>> }
//   StockDetail        = StockIdentity & { latestMarketCap?, fiftyTwoWeekHigh?,
//                          fiftyTwoWeekLow?, financials: FinancialsPerYear[], dividends: DividendPerYear[] }
//                        (priceHistory is fetched separately, see getStockPrices)
//   DailyPrice[]       = the /prices response

import { api } from "./client";

// POST /api/screener/run — the filter engine. Pass a ScreenerRequest; an empty
// object runs the backend's default screen.
export function runScreener(request = {}) {
  return api.post("/screener/run", request);
}

// GET /api/screener/default-criteria — sensible starting criteria for the UI.
export async function getDefaultCriteria() {
  const data = await api.get("/screener/default-criteria");
  return data.criteria;
}

// Convenience for the Dashboard: default screen, unwrapped to just the rows,
// since ResultsTable only needs ScreenerResultRow[].
export async function getStocks() {
  const response = await runScreener({});
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

// ---------- Saved screens (criteria sets tied to the logged-in user) ----------

// GET /api/auth/me/criteria-sets — [{ id, name, createdAt, criteria: CriteriaRange[] }]
export function listSavedScreens() {
  return api.get("/auth/me/criteria-sets");
}

// POST /api/auth/me/criteria-sets — { name, criteria } (criteria need min and/or max)
export function saveScreen(name, criteria) {
  return api.post("/auth/me/criteria-sets", { name, criteria });
}

// DELETE /api/auth/me/criteria-sets/:id
export function deleteScreen(id) {
  return api.delete(`/auth/me/criteria-sets/${id}`);
}
