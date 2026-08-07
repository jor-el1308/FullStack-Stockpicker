/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine.
 * Main screener page: shows the active criteria as chips, runs the screen
 * against the database (POST /api/screener/run) and renders the results.
 * Fine-grained editing lives on the Advanced Filters page; screens can be
 * stored/recalled on the Saved Screens page.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SlidersHorizontal, Play, Bookmark, RefreshCw, Sparkles, X } from "lucide-react";
import ResultsTable from "../components/ResultsTable";
import AiComparisonTable from "../components/AiComparisonTable";
import AiChatBox from "../components/AiChatBox";
import AddToWatchlistDialog, {
  readWatchlistDefaults,
  rememberWatchlistDefaults,
} from "../components/AddToWatchlistDialog";
import { useScreener } from "../context/ScreenerContext";
import { useAuth } from "../context/AuthContext";
import { listSavedScreens, listWatchlist, addToWatchlist, removeFromWatchlist } from "../api/stocks";
import { persistScreen } from "../screener/savedScreens";
import { analyzeStocks } from "../api/ai";
import { getAiPreferences } from "../api/aiPreferences";
import { AI_MODEL_OPTIONS, AI_PERSONA_OPTIONS, AI_DETAIL_OPTIONS } from "../constants/aiPreferences";
import { describeRange } from "../screener/criteria";

