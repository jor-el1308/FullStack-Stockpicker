/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine.
 *
 * Saving a screen is offered from two places now - the Screener page (saves
 * the screen that just ran) and Advanced Filters (saves the screen you are
 * still editing, before applying it) - so the rules live here rather than
 * being copied into both.
 *
 * Logged in, a screen goes to the account via POST /api/auth/me/criteria-sets
 * and shows up on the Saved Screens page and in the watchlist's "saved
 * criteria" picker. Logged out, it falls back to localStorage so the work
 * isn't lost; the Saved Screens page reads both.
 */
import { saveScreen as saveScreenToAccount } from "../api/stocks";

export const LOCAL_SCREENS_KEY = "localSavedScreens";

/**
 * Trim a criteria list down to what the API accepts: numeric min/max/weight,
 * blanks dropped. A criterion carrying only a weight is kept - it still
 * influences ranking even though it filters nothing.
 */
export function toSavedCriteria(criteria) {
  return (criteria ?? [])
    .map(({ key, min, max, weight }) => ({
      key,
      ...(min != null && min !== "" ? { min: Number(min) } : {}),
      ...(max != null && max !== "" ? { max: Number(max) } : {}),
      ...(weight ? { weight: Number(weight) } : {}),
    }))
    .filter((c) => c.min != null || c.max != null || c.weight != null);
}

/**
 * Save a screen wherever it can go.
 *
 * @param {string} name
 * @param {object[]} criteria  CriteriaRange[] in raw API units
 * @param {{ user?: object | null }} options
 * @returns {Promise<{ scope: "account" | "browser" }>} where it landed
 * @throws if the account save fails (the caller shows the message)
 */
export async function persistScreen(name, criteria, { user } = {}) {
  const trimmed = name.trim();
  const payload = toSavedCriteria(criteria);
  if (!trimmed) throw new Error("Give the screen a name first.");
  if (payload.length === 0) throw new Error("Set at least one criterion before saving.");

  if (user) {
    await saveScreenToAccount(trimmed, payload);
    return { scope: "account" };
  }

  const stored = JSON.parse(localStorage.getItem(LOCAL_SCREENS_KEY) ?? "[]");
  stored.unshift({
    id: `local-${Date.now()}`,
    name: trimmed,
    createdAt: new Date().toISOString(),
    criteria: payload,
    local: true,
  });
  localStorage.setItem(LOCAL_SCREENS_KEY, JSON.stringify(stored));
  return { scope: "browser" };
}
