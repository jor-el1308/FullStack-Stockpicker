/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine (saved screens).
 * Saved Screens: stores criteria sets in the database when logged in
 * (GET/POST/DELETE /api/auth/me/criteria-sets) with a localStorage fallback
 * for guests. "Run" loads a screen into the shared screener state and runs it.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Play, Trash2, Clock, Shield, TrendingUp, PieChart, Bookmark } from "lucide-react";
import { useScreener } from "../context/ScreenerContext";
import { useAuth } from "../context/AuthContext";
import { listSavedScreens, deleteScreen } from "../api/stocks";
import { describeRange } from "../screener/criteria";

const LOCAL_SCREENS_KEY = "localSavedScreens";

/** Pre-built starting points, mapped to criteria the backend understands. */
const TEMPLATES = [
  {
    id: "t1",
    name: "Conservative Income",
    description: "Established dividend payers with meaningful size and a track record.",
    icon: <Shield size={15} />,
    criteria: [
      { key: "marketCap", min: 5e9 },
      { key: "dividendCents", min: 20 },
      { key: "companyAgeYears", min: 15 },
    ],
  },
  {
    id: "t2",
    name: "Large-Cap Value",
    description: "Big companies trading at modest earnings multiples.",
    icon: <TrendingUp size={15} />,
    criteria: [
      { key: "marketCap", min: 10e9 },
      { key: "peRatio", min: 0, max: 15 },
      { key: "profitAfterTax", min: 5e8 },
    ],
  },
  {
    id: "t3",
    name: "Balanced Quality",
    description: "Profitable, reasonably valued companies across the market.",
    icon: <PieChart size={15} />,
    criteria: [
      { key: "marketCap", min: 1e9 },
      { key: "peRatio", min: 5, max: 25 },
      { key: "revenue", min: 1e9 },
      { key: "ebita", min: 0 },
    ],
  },
];

function readLocalScreens() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SCREENS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function ScreenCard({ screen, onRun, onDelete }) {
  const created = screen.createdAt ? new Date(screen.createdAt).toLocaleDateString() : "—";
  return (
    <div className="card screen-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 className="screen-card-name">{screen.name}</h3>
          <div className="screen-card-meta" style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Clock size={11} />
            Saved {created}
            {screen.local && <span className="chip chip-special" style={{ fontSize: 10, padding: "1px 8px" }}>browser only</span>}
          </div>
        </div>
        <span className="chip chip-accent numeric" style={{ fontSize: 11 }}>
          {screen.criteria.length} criteria
        </span>
      </div>
      <div className="screen-card-tags">
        {screen.criteria.map((c) => (
          <span key={c.key} className="chip" style={{ fontSize: 11 }}>
            {describeRange(c)}
          </span>
        ))}
      </div>
      <div className="screen-card-actions">
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => onRun(screen)}>
          <Play size={13} />
          Run
        </button>
        <button className="btn btn-danger" onClick={() => onDelete(screen)} aria-label={`Delete ${screen.name}`}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

export default function SavedScreens() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { loadScreen } = useScreener();

  const [dbScreens, setDbScreens] = useState([]);
  const [localScreens, setLocalScreens] = useState(readLocalScreens);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!user) {
      setDbScreens([]);
      return;
    }
    setLoading(true);
    listSavedScreens()
      .then(setDbScreens)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  const screens = useMemo(() => {
    const all = [...dbScreens, ...localScreens];
    const q = query.trim().toLowerCase();
    return q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all;
  }, [dbScreens, localScreens, query]);

  function handleRun(screen) {
    loadScreen(screen.criteria);
    navigate("/"); // Screener auto-runs when results are cleared
  }

  async function handleDelete(screen) {
    if (screen.local) {
      const next = localScreens.filter((s) => s.id !== screen.id);
      setLocalScreens(next);
      localStorage.setItem(LOCAL_SCREENS_KEY, JSON.stringify(next));
      return;
    }
    try {
      await deleteScreen(screen.id);
      setDbScreens((prev) => prev.filter((s) => s.id !== screen.id));
    } catch (err) {
      setError(err.message);
    }
  }

  function handleTemplate(template) {
    loadScreen(template.criteria);
    navigate("/");
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1 className="page-title">Saved Screens</h1>
          <p className="page-subtitle">Manage and re-run your saved criteria sets against the stock database.</p>
        </div>
        <span className="chip chip-good">
          {dbScreens.length + localScreens.length} screens saved
        </span>
      </div>

      {!user && (
        <p className="page-subtitle" style={{ marginBottom: 14 }}>
          You're not logged in — screens are stored in this browser only. <Link to="/login">Log in</Link> to save
          them to your account.
        </p>
      )}

      {error && (
        <div className="notice notice-error" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Search + stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div className="search-box">
          <Search size={14} style={{ color: "var(--color-muted-text)" }} />
          <input
            type="text"
            placeholder="Search saved screens…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <span className="page-subtitle">
              {screens.length} result{screens.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => navigate("/filters")}>
          <Bookmark size={14} />
          New Screen
        </button>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-label">Account screens</div>
          <div className="stat-value">
            {user ? dbScreens.length : "—"}
            <span className="stat-sub">{user ? "in database" : "log in to sync"}</span>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Browser screens</div>
          <div className="stat-value">
            {localScreens.length}
            <span className="stat-sub">this device</span>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Templates</div>
          <div className="stat-value">
            {TEMPLATES.length}
            <span className="stat-sub">pre-built</span>
          </div>
        </div>
      </div>

      {/* Saved screens grid */}
      <div className="section-label">
        Your Screens <span className="chip chip-accent">{screens.length}</span>
      </div>
      {loading ? (
        <p className="page-subtitle">Loading saved screens…</p>
      ) : screens.length > 0 ? (
        <div className="screen-grid">
          {screens.map((s) => (
            <ScreenCard key={s.id} screen={s} onRun={handleRun} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <div className="notice notice-muted">
          {query
            ? `No screens match "${query}".`
            : "No saved screens yet. Set up filters on the Screener and click Save Screen."}
        </div>
      )}

      {/* Templates */}
      <div className="section-label">
        Templates <span className="chip">Pre-built</span>
      </div>
      <p className="page-subtitle" style={{ margin: "-6px 0 12px" }}>
        Start from a curated criteria set — run it, tweak it in Advanced Filters, then save as your own.
      </p>
      <div className="screen-grid">
        {TEMPLATES.map((t) => (
          <div key={t.id} className="card screen-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "rgba(26, 92, 158, 0.08)",
                  color: "var(--color-clickable)",
                }}
              >
                {t.icon}
              </span>
              <div>
                <h3 className="screen-card-name">{t.name}</h3>
                <div className="screen-card-meta">Template</div>
              </div>
            </div>
            <p className="page-subtitle" style={{ margin: "10px 0 0" }}>
              {t.description}
            </p>
            <div className="screen-card-tags">
              {t.criteria.map((c) => (
                <span key={c.key} className="chip" style={{ fontSize: 11 }}>
                  {describeRange(c)}
                </span>
              ))}
            </div>
            <div className="screen-card-actions">
              <button
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => handleTemplate(t)}
              >
                <Play size={13} />
                Use Template
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
