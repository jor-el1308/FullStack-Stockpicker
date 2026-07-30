/**
 * Top-bar ticker tape - an auto-scrolling marquee of the biggest stocks with
 * their latest price, day-over-day change, and a tiny sparkline (green when the
 * close is up on the previous day, red when it's down). Fills the empty left
 * side of the top bar (see App.jsx's TopBar / .app-topbar in index.css).
 *
 * Data comes from GET /api/stocks/ticker (server/src/services/
 * stockLookup.service.js#getTickerTape), which returns everything the strip
 * needs in one request. Clicking an item deep-links to that stock's detail page.
 *
 * The scroll is pure CSS (.ticker-track animation in index.css); we render the
 * item list twice back-to-back so the -50% translate loops seamlessly.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTickerTape } from "../api/stocks";

// Small inline sparkline. `values` is oldest-first closes; `up` picks the color.
function Sparkline({ values, up }) {
  const width = 56;
  const height = 20;
  if (!values || values.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1; // avoid divide-by-zero on a flat line
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = up ? "var(--color-good)" : "var(--color-bad)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function fmtPrice(price, currency) {
  if (price == null) return "—";
  try {
    return price.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 2 });
  } catch {
    // Unknown/blank currency code - fall back to a plain number.
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

function TickerItem({ stock, onClick }) {
  const up = stock.change >= 0;
  const pct = `${up ? "+" : ""}${stock.changePct.toFixed(2)}%`;
  return (
    <button type="button" className="ticker-item" onClick={onClick}>
      <span className="ticker-symbol">{stock.stockCode}</span>
      <span className="ticker-price">{fmtPrice(stock.price, stock.currency)}</span>
      <Sparkline values={stock.spark} up={up} />
      <span className={`ticker-change ${up ? "up" : "down"}`}>
        <i className={`bi ${up ? "bi-caret-up-fill" : "bi-caret-down-fill"}`} />
        {pct}
      </span>
    </button>
  );
}

export default function TickerTape() {
  const [stocks, setStocks] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getTickerTape()
      .then((rows) => {
        if (active) setStocks(rows.filter((r) => r.price != null));
      })
      .catch(() => {
        // Non-critical decoration - if it fails, just render nothing.
        if (active) setStocks([]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (stocks.length === 0) return null;

  // Duplicate the list so the CSS -50% translate loops with no visible seam.
  const loop = [...stocks, ...stocks];

  return (
    <div className="ticker-tape" aria-label="Live stock ticker">
      <div className="ticker-track">
        {loop.map((stock, i) => (
          <TickerItem
            key={`${stock.exchangeCode}:${stock.stockCode}:${i}`}
            stock={stock}
            onClick={() => navigate(`/stock/${stock.exchangeCode}/${stock.stockCode}`)}
          />
        ))}
      </div>
    </div>
  );
}
