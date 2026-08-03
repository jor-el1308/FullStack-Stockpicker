/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 * Shows the logged-in user's past "Analyze with AI" runs from the Screener
 * page (GET /api/ai/history, backed by aiHistory.service.js / ai.controller.js
 * / the ai_analysis table), latest first. Each run gets its own card with
 * the date/time it was prompted and a togglable tab per stock that was
 * analyzed in that run.
 */
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Clock } from "lucide-react";
import { getAiHistory } from "../api/ai";

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The stored analysis_text is one block covering every shortlisted stock,
 * each write-up starting with "<Stock Name>:" (see ai.service.js's prompt).
 * Splits that block back into per-stock segments by finding where each
 * stock's name appears, in the order they appear in the text. Falls back to
 * a single "whole thing" segment if none of the names can be found (e.g. the
 * model paraphrased a name) so the analysis is never hidden.
 * @param {string} analysisText
 * @param {Array<{stockName: string}>} stocks
 */
function splitAnalysisByStock(analysisText, stocks) {
  if (!analysisText) return [];

  const markers = stocks
    .map((s) => ({ name: s.stockName, index: analysisText.indexOf(s.stockName) }))
    .filter((m) => m.index !== -1)
    .sort((a, b) => a.index - b.index);

  if (markers.length === 0) {
    return [{ name: stocks[0]?.stockName ?? "Analysis", text: analysisText.trim() }];
  }

  return markers.map((m, i) => {
    const end = i + 1 < markers.length ? markers[i + 1].index : analysisText.length;
    return { name: m.name, text: analysisText.slice(m.index, end).trim() };
  });
}

function HistoryEntry({ entry }) {
  const segments = useMemo(
    () => splitAnalysisByStock(entry.analysisText, entry.stocks),
    [entry.analysisText, entry.stocks]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const active = segments[Math.min(activeIndex, segments.length - 1)];

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
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
          {entry.stocks.length} stock{entry.stocks.length === 1 ? "" : "s"} analyzed
        </span>
        <span className="page-subtitle" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Clock size={12} />
          {formatDateTime(entry.createdAt)}
        </span>
      </div>

      {segments.length > 1 && (
        <div className="ai-history-tabs">
          {segments.map((seg, i) => (
            <button
              key={`${seg.name}-${i}`}
              type="button"
              className={"ai-history-tab" + (i === activeIndex ? " active" : "")}
              onClick={() => setActiveIndex(i)}
            >
              {seg.name}
            </button>
          ))}
        </div>
      )}

      {active && (
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
          {active.text}
        </div>
      )}
    </div>
  );
}

export default function AiHistory() {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAiHistory()
      .then(({ history }) => {
        if (!cancelled) setHistory(history);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1 className="page-title">AI Analysis History</h1>
          <p className="page-subtitle">
            Every "Analyze with AI" run from the Screener, latest first. Click a stock's tab to see its write-up.
          </p>
        </div>
      </div>

      {error && (
        <div className="notice notice-error" style={{ marginBottom: 14 }}>
          Couldn't load AI analysis history: {error}
        </div>
      )}

      {!error && history === null && <p className="page-subtitle">Loading history…</p>}

      {history && history.length === 0 && (
        <div className="notice notice-muted">
          No AI analysis yet. Shortlist stocks on the Screener and click "Analyze with AI" to get started.
        </div>
      )}

      {history && history.map((entry) => <HistoryEntry key={entry.id} entry={entry} />)}
    </section>
  );
}
