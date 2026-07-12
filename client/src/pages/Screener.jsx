/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine.
 * Main screener page: shows the active criteria as chips, runs the screen
 * against the database (POST /api/screener/run) and renders the results.
 * Fine-grained editing lives on the Advanced Filters page; screens can be
 * stored/recalled on the Saved Screens page.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SlidersHorizontal, Play, Bookmark, RefreshCw, Sparkles, X } from "lucide-react";
import ResultsTable from "../components/ResultsTable";
import { useScreener } from "../context/ScreenerContext";
import { useAuth } from "../context/AuthContext";
import { saveScreen } from "../api/stocks";
import { analyzeStocks } from "../api/ai";
import { describeRange } from "../screener/criteria";

const MAX_AI_SELECTION = 10;

const LOCAL_SCREENS_KEY = "localSavedScreens";

export default function Screener() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    criteria,
    criteriaReady,
    exchanges,
    excludeSectors,
    minCompanyAgeYears,
    results,
    loading,
    error,
    lastRunAt,
    runScreen,
  } = useScreener();

  const [saveOpen, setSaveOpen] = useState(false);
  const [screenName, setScreenName] = useState("");
  const [saveMsg, setSaveMsg] = useState(null);

  // AI recommendation (Person 1, requirement doc section 6) - user
  // shortlists rows from the results table, then sends them off for
  // qualitative analysis.
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [selectedRows, setSelectedRows] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);

  function toggleRow(row) {
    const key = `${row.exchangeCode}-${row.stockCode}`;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setSelectedRows((rows) => rows.filter((r) => `${r.exchangeCode}-${r.stockCode}` !== key));
      } else {
        if (next.size >= MAX_AI_SELECTION) return prev; // cap shortlist size
        next.add(key);
        setSelectedRows((rows) => [...rows, row]);
      }
      return next;
    });
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalysis(null);
    try {
      const { analysis } = await analyzeStocks(selectedRows);
      setAnalysis(analysis);
    } catch (err) {
      setAnalyzeError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  const activeCriteria = criteria.filter(
    (c) => (c.min != null && c.min !== "") || (c.max != null && c.max !== "")
  );

  // Run automatically once the default criteria have loaded (and after a
  // saved screen replaces the criteria, which clears `results`). The screener
  // API is behind the login + activation paywall, so only run when logged in.
  useEffect(() => {
    if (user && criteriaReady && results === null && !loading && !error) runScreen();
  }, [user, criteriaReady, results, loading, error, runScreen]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setSelectedRows([]);
    setAnalysis(null);
    setAnalyzeError(null);
  }, [results]);

  async function handleSave(e) {
    e.preventDefault();
    const name = screenName.trim();
    if (!name || activeCriteria.length === 0) return;
    setSaveMsg(null);
    if (user) {
      try {
        await saveScreen(
          name,
          activeCriteria.map(({ key, min, max }) => ({
            key,
            ...(min != null && min !== "" ? { min: Number(min) } : {}),
            ...(max != null && max !== "" ? { max: Number(max) } : {}),
          }))
        );
        setSaveMsg(`Saved "${name}" to your account.`);
      } catch (err) {
        setSaveMsg(`Could not save: ${err.message}`);
        return;
      }
    } else {
      const stored = JSON.parse(localStorage.getItem(LOCAL_SCREENS_KEY) ?? "[]");
      stored.unshift({
        id: `local-${Date.now()}`,
        name,
        createdAt: new Date().toISOString(),
        criteria: activeCriteria,
        local: true,
      });
      localStorage.setItem(LOCAL_SCREENS_KEY, JSON.stringify(stored));
      setSaveMsg(`Saved "${name}" in this browser. Log in to sync screens to your account.`);
    }
    setScreenName("");
    setSaveOpen(false);
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1 className="page-title">Stock Screener</h1>
          <p className="page-subtitle">
            Filter the stock database by your criteria, then click a row for the full report.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={() => navigate("/filters")}>
            <SlidersHorizontal size={14} />
            Advanced Filters
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setSaveOpen((o) => !o)}
            disabled={activeCriteria.length === 0}
          >
            <Bookmark size={14} />
            Save Screen
          </button>
          <button className="btn btn-primary" onClick={() => runScreen()} disabled={loading || !criteriaReady}>
            <Play size={14} />
            {loading ? "Running…" : "Run Screen"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleAnalyze}
            disabled={selectedRows.length === 0 || analyzing}
            title={selectedRows.length === 0 ? "Select rows in the results table first" : undefined}
          >
            <Sparkles size={14} />
            {analyzing ? "Analyzing…" : `Analyze with AI${selectedRows.length ? ` (${selectedRows.length})` : ""}`}
          </button>
        </div>
      </div>

      {saveOpen && (
        <form
          onSubmit={handleSave}
          className="card card-pad"
          style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}
        >
          <label htmlFor="screen-name" style={{ fontSize: 13 }}>
            Screen name
          </label>
          <input
            id="screen-name"
            className="range-input"
            style={{ width: 220, textAlign: "left" }}
            value={screenName}
            onChange={(e) => setScreenName(e.target.value)}
            placeholder="e.g. Large-cap value"
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={!screenName.trim()}>
            Save
          </button>
          <span className="page-subtitle">
            {user ? "Saved to your account." : "Not logged in — saved in this browser only."}
          </span>
        </form>
      )}

      {saveMsg && (
        <p className="page-subtitle" style={{ marginBottom: 12 }}>
          {saveMsg} <Link to="/saved">View saved screens</Link>
        </p>
      )}

      {/* Active criteria summary */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        {activeCriteria.map((c) => (
          <span key={c.key} className="chip chip-accent">
            {describeRange(c)}
            {c.weight ? <span className="numeric">w{c.weight}</span> : null}
          </span>
        ))}
        {exchanges.length > 0 && <span className="chip">Exchanges: {exchanges.join(", ")}</span>}
        {excludeSectors.length > 0 && <span className="chip">Excl. {excludeSectors.join(", ")}</span>}
        <span className="chip">Age ≥ {minCompanyAgeYears} yrs</span>
        {activeCriteria.length === 0 && (
          <span className="page-subtitle">
            No criteria set — <Link to="/filters">add filters</Link> to narrow the results.
          </span>
        )}
      </div>

      {!user && (
        <div className="notice notice-muted" style={{ marginBottom: 14 }}>
          The screener requires an account. <Link to="/login">Log in or sign up</Link> (and activate your
          account) to run screens against the stock database.
        </div>
      )}

      {error && (
        <div className="notice notice-error" style={{ marginBottom: 14 }}>
          Couldn't run the screen: {error}.{" "}
          {/Account not activated/i.test(error) ? (
            <Link to="/activate">Activate your account</Link>
          ) : /auth token|log ?in/i.test(error) ? (
            <Link to="/login">Log in</Link>
          ) : (
            "Check that the API server and MySQL database are running (npm run db:migrate / db:seed)."
          )}
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          className="card-pad"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <span style={{ fontFamily: "var(--font-title)", fontWeight: 600, fontSize: 14 }}>
            Results{" "}
            <span className="chip chip-good" style={{ marginLeft: 8 }}>
              {results ? `${results.length} stocks` : "—"}
            </span>
          </span>
          <span className="page-subtitle" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={12} />
            {lastRunAt ? `Last run ${lastRunAt.toLocaleTimeString()}` : "Not run yet"}
          </span>
        </div>
        {results && results.length > 0 && (
          <p className="page-subtitle" style={{ padding: "10px 16px 0" }}>
            Tick rows to shortlist up to {MAX_AI_SELECTION} stocks, then click "Analyze with AI" above for a
            qualitative take on each.
          </p>
        )}
        <div style={{ overflowX: "auto", padding: "0 8px 8px" }}>
          {loading && !results ? (
            <p className="page-subtitle" style={{ padding: 18 }}>
              Running screen against the database…
            </p>
          ) : (
            <ResultsTable
              rows={results ?? []}
              onRowClick={(row) => navigate(`/stock/${row.exchangeCode}/${row.stockCode}`)}
              selectable
              selectedKeys={selectedKeys}
              onToggleRow={toggleRow}
              emptyMessage={
                error
                  ? "No results — the screener API is unavailable."
                  : "No stocks match the current criteria. Try widening the ranges in Advanced Filters."
              }
            />
          )}
        </div>
      </div>

      {(analyzing || analysis || analyzeError) && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <span
              style={{
                fontFamily: "var(--font-title)",
                fontWeight: 600,
                fontSize: 14,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Sparkles size={14} color="var(--color-special)" />
              AI Analysis
            </span>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setAnalysis(null);
                setAnalyzeError(null);
              }}
              style={{ padding: "4px 8px" }}
              aria-label="Close AI analysis"
            >
              <X size={14} />
            </button>
          </div>

          {analyzing && (
            <p className="page-subtitle" style={{ marginTop: 12 }}>
              Asking the AI model about {selectedRows.length} stock{selectedRows.length === 1 ? "" : "s"}…
            </p>
          )}

          {analyzeError && (
            <div className="notice notice-error" style={{ marginTop: 12 }}>
              Couldn't get AI analysis: {analyzeError}
            </div>
          )}

          {analysis && (
            <div
              style={{
                marginTop: 12,
                fontFamily: "var(--font-body)",
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--color-dark-menu)",
                whiteSpace: "pre-wrap",
              }}
            >
              {analysis}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
