/**
 * Owner: Person 4 (Enrico) — Dashboard & Stock Report.
 * A stat card on the stock report showing the user's personal price target
 * and how far the current price is from it. Full CRUD via
 * /api/dashboard/target/* : set (create/update, an upsert), read, delete.
 * Display-only — deliberately no alerts (those are Person 5's watchlist).
 */
import { useEffect, useState } from "react";
import { colors, fonts, fontWeights } from "../theme";
import { getTarget, setTarget, deleteTarget } from "../api/personal";

const card = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: "14px 16px",
  flex: 1,
  minWidth: 160,
};
const labelStyle = { fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 12, color: colors.mutedText, marginBottom: 4 };
const valueStyle = { fontFamily: fonts.numeric, fontWeight: fontWeights.numeric, fontSize: 17, color: colors.darkMenu };
const inputStyle = {
  width: 90,
  fontFamily: fonts.numeric,
  fontSize: 14,
  padding: "4px 6px",
  borderRadius: 6,
  border: `1px solid ${colors.border}`,
  background: colors.lightBackground,
  color: colors.darkMenu,
};
const linkBtn = { background: "none", border: "none", cursor: "pointer", color: colors.clickable, fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 12, padding: 0 };

export default function PriceTargetCard({ exchangeCode, stockCode, currentPrice }) {
  const [target, setTargetState] = useState(null); // number | null
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getTarget(exchangeCode, stockCode)
      .then((data) => {
        if (!cancelled) setTargetState(data ? Number(data.targetPrice) : null);
      })
      .catch(() => {})
      .finally(() => {});
    return () => {
      cancelled = true;
    };
  }, [exchangeCode, stockCode]);

  async function handleSave() {
    const value = Number(draft);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a positive number");
      return;
    }
    try {
      await setTarget(exchangeCode, stockCode, value);
      setTargetState(value);
      setEditing(false);
      setDraft("");
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    try {
      await deleteTarget(exchangeCode, stockCode);
      setTargetState(null);
    } catch (err) {
      setError(err.message);
    }
  }

  // Distance from current price to target, if we have both.
  let distancePct = null;
  if (target != null && currentPrice != null && currentPrice > 0) {
    distancePct = ((target - currentPrice) / currentPrice) * 100;
  }

  return (
    <div style={card}>
      <div style={labelStyle}>Price Target</div>

      {editing ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number"
              step="0.01"
              min="0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={target != null ? String(target) : "0.00"}
              style={inputStyle}
              aria-label="Target price"
            />
            <button onClick={handleSave} style={linkBtn}>Save</button>
            <button onClick={() => { setEditing(false); setError(null); }} style={{ ...linkBtn, color: colors.mutedText }}>Cancel</button>
          </div>
          {error && <div style={{ fontFamily: fonts.description, fontSize: 11, color: colors.badNumber, marginTop: 4 }}>{error}</div>}
        </div>
      ) : target != null ? (
        <div>
          <div style={valueStyle}>{target.toFixed(2)}</div>
          {distancePct != null && (
            <div style={{ fontFamily: fonts.numeric, fontSize: 11, color: distancePct >= 0 ? colors.goodNumber : colors.badNumber, marginTop: 2 }}>
              {distancePct >= 0 ? "+" : ""}{distancePct.toFixed(1)}% to target
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button onClick={() => { setEditing(true); setDraft(String(target)); }} style={linkBtn}>Edit</button>
            <button onClick={handleDelete} style={{ ...linkBtn, color: colors.badNumber }}>Remove</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setEditing(true); setDraft(""); }} style={{ ...linkBtn, fontSize: 13 }}>
          + Set target
        </button>
      )}
    </div>
  );
}