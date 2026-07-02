/**
 * Owner: Person 5 (Jayden) - Notifications & Optional AI Step.
 * TODO: wire up to notifications.service.js. Watchlist alert checks
 * (does a stock still meet a saved criteria set) depend on Person 3's
 * screener logic and Person 2's data.
 */

export async function listWatchlist(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: listWatchlist" } });
}

export async function addToWatchlist(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: addToWatchlist" } });
}

export async function removeFromWatchlist(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: removeFromWatchlist" } });
}

export async function getAiRecommendation(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: getAiRecommendation (optional feature)" } });
}
