/**
 * Owner: Person 2 (Charles) - Data Pipeline + Subscription/Paywall + Admin Dashboard.
 *
 * Minimal in-memory TTL cache for read-heavy, infrequently-changing data
 * (stock lookups, prices, financials - anything only ingestion/ writes to,
 * not something users mutate through the app). Deliberately not Redis or
 * any external cache store - this is a single-process prototype, so a
 * plain Map with expiry timestamps covers it without adding infra. If this
 * ever needs to run across multiple server instances, swap the Map here
 * for a shared store (Redis, etc.) behind the same get/set/cached interface
 * and every call site stays the same.
 *
 * Caveat: this cache has no idea when ingestion/ingest.py writes new data -
 * it's a separate Python process, doesn't share this Node process's
 * memory, and there's no automatic invalidation hook between them. Entries
 * just go stale after TTL_MS and get refetched on the next request. If you
 * need to see freshly-ingested data immediately: clearCache() (wired to
 * POST /api/admin/cache/clear, see admin.routes.js), or just restart the
 * server.
 */

const store = new Map();

/**
 * @param {string} key
 * @returns {*} the cached value, or undefined if missing/expired
 */
export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * @param {string} key
 * @param {*} value
 * @param {number} ttlMs
 */
export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * @param {string} key
 */
export function cacheInvalidate(key) {
  store.delete(key);
}

/** Wipes every cached entry. */
export function cacheClear() {
  store.clear();
}

/** @returns {number} how many entries are currently cached (expired-but-not-yet-swept entries included) */
export function cacheSize() {
  return store.size;
}

/**
 * Get-or-compute: returns the cached value for `key` if present and not
 * expired, otherwise calls `fn()`, caches the result for `ttlMs`, and
 * returns it. A failed `fn()` is not cached, so the next call just retries.
 *
 * @template T
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
export async function cached(key, ttlMs, fn) {
  const existing = cacheGet(key);
  if (existing !== undefined) return existing;
  const value = await fn();
  cacheSet(key, value, ttlMs);
  return value;
}