const MAX_AI_SELECTION = 10;


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
  const [analysis, setAnalysis] = useState(null);
  const [analysisMode, setAnalysisMode] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  // Snapshotted at analyze time (not read live off `selectedRows`/preferences)
  // so a follow-up chat (AiChatBox) stays anchored to exactly what produced
  // this analysis, even if the row selection or saved AI preferences change
  // while the chat is open.
  const [analyzedStocks, setAnalyzedStocks] = useState([]);
  const [analysisPreferences, setAnalysisPreferences] = useState(null);
  const [analysisId, setAnalysisId] = useState(null);

  // The user's saved AI preferences (model tier, persona, detail level,
  // custom instructions) - fetched once so the floating "Analyze with AI"
  // button can show the active model and surface the rest as a tooltip,
  // without waiting for an analysis run.
  const [aiPrefs, setAiPrefs] = useState(null);
  useEffect(() => {
    if (!user) return;
    getAiPreferences()
      .then(setAiPrefs)
      .catch(() => {});
  }, [user]);

  // ---- Watchlist (Person 5) ------------------------------------------------
  // Adding a stock used to mean leaving the results, going to the Watchlist
  // page and retyping its exchange + code by hand. The bell in each row does
  // the same thing with the identity already filled in.
  const [watchlist, setWatchlist] = useState([]);
  const [savedScreens, setSavedScreens] = useState([]);
  const [watchDialogRow, setWatchDialogRow] = useState(null);
  const [watchSubmitting, setWatchSubmitting] = useState(false);
  const [watchDialogError, setWatchDialogError] = useState(null);
  const [watchBusyKeys, setWatchBusyKeys] = useState(new Set());
  const [watchMsg, setWatchMsg] = useState(null);
  const [watchDefaults, setWatchDefaults] = useState(readWatchlistDefaults);

  useEffect(() => {
    if (!user) {
      setWatchlist([]);
      setSavedScreens([]);
      return;
    }
    let cancelled = false;
    // Both are decoration on this page - if either fails (e.g. the account
    // isn't activated yet) the screener itself must still work, so failures
    // only cost the bell column its "already watching" state.
    Promise.all([listWatchlist().catch(() => []), listSavedScreens().catch(() => [])]).then(
      ([watchRows, screens]) => {
        if (cancelled) return;
        setWatchlist(watchRows ?? []);
        setSavedScreens(screens ?? []);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [user]);

  const watchedKeys = useMemo(
    () => new Set(watchlist.map((item) => `${item.exchange_code}-${item.stock_code}`)),
    [watchlist]
  );

  function markBusy(key, busy) {
    setWatchBusyKeys((prev) => {
      const next = new Set(prev);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  /** Bell click: open the dialog to add, or take the stock straight off. */
  async function handleToggleWatch(row) {
    if (!user) {
      setWatchMsg("Log in to keep a watchlist.");
      return;
    }
    const key = `${row.exchangeCode}-${row.stockCode}`;
    const existing = watchlist.find((item) => `${item.exchange_code}-${item.stock_code}` === key);

    if (!existing) {
      setWatchDialogError(null);
      setWatchDialogRow(row);
      return;
    }

    setWatchMsg(null);
    markBusy(key, true);
    try {
      await removeFromWatchlist(existing.id);
      setWatchlist((prev) => prev.filter((item) => item.id !== existing.id));
      setWatchMsg(`Removed ${row.stockName ?? row.stockCode} from your watchlist.`);
    } catch (err) {
      setWatchMsg(`Could not remove ${row.stockCode}: ${err.message}`);
    } finally {
      markBusy(key, false);
    }
  }

  async function handleAddToWatchlist(values) {
    const row = watchDialogRow;
    if (!row) return;
    setWatchSubmitting(true);
    setWatchDialogError(null);
    try {
      await addToWatchlist({
        exchangeCode: row.exchangeCode,
        stockCode: row.stockCode,
        savedCriteriaSetId: values.savedCriteriaSetId || undefined,
        channel: values.channel,
        recipientNumber: values.recipientNumber || undefined,
      });
      // Re-read rather than pushing the POST response: the list endpoint joins
      // in stock_name, which the create response doesn't return.
      const rows = await listWatchlist().catch(() => null);
      if (rows) setWatchlist(rows);
      setWatchDefaults(values);
      rememberWatchlistDefaults(values);
      setWatchDialogRow(null);
      setWatchMsg(`Added ${row.stockName ?? row.stockCode} to your watchlist.`);
    } catch (err) {
      setWatchDialogError(err.message || "Unable to add stock to watchlist.");
    } finally {
      setWatchSubmitting(false);
    }
  }

  const selectedRows = useMemo(
    () => (results ?? []).filter((r) => selectedKeys.has(`${r.exchangeCode}-${r.stockCode}`)),
    [results, selectedKeys]
  );

  function toggleRow(row) {
    const key = `${row.exchangeCode}-${row.stockCode}`;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= MAX_AI_SELECTION) return prev; // cap shortlist size
        next.add(key);
      }
      return next;
    });
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalysis(null);
    setAnalysisMode(null);
    setAnalysisPreferences(null);
    setAnalysisId(null);
    try {
      const { analysis, mode, preferences } = await analyzeStocks(selectedRows);
      setAnalysis(analysis);
      setAnalysisMode(mode);
      setAnalyzedStocks(selectedRows);
      setAnalysisPreferences(preferences ?? {});
      // Unique per run so AiChatBox's localStorage-backed transcript (see
      // aiChatStorage.js) starts fresh instead of continuing a past chat.
      setAnalysisId(`chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    } catch (err) {
      setAnalyzeError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  // A criterion with only a weight set (no min/max) is still active - it's
  // sent to the server (see ScreenerContext.jsx's buildRequest) to influence
  // ranking rather than to filter rows, so it needs to show up here too and
  // not get dropped when the screen is saved (see handleSave below).
  const activeCriteria = criteria.filter(
    (c) => (c.min != null && c.min !== "") || (c.max != null && c.max !== "") || c.weight
  );

  // Run automatically once the default criteria have loaded (and after a
  // saved screen replaces the criteria, which clears `results`). The screener
  // API is behind the login + activation paywall, so only run when logged in.
  useEffect(() => {
    if (user && criteriaReady && results === null && !loading && !error) runScreen();
  }, [user, criteriaReady, results, loading, error, runScreen]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setAnalysis(null);
    setAnalysisMode(null);
    setAnalyzeError(null);
    setAnalysisPreferences(null);
    setAnalysisId(null);
  }, [results]);

  async function handleSave(e) {
    e.preventDefault();
    const name = screenName.trim();
    if (!name || activeCriteria.length === 0) return;
    setSaveMsg(null);
    try {
      // Shared with Advanced Filters' "Save as Screen" so both routes store
      // the same shape and fall back to localStorage the same way.
      const { scope } = await persistScreen(name, activeCriteria, { user });
      setSaveMsg(
        scope === "account"
          ? `Saved "${name}" to your account.`
          : `Saved "${name}" in this browser. Log in to sync screens to your account.`
      );
    } catch (err) {
      setSaveMsg(`Could not save: ${err.message}`);
      return;
    }
    setScreenName("");
    setSaveOpen(false);
  }

  // Labels for the floating AI button: the active model is shown on the
  // button itself, the rest of the preferences (persona, detail level,
  // custom instructions) surface as a hover tooltip.
  const aiModelLabel =
    AI_MODEL_OPTIONS.find((m) => m.id === (aiPrefs?.aiModelTier ?? AI_MODEL_OPTIONS[0].id))?.label ??
    AI_MODEL_OPTIONS[0].label;
  const aiPersonaLabel =
    AI_PERSONA_OPTIONS.find((p) => p.id === (aiPrefs?.aiPersona ?? AI_PERSONA_OPTIONS[0].id))?.label ??
    AI_PERSONA_OPTIONS[0].label;
  const aiDetailLabel =
    AI_DETAIL_OPTIONS.find((d) => d.id === (aiPrefs?.aiDetailLevel ?? AI_DETAIL_OPTIONS[0].id))?.label ??
    AI_DETAIL_OPTIONS[0].label;
  const aiFabTooltipRows = [
    { label: "Persona", value: aiPersonaLabel },
    { label: "Detail level", value: aiDetailLabel },
    ...(aiPrefs?.customInstructions
      ? [{ label: "Custom instructions", value: aiPrefs.customInstructions }]
      : []),
  ];
  const showAnalysisPanel = analyzing || analysis || analyzeError;

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

      {watchMsg && (
        <p className="page-subtitle" style={{ marginBottom: 12 }}>
          {watchMsg} <Link to="/watchlist">View watchlist</Link>
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
            Tick rows to shortlist up to {MAX_AI_SELECTION} stocks, then use the AI button in the bottom-right
            corner for a qualitative take on a single stock, or a structured comparison when you select more
            than one. Use the bell to put a stock on your <Link to="/watchlist">watchlist</Link>.
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
              watchedKeys={watchedKeys}
              onToggleWatch={handleToggleWatch}
              watchBusyKeys={watchBusyKeys}
              emptyMessage={
                error
                  ? "No results — the screener API is unavailable."
                  : "No stocks match the current criteria. Try widening the ranges in Advanced Filters."
              }
            />
          )}
        </div>
      </div>

      {showAnalysisPanel && (
        <div
          className={`card card-pad${analyzing ? " ai-analysis-floating" : ""}`}
          style={analyzing ? undefined : { marginTop: 16 }}
        >
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
                setAnalysisMode(null);
                setAnalyzeError(null);
                setAnalysisPreferences(null);
                setAnalysisId(null);
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

          {analysis && analysisMode === "comparison" && <AiComparisonTable comparison={analysis} />}

          {analysis && analysisMode !== "comparison" && (
            <div
              style={{
                marginTop: 12,
                fontFamily: "var(--font-body)",
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--color-text)",
                whiteSpace: "pre-wrap",
              }}
            >
              {analysis}
            </div>
          )}

          {analysis && analysisId && (
            <AiChatBox
              key={analysisId}
              sessionId={analysisId}
              stocks={analyzedStocks}
              mode={analysisMode}
              originalAnalysis={analysisMode === "comparison" ? JSON.stringify(analysis) : analysis}
              preferences={analysisPreferences ?? {}}
            />
          )}
        </div>
      )}

      {/* Floating "Analyze with AI" launcher, chatbot-widget style: a small
          circular button pinned to the bottom-right of the viewport rather
          than competing with the other page actions above. It steps aside
          while the analysis panel is open (like a chat bubble that hides
          behind its own open panel) and reappears once it's closed. */}
      {!showAnalysisPanel && (
        <div className="ai-fab-wrap">
          {/* Custom hover card (CSS-only, shown via .ai-fab-wrap:hover/:focus-within)
              instead of a plain native title tooltip, so the rest of the AI
              preferences read as a small styled card rather than a browser tooltip. */}
          <div className="ai-fab-tooltip" aria-hidden="true">
            <div className="ai-fab-tooltip-title">
              <Sparkles size={12} />
              AI preferences
            </div>
            <dl className="ai-fab-tooltip-list">
              {aiFabTooltipRows.map((row) => (
                <div className="ai-fab-tooltip-row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            {selectedRows.length === 0 && (
              <div className="ai-fab-tooltip-hint">Select rows in the results table first</div>
            )}
          </div>
          <button
            className="ai-fab"
            onClick={handleAnalyze}
            disabled={selectedRows.length === 0 || analyzing}
            aria-label={
              selectedRows.length === 0
                ? `Analyze with AI, using ${aiModelLabel} (select rows in the results table first)`
                : `Analyze ${selectedRows.length} selected stock${selectedRows.length === 1 ? "" : "s"} with AI, using ${aiModelLabel}`
            }
          >
            <Sparkles size={22} />
            {selectedRows.length > 0 && <span className="ai-fab-count">{selectedRows.length}</span>}
          </button>
          <span className="ai-fab-badge">{aiModelLabel}</span>
        </div>
      )}

      {watchDialogRow && (
        <AddToWatchlistDialog
          stock={watchDialogRow}
          savedScreens={savedScreens}
          defaults={watchDefaults}
          submitting={watchSubmitting}
          error={watchDialogError}
          onSubmit={handleAddToWatchlist}
          onClose={() => {
            setWatchDialogRow(null);
            setWatchDialogError(null);
          }}
        />
      )}
    </section>
  );
}
