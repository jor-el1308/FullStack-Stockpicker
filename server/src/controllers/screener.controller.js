/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine.
 * TODO: wire up to screener.service.js. Request/response shapes are defined
 * in shared/types/index.js (JSDoc typedefs ScreenerRequest / ScreenerResponse)
 * so this can be built against a stable contract before Person 2's data is
 * fully live.
 */

export async function runScreener(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: runScreener" } });
}

export async function getDefaultCriteria(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: getDefaultCriteria" } });
}
