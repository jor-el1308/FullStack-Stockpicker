/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 * Shows the logged-in user's past "Analyze with AI" runs from the Screener
 * page (GET /api/ai/history, backed by aiHistory.service.js / ai.controller.js
 * / the ai_analysis table), latest first. Each run gets its own card with a
 * renameable title, the date/time it was prompted, a togglable tab per stock
 * that was analyzed, editable analysis text, and a delete action.
 */
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Clock, Pencil, Trash2 } from "lucide-react";
import { getAiHistory, updateAiHistoryEntry, deleteAiHistoryEntry } from "../api/ai";

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
 * model paraphrased a name, or the text was hand-edited) so the analysis is
 * never hidden.
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

const titleInputStyle = {
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontFamily: "var(--font-title)",
  fontWeight: 600,
  fontSize: 14,
  minWidth: 180,
};

const textAreaStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  lineHeight: 1.6,
  resize: "vertical",
};

function HistoryEntry({ entry, onDeleted }) {
  const [title, setTitle] = useState(entry.title);
  const [analysisText, setAnalysisText] = useState(entry.analysisText);
  const segments = useMemo(
    () => splitAnalysisByStock(analysisText, entry.stocks),
    [analysisText, entry.stocks]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const active = segments[Math.min(activeIndex, Math.max(segments.length - 1, 0))];

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [titleBusy, setTitleBusy] = useState(false);

  const [editingText, setEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState(analysisText);
  const [textBusy, setTextBusy] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function startEditTitle() {
    setTitleDraft(title);
    setEditingTitle(true);
    setError("");
  }

  async function saveTitle() {
    const next = titleDraft.trim();
    if (!next) {
      setError("Title can't be empty.");
      return;
    }
    setTitleBusy(true);
    setError("");
    try {
      const updated = await updateAiHistoryEntry(entry.id, { title: next });
      setTitle(updated.title);
      setEditingTitle(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setTitleBusy(false);
    }
  }

  function startEditText() {
    setTextDraft(analysisText);
    setEditingText(true);
    setError("");
  }

  async function saveText() {
    const next = textDraft.trim();
    if (!next) {
      setError("Analysis text can't be empty.");
      return;
    }
    setTextBusy(true);
    setError("");
    try {
      const updated = await updateAiHistoryEntry(entry.id, { analysisText: next });
      setAnalysisText(updated.analysisText);
      setEditingText(false);
      setActiveIndex(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setTextBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    setDeleting(true);
    setError("");
    try {
      await deleteAiHistoryEntry(entry.id);
      onDeleted(entry.id);
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16, opacity: deleting ? 0.5 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          {editingTitle ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                maxLength={200}
                style={titleInputStyle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
              />
              <button className="btn btn-primary" onClick={saveTitle} disabled={titleBusy} style={{ padding: "4px 10px" }}>
                {titleBusy ? "Saving…" : "Save"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setEditingTitle(false)}
                disabled={titleBusy}
                style={{ padding: "4px 10px" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <span
              role="button"
              tabIndex={0}
              onClick={startEditTitle}
              onKeyDown={(e) => e.key === "Enter" && startEditTitle()}
              title="Click to rename"
              style={{
                fontFamily: "var(--font-title)",
                fontWeight: 600,
                fontSize: 14,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <Sparkles size={14} color="var(--color-special)" />
              {title}
              <Pencil size={12} color="var(--color-muted-text)" />
            </span>
          )}
          <div className="page-subtitle" style={{ marginTop: 4 }}>
            {entry.stocks.length} stock{entry.stocks.length === 1 ? "" : "s"} analyzed
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="page-subtitle" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Clock size={12} />
            {formatDateTime(entry.createdAt)}
          </span>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDelete}
            disabled={deleting}
            aria-label={`Delete "${title}"`}
            style={{ padding: "4px 8px" }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        {segments.length > 1 && !editingText && (
          <div className="ai-history-tabs" style={{ flex: "1 1 auto" }}>
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
        {!editingText && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={startEditText}
            style={{ padding: "4px 10px", marginLeft: "auto" }}
          >
            <Pencil size={12} />
            Edit
          </button>
        )}
      </div>

      {editingText ? (
        <div style={{ marginTop: 12 }}>
          <textarea
            autoFocus
            rows={10}
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            style={textAreaStyle}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={saveText} disabled={textBusy}>
              {textBusy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditingText(false)}
              disabled={textBusy}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        active && (
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
        )
      )}

      {error && (
        <div className="notice notice-error" style={{ marginTop: 12 }}>
          {error}
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

  function handleDeleted(id) {
    setHistory((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1 className="page-title">AI Analysis History</h1>
          <p className="page-subtitle">
            Every "Analyze with AI" run from the Screener, latest first. Rename a run, switch between stock tabs, or
            edit the write-up directly.
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

      {history && history.map((entry) => <HistoryEntry key={entry.id} entry={entry} onDeleted={handleDeleted} />)}
    </section>
  );
}
