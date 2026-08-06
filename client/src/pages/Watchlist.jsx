import { useEffect, useMemo, useState } from "react";
import { Bell, Plus, Trash2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { addToWatchlist, listWatchlist, removeFromWatchlist, listSavedScreens, runScreener } from "../api/stocks";
import { determineWatchlistStatus } from "../utils/watchlistStatus";
import { EXCHANGES } from "../screener/criteria";

const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "email", label: "Email" },
];

export default function Watchlist() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [savedScreens, setSavedScreens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    exchangeCode: "",
    stockCode: "",
    savedCriteriaSetId: "",
    channel: "whatsapp",
    recipientNumber: "",
  });
  const [statusById, setStatusById] = useState({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [hoveredScreenId, setHoveredScreenId] = useState(null);

  const statusMeta = useMemo(
    () => ({
      pass: {
        label: "Pass",
        chip: "chip chip-good",
        icon: <CheckCircle2 size={14} />,
        hint: "Still matches your saved criteria.",
      },
      fail: {
        label: "Fail",
        chip: "chip chip-special",
        icon: <XCircle size={14} />,
        hint: "No longer meets your saved criteria — your alert channel is ready for the drop-out event.",
      },
      needsCriteria: {
        label: "Needs criteria",
        chip: "chip",
        icon: <AlertTriangle size={14} />,
        hint: "Attach a saved screen to evaluate this stock.",
      },
      unknown: {
        label: "Checking",
        chip: "chip",
        icon: <Bell size={14} />,
        hint: "Status is being checked against the latest screener results.",
      },
    }),
    []
  );

  async function refreshWatchlist() {
    if (!user) {
      setItems([]);
      setSavedScreens([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [watchlistRows, screens] = await Promise.all([listWatchlist(), listSavedScreens()]);
      setItems(watchlistRows ?? []);
      setSavedScreens(screens ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshWatchlist();
  }, [user]);

  useEffect(() => {
    if (!user || items.length === 0) {
      setStatusById({});
      return;
    }

    let active = true;
    async function evaluateStatuses() {
      setStatusLoading(true);
      const nextStatuses = {};
      for (const item of items) {
        const selectedScreen = savedScreens.find((screen) => screen.id === item.saved_criteria_set_id);
        const criteria = selectedScreen?.criteria ?? [];

        if (!criteria.length) {
          nextStatuses[item.id] = "needs-criteria";
          continue;
        }

        try {
          const data = await runScreener({ criteria });
          const status = determineWatchlistStatus(item.exchange_code, item.stock_code, data?.results ?? []);
          nextStatuses[item.id] = status;
        } catch {
          nextStatuses[item.id] = "unknown";
        }
      }

      if (active) {
        setStatusById(nextStatuses);
        setStatusLoading(false);
      }
    }

    evaluateStatuses();
    return () => {
      active = false;
    };
  }, [items, savedScreens, user]);

  const summary = useMemo(() => {
    const total = items.length;
    const passed = Object.values(statusById).filter((value) => value === "pass").length;
    const failed = Object.values(statusById).filter((value) => value === "fail").length;
    return { total, passed, failed };
  }, [items.length, statusById]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!user) return;

    const exchangeCode = form.exchangeCode.trim().toUpperCase();
    const stockCode = form.stockCode.trim().toUpperCase();
    if (!exchangeCode || !stockCode) {
      setError("Enter both an exchange and a stock code.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await addToWatchlist({
        exchangeCode,
        stockCode,
        savedCriteriaSetId: form.savedCriteriaSetId || undefined,
        channel: form.channel,
        recipientNumber: form.recipientNumber || undefined,
      });
      setForm({ exchangeCode: "", stockCode: "", savedCriteriaSetId: "", channel: form.channel, recipientNumber: "" });
      await refreshWatchlist();
    } catch (err) {
      setError(err.message || "Unable to add stock to watchlist.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(itemId) {
    setError(null);
    try {
      await removeFromWatchlist(itemId);
      setItems((current) => current.filter((item) => item.id !== itemId));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1 className="page-title">Watchlist</h1>
          <p className="page-subtitle">
            Track stocks against your saved criteria and surface pass/fail status at a glance.
          </p>
        </div>
        <span className="chip chip-accent">{summary.total} tracked</span>
      </div>

      {!user ? (
        <div className="notice notice-muted" style={{ marginBottom: 14 }}>
          Sign in to add stocks and keep your watchlist synced to the database.
        </div>
      ) : null}

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-label">Watching</div>
          <div className="stat-value">{summary.total}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Passing</div>
          <div className="stat-value">{summary.passed}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Failing</div>
          <div className="stat-value">{summary.failed}</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Bell size={16} color="var(--color-clickable)" />
          <h2 style={{ margin: 0, fontSize: 16 }}>Add a stock</h2>
        </div>
        <form onSubmit={handleAdd} className="watchlist-form-grid">
          <label className="watchlist-field">
            <span>Exchange</span>
            <select
              value={form.exchangeCode}
              onChange={(e) => setForm((current) => ({ ...current, exchangeCode: e.target.value }))}
            >
              <option value="">Select exchange</option>
              {EXCHANGES.map((exchange) => (
                <option key={exchange} value={exchange}>
                  {exchange}
                </option>
              ))}
            </select>
          </label>
          <label className="watchlist-field">
            <span>Stock code</span>
            <input
              value={form.stockCode}
              onChange={(e) => setForm((current) => ({ ...current, stockCode: e.target.value }))}
              placeholder="AAPL"
            />
          </label>
          <label className="watchlist-field">
            <span>Saved criteria</span>
            <select
              value={form.savedCriteriaSetId}
              onChange={(e) => setForm((current) => ({ ...current, savedCriteriaSetId: e.target.value }))}
            >
              <option value="">None selected</option>
              {savedScreens.map((screen) => (
                <option key={screen.id} value={screen.id}>
                  {screen.name}
                </option>
              ))}
            </select>
          </label>
          <label className="watchlist-field">
            <span>Alert channel</span>
            <select
              value={form.channel}
              onChange={(e) => setForm((current) => ({ ...current, channel: e.target.value }))}
            >
              {CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="watchlist-field">
            <span>WhatsApp number</span>
            <input
              value={form.recipientNumber}
              onChange={(e) => setForm((current) => ({ ...current, recipientNumber: e.target.value }))}
              placeholder="+6591234567"
            />
          </label>
          <div className="watchlist-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting || !user}>
              <Plus size={14} />
              {submitting ? "Adding…" : "Add to watchlist"}
            </button>
            <span className="page-subtitle">
              {savedScreens.length > 0
                ? "Choose a saved screen to evaluate pass/fail against the live data."
                : "Create a saved screen first in Saved Screens to enable live evaluation."}
            </span>
          </div>
        </form>
      </div>

      {error ? <div className="notice notice-error" style={{ marginBottom: 14 }}>{error}</div> : null}

      {loading ? (
        <p className="page-subtitle">Loading your watchlist…</p>
      ) : items.length === 0 ? (
        <div className="notice notice-muted">No stocks on your watchlist yet. Add one above to start tracking.</div>
      ) : (
        <div className="watchlist-grid">
          {items.map((item) => {
            const status = statusById[item.id] ?? "unknown";
            const selectedScreen = savedScreens.find((screen) => screen.id === item.saved_criteria_set_id);
            const statusMeta = {
              pass: {
                label: "Pass",
                chip: "chip chip-good",
                icon: <CheckCircle2 size={14} />,
                hint: "Still matches your saved criteria.",
              },
              fail: {
                label: "Fail",
                chip: "chip chip-special",
                icon: <XCircle size={14} />,
                hint: "No longer meets your saved criteria — your alert channel is ready for the drop-out event.",
              },
              needsCriteria: {
                label: "Needs criteria",
                chip: "chip",
                icon: <AlertTriangle size={14} />,
                hint: "Attach a saved screen to evaluate this stock.",
              },
              unknown: {
                label: "Checking",
                chip: "chip",
                icon: <Bell size={14} />,
                hint: "Status is being checked against the latest screener results.",
              },
            }[status];

            return (
              <div key={item.id} className="card watchlist-card">
                <div className="watchlist-item-header">
                  <div>
                    <h3 className="screen-card-name">{item.stock_name ?? `${item.exchange_code}:${item.stock_code}`}</h3>
                    <div className="screen-card-meta">
                      {item.exchange_code}:{item.stock_code}
                    </div>
                  </div>
                  <span className={statusMeta?.chip ?? "chip"}>
                    {statusMeta?.icon ?? <Bell size={14} />}
                    {statusMeta?.label ?? "Checking"}
                  </span>
                </div>

                <div className="watchlist-meta-row" style={{ position: "relative" }}>
                  <span className="chip chip-accent">{CHANNEL_OPTIONS.find((option) => option.value === item.channel)?.label ?? item.channel}</span>
                  {selectedScreen ? (
                    <div
                      className="saved-screen-chip-wrapper"
                      onMouseEnter={() => setHoveredScreenId(item.id)}
                      onMouseLeave={() => setHoveredScreenId(null)}
                    >
                      <span className="chip" style={{ cursor: "help" }}>
                        {selectedScreen.name}
                      </span>
                      {hoveredScreenId === item.id ? (
                        <div
                          className="saved-screen-tooltip"
                          onMouseEnter={() => setHoveredScreenId(item.id)}
                          onMouseLeave={() => setHoveredScreenId(null)}
                        >
                          {selectedScreen.criteria?.length ? (
                            <div className="saved-screen-tooltip-body">
                              {selectedScreen.criteria.map((criterion) => {
                                const formatValue = (value) =>
                                  typeof value === "number" ? value.toFixed(1) : value;
                                const parts = [];
                                if (criterion.min != null) parts.push(`>= ${formatValue(criterion.min)}`);
                                if (criterion.max != null) parts.push(`<= ${formatValue(criterion.max)}`);
                                const rangeText = parts.join(" and ");
                                return (
                                  <div
                                    key={`${criterion.key}-${criterion.min ?? "-"}-${criterion.max ?? "-"}`}
                                    className="saved-screen-tooltip-line"
                                  >
                                    <span className="saved-screen-tooltip-key">{criterion.key}</span>
                                    <span>{rangeText || "set"}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="saved-screen-tooltip-body">No filter details available</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="chip">No saved screen</span>
                  )}
                </div>

                <p className="page-subtitle" style={{ marginTop: 10 }}>
                  {statusMeta?.hint ?? "Status is being checked against the latest screener results."}
                </p>

                {statusLoading ? (
                  <div className="watchlist-progress">Refreshing status…</div>
                ) : null}

                <div className="watchlist-card-actions">
                  <button className="btn btn-danger" onClick={() => handleRemove(item.id)}>
                    <Trash2 size={13} />
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
