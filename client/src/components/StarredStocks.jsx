/**
 * Owner: Person 4 (Enrico) - Dashboard & Stock Report.
 * The "Starred" section on the dashboard. Presentational: the Dashboard owns
 * the starred list (so the results table and this section stay in sync) and
 * passes it in via `items`, plus an `onUnstar` handler. Renders nothing when
 * there are no starred stocks.
 */
import { useNavigate } from "react-router-dom";
import { Star, X } from "lucide-react";
import { colors, fonts, fontWeights } from "../theme";

export default function StarredStocks({ items = [], onUnstar }) {
  const navigate = useNavigate();

  if (!items.length) return null;

  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <Star size={15} color={colors.special} fill={colors.special} />
        <h2 style={{ fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 14, margin: 0, color: colors.darkMenu }}>
          Starred
        </h2>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {items.map((item) => (
          <div
            key={`${item.exchangeCode}-${item.stockCode}`}
            onClick={() => navigate(`/stock/${item.exchangeCode}/${item.stockCode}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(`/stock/${item.exchangeCode}/${item.stockCode}`);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`View ${item.stockName ?? item.stockCode}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 10,
              padding: "10px 12px",
              cursor: "pointer",
              minWidth: 180,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 13, color: colors.darkMenu }}>
                {item.stockName ?? item.stockCode}
              </div>
              <div style={{ fontFamily: fonts.numeric, fontSize: 11, color: colors.mutedText, marginTop: 2 }}>
                {item.exchangeCode}:{item.stockCode}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUnstar?.(item);
              }}
              aria-label={`Unstar ${item.stockName ?? item.stockCode}`}
              title="Unstar"
              style={{ background: "none", border: "none", cursor: "pointer", color: colors.mutedText, display: "flex", padding: 2 }}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}