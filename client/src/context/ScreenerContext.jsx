import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { runScreener, getDefaultCriteria } from "../api/stocks";
import { DEFAULT_EXCLUDED_SECTORS } from "../screener/criteria";

/**
 * Shares the current screen (criteria + options) and its latest results
 * across the Screener, Advanced Filters and Saved Screens pages, so applying
 * filters on one page is reflected everywhere.
 */
const ScreenerContext = createContext(null);

const STORAGE_KEY = "screenerState";

function readStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function ScreenerProvider({ children }) {
  const stored = readStoredState();

  // The screen definition (what gets POSTed to /api/screener/run)
  const [criteria, setCriteria] = useState(stored?.criteria ?? null); // null => not yet initialised
  const [exchanges, setExchanges] = useState(stored?.exchanges ?? []);
  const [excludeSectors, setExcludeSectors] = useState(stored?.excludeSectors ?? DEFAULT_EXCLUDED_SECTORS);
  const [minCompanyAgeYears, setMinCompanyAgeYears] = useState(stored?.minCompanyAgeYears ?? 5);

  // Latest run
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRunAt, setLastRunAt] = useState(null);
  const runSeq = useRef(0);

  // First visit: seed the criteria from the backend's defaults.
  useEffect(() => {
    if (criteria !== null) return;
    getDefaultCriteria()
      .then((defs) => setCriteria(defs.map((d) => ({ ...d }))))
      .catch(() => setCriteria([{ key: "marketCap", min: 1e9 }, { key: "peRatio", min: 0, max: 35 }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the screen definition so a refresh keeps the user's filters.
  useEffect(() => {
    if (criteria === null) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ criteria, exchanges, excludeSectors, minCompanyAgeYears })
    );
  }, [criteria, exchanges, excludeSectors, minCompanyAgeYears]);

  const buildRequest = useCallback(
    (overrides = {}) => ({
      criteria: (overrides.criteria ?? criteria ?? []).filter(
        (c) => (c.min != null && c.min !== "") || (c.max != null && c.max !== "") || c.weight
      ),
      ...(exchanges.length ? { exchanges } : {}),
      excludeSectors,
      minCompanyAgeYears: Number(minCompanyAgeYears) || 0,
      ...overrides,
    }),
    [criteria, exchanges, excludeSectors, minCompanyAgeYears]
  );

  /** Run the screen against the database. Optionally override parts of the request. */
  const runScreen = useCallback(
    async (overrides = {}) => {
      const seq = ++runSeq.current;
      setLoading(true);
      setError(null);
      try {
        const data = await runScreener(buildRequest(overrides));
        if (seq !== runSeq.current) return null; // a newer run superseded this one
        setResults(data.results ?? []);
        setLastRunAt(new Date());
        return data;
      } catch (err) {
        if (seq === runSeq.current) setError(err.message);
        return null;
      } finally {
        if (seq === runSeq.current) setLoading(false);
      }
    },
    [buildRequest]
  );

  /** Replace the whole screen definition (used when loading a saved screen). */
  const loadScreen = useCallback((nextCriteria, options = {}) => {
    setCriteria(nextCriteria.map((c) => ({ ...c })));
    if (options.exchanges) setExchanges(options.exchanges);
    if (options.excludeSectors) setExcludeSectors(options.excludeSectors);
    if (options.minCompanyAgeYears != null) setMinCompanyAgeYears(options.minCompanyAgeYears);
    setResults(null); // force a re-run with the new screen
  }, []);

  const value = {
    criteria: criteria ?? [],
    criteriaReady: criteria !== null,
    setCriteria,
    exchanges,
    setExchanges,
    excludeSectors,
    setExcludeSectors,
    minCompanyAgeYears,
    setMinCompanyAgeYears,
    results,
    loading,
    error,
    lastRunAt,
    runScreen,
    loadScreen,
  };

  return <ScreenerContext.Provider value={value}>{children}</ScreenerContext.Provider>;
}

export function useScreener() {
  const ctx = useContext(ScreenerContext);
  if (!ctx) throw new Error("useScreener must be used within a ScreenerProvider");
  return ctx;
}
