/**
 * Owner: Person 4 (Enrico) - Dashboard & Stock Report Page.
 * Fetches GET /api/stocks/:exchangeCode/:stockCode and
 * /api/stocks/:exchangeCode/:stockCode/prices, renders the closing price
 * graph and 52-week high/low (StockDetail typedef in shared/types/index.js).
 */
import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, Star, Bell } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { colors, fonts, fontWeights } from "../theme";
import {
  getStockDetail,
  getStockPrices,
  listSavedScreens,
  listWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from "../api/stocks";
import { listStarred, addStar, removeStar } from "../api/personal";
import StockNotes from "../components/StockNotes";
import PriceTargetCard from "../components/PriceTargetCard";
import AddToWatchlistDialog, {
  readWatchlistDefaults,
  rememberWatchlistDefaults,
} from "../components/AddToWatchlistDialog";

const NEUTRAL = {
  white: "var(--color-surface)",
  border: "var(--color-border)",
  textMuted: "var(--color-muted-text)",
};

function fmt(n, d = 2) {
  return Number(n).toFixed(d);
}

function fmtCurrency(n) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

const statCard = {
  background: NEUTRAL.white,
  border: `1px solid ${NEUTRAL.border}`,
  borderRadius: 10,
  padding: "14px 16px",
  flex: 1,
  minWidth: 140,
};

const statLabel = { fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 12, color: NEUTRAL.textMuted, marginBottom: 4 };
const statValue = { fontFamily: fonts.numeric, fontWeight: fontWeights.numeric, fontSize: 17, color: colors.darkMenu };

export default function StockDetail() {
  const { exchangeCode, stockCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [detail, setDetail] = useState(null);
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [starred, setStarred] = useState(false);
  const requestSeq = useRef(0);

  // Watchlist (Person 5). Both the Screener and the Dashboard link into this
  // page, so putting the bell here covers "add the stock I'm actually looking
  // at" from either of them without a trip to the Watchlist page.
  const [watchItem, setWatchItem] = useState(null); // the watchlist row, if any
  const [savedScreens, setSavedScreens] = useState([]);
  const [watchDialogOpen, setWatchDialogOpen] = useState(false);
  const [watchSubmitting, setWatchSubmitting] = useState(false);
  const [watchDialogError, setWatchDialogError] = useState(null);
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchDefaults, setWatchDefaults] = useState(readWatchlistDefaults);

  // Screener ("/") and Dashboard ("/dashboard") both link here, so "back"
  // shouldn't be hard-coded to one of them - go back exactly one step in
  // history (wherever that actually was). location.key === "default" means
  // this page was the first thing loaded in the tab (e.g. a bookmarked/
  // shared /stock/... URL), where there's nothing to go back to, so fall
  // back to the dashboard in that case only.
  function handleBack() {
    if (location.key !== "default") {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  }

  // Screener ("/") and Dashboard both link here with a fresh exchangeCode/
  // stockCode each time, so a fast navigation between two stock pages could
  // otherwise let the slower request resolve last and overwrite state with
  // the wrong stock's data - requestSeq guards against that (same pattern
  // as ScreenerContext.jsx's runSeq).
  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    Promise.all([
      getStockDetail(exchangeCode, stockCode),
      getStockPrices(exchangeCode, stockCode),
    ])
      .then(([detailRes, pricesRes]) => {
        if (seq !== requestSeq.current) return;
        setDetail(detailRes);
        // Sort ascending by date so the chart reads left-to-right and the
        // current-price / day-change logic below (which treats the last
        // element as the most recent close) is correct no matter what order
        // the /prices endpoint returns rows in - it currently returns them
        // newest-first, which would otherwise reverse the chart.
        const ordered = [...(pricesRes ?? [])].sort((a, b) =>
          String(a.date).localeCompare(String(b.date))
        );
        setPrices(ordered);
      })
      .catch((err) => {
        if (seq === requestSeq.current) setError(err.message);
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [exchangeCode, stockCode]);

  // Is this stock currently starred? (drives the star toggle in the header)
  useEffect(() => {
    let cancelled = false;
    listStarred()
      .then((list) => {
        if (!cancelled) {
          setStarred((list ?? []).some((s) => s.exchangeCode === exchangeCode && s.stockCode === stockCode));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [exchangeCode, stockCode]);

  async function toggleStar() {
    const next = !starred;
    setStarred(next); // optimistic
    try {
      if (next) await addStar(exchangeCode, stockCode);
      else await removeStar(exchangeCode, stockCode);
    } catch {
      setStarred(!next); // roll back on failure
    }
  }

  // Is this stock already on the watchlist? Failures here are silent: the
  // watchlist is a side feature of this page, not what the user came for.
  useEffect(() => {
    let cancelled = false;
    Promise.all([listWatchlist().catch(() => []), listSavedScreens().catch(() => [])]).then(
      ([watchRows, screens]) => {
        if (cancelled) return;
        setWatchItem(
          (watchRows ?? []).find(
            (item) => item.exchange_code === exchangeCode && item.stock_code === stockCode
          ) ?? null
        );
        setSavedScreens(screens ?? []);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [exchangeCode, stockCode]);

  async function toggleWatch() {
    if (!watchItem) {
      setWatchDialogError(null);
      setWatchDialogOpen(true);
      return;
    }
    setWatchBusy(true);
    try {
      await removeFromWatchlist(watchItem.id);
      setWatchItem(null);
    } catch {
      // Leave the bell as-is; the Watchlist page will show the real state.
    } finally {
      setWatchBusy(false);
    }
  }

  async function submitWatch(values) {
    setWatchSubmitting(true);
    setWatchDialogError(null);
    try {
      const created = await addToWatchlist({
        exchangeCode,
        stockCode,
        savedCriteriaSetId: values.savedCriteriaSetId || undefined,
        channel: values.channel,
        recipientNumber: values.recipientNumber || undefined,
      });
      setWatchItem({
        id: created?.id,
        exchange_code: exchangeCode,
        stock_code: stockCode,
        channel: values.channel,
      });
      setWatchDefaults(values);
      rememberWatchlistDefaults(values);
      setWatchDialogOpen(false);
    } catch (err) {
      setWatchDialogError(err.message || "Unable to add stock to watchlist.");
    } finally {
      setWatchSubmitting(false);
    }
  }

  if (loading) {
    return <div style={{ fontFamily: fonts.description, color: NEUTRAL.textMuted, padding: 28 }}>Loading stock…</div>;
  }

  if (error || !detail) {
    return (
      <div style={{ padding: 28, fontFamily: fonts.description }}>
        <div style={{ color: colors.badNumber, marginBottom: 12 }}>
          Couldn't load {exchangeCode}:{stockCode}. {error}
        </div>
        <button
          onClick={handleBack}
          style={{ color: colors.link, background: "none", border: "none", cursor: "pointer", fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel }}
        >
          Back to results
        </button>
      </div>
    );
  }

  const hasPrices = prices.length >= 2;
  const latest = hasPrices ? prices[prices.length - 1] : null;
  const prev = hasPrices ? prices[prices.length - 2] : null;
  const dayChange = hasPrices ? latest.close - prev.close : null;
  const dayChangePct = hasPrices ? (dayChange / prev.close) * 100 : null;
  const isUp = dayChange !== null ? dayChange >= 0 : true;

  // 52-week high/low: prefer the value from the backend if it ever provides
  // one, otherwise derive it from the price history we already fetched for the
  // chart. Uses the last 365 days (falls back to all available prices), and
  // each day's intraday high/low when present, else the close.
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const window52w = prices.filter((p) => new Date(p.date).getTime() >= yearAgo);
  const priceWindow = window52w.length > 0 ? window52w : prices;
  const computedHigh = priceWindow.length
    ? Math.max(...priceWindow.map((p) => p.high ?? p.close))
    : null;
  const computedLow = priceWindow.length
    ? Math.min(...priceWindow.map((p) => p.low ?? p.close))
    : null;
  const fiftyTwoWeekHigh = detail.fiftyTwoWeekHigh ?? computedHigh;
  const fiftyTwoWeekLow = detail.fiftyTwoWeekLow ?? computedLow;

  // Financials come as one row per fiscal year - use the two most recent for YoY revenue growth.
  const financials = [...(detail.financials ?? [])].sort((a, b) => a.year - b.year);
  const latestFinancials = financials[financials.length - 1];
  const priorFinancials = financials[financials.length - 2];
  const revenueGrowthPct =
    latestFinancials && priorFinancials && priorFinancials.revenue
      ? ((latestFinancials.revenue - priorFinancials.revenue) / priorFinancials.revenue) * 100
      : null;

  const dividends = [...(detail.dividends ?? [])].sort((a, b) => a.year - b.year);
  const latestDividend = dividends[dividends.length - 1];

  return (
    <div style={{ padding: 28 }}>
      <button
        onClick={handleBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          color: colors.link,
          fontFamily: fonts.titleLabel,
          fontWeight: fontWeights.titleLabel,
          fontSize: 13,
          cursor: "pointer",
          padding: 0,
          marginBottom: 18,
        }}
      >
        <ArrowLeft size={15} /> Back to results
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 22, color: colors.darkMenu }}>
              {detail.stockName}
            </div>
            <button
              onClick={toggleStar}
              aria-label={starred ? "Unstar this stock" : "Star this stock"}
              title={starred ? "Unstar" : "Star this stock"}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2, color: colors.special }}
            >
              <Star size={20} fill={starred ? colors.special : "none"} />
            </button>
            <button
              onClick={toggleWatch}
              disabled={watchBusy}
              aria-label={watchItem ? "Remove this stock from your watchlist" : "Add this stock to your watchlist"}
              title={watchItem ? "On your watchlist - click to remove" : "Add to watchlist"}
              style={{
                background: "none",
                border: "none",
                cursor: watchBusy ? "progress" : "pointer",
                display: "flex",
                padding: 2,
                opacity: watchBusy ? 0.45 : 1,
                color: watchItem ? colors.link : colors.mutedText,
              }}
            >
              <Bell size={20} fill={watchItem ? colors.link : "none"} />
            </button>
          </div>
          <div style={{ fontFamily: fonts.numeric, fontWeight: fontWeights.numeric, fontSize: 13, color: NEUTRAL.textMuted, marginTop: 4 }}>
            {detail.exchangeCode}:{detail.stockCode}
          </div>
        </div>
        {hasPrices && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: fonts.numeric, fontWeight: 500, fontSize: 30, color: colors.darkMenu }}>
              {fmt(latest.close)}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 4,
                color: isUp ? colors.goodNumber : colors.badNumber,
                fontFamily: fonts.numeric,
                fontWeight: fontWeights.numeric,
                fontSize: 13,
              }}
            >
              {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {isUp ? "+" : ""}
              {fmt(dayChange)} ({fmt(dayChangePct)}%)
            </div>
          </div>
        )}
      </div>

      <div style={{ background: NEUTRAL.white, border: `1px solid ${NEUTRAL.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ ...statLabel, marginBottom: 8 }}>CLOSING PRICE</div>
        {hasPrices ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={prices} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={NEUTRAL.border} vertical={false} />
              <XAxis dataKey="date" tick={false} axisLine={{ stroke: NEUTRAL.border }} />
              <YAxis
                tick={{ fontFamily: fonts.numeric, fontSize: 11, fill: NEUTRAL.textMuted }}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              {/* Recharts defaults the tooltip card to white; without these it
                  stayed white in dark mode while its text followed the theme
                  and turned near-white too. */}
              <Tooltip
                contentStyle={{
                  fontFamily: fonts.numeric,
                  fontSize: 12,
                  borderRadius: 8,
                  border: `1px solid ${NEUTRAL.border}`,
                  background: NEUTRAL.white,
                  color: colors.darkMenu,
                }}
                labelStyle={{ color: NEUTRAL.textMuted }}
                itemStyle={{ color: colors.darkMenu }}
                labelFormatter={(d) => d}
                formatter={(v) => [fmt(v), "Close"]}
              />
              <Line type="monotone" dataKey="close" stroke={colors.clickable} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ fontFamily: fonts.description, color: NEUTRAL.textMuted, padding: "20px 0" }}>
            No price history available yet.
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={statCard}>
          <div style={statLabel}>52W High</div>
          <div style={{ ...statValue, color: colors.goodNumber }}>
            {fiftyTwoWeekHigh != null ? fmt(fiftyTwoWeekHigh) : "—"}
          </div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>52W Low</div>
          <div style={{ ...statValue, color: colors.badNumber }}>
            {fiftyTwoWeekLow != null ? fmt(fiftyTwoWeekLow) : "—"}
          </div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>Market Cap</div>
          <div style={statValue}>
            {detail.latestMarketCap != null ? fmtCurrency(detail.latestMarketCap) : "—"}
          </div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>Revenue ({latestFinancials?.year ?? "—"})</div>
          <div style={statValue}>
            {latestFinancials ? fmtCurrency(latestFinancials.revenue) : "—"}
          </div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>Revenue Growth YoY</div>
          <div style={{ ...statValue, color: revenueGrowthPct == null ? colors.darkMenu : revenueGrowthPct >= 0 ? colors.goodNumber : colors.badNumber }}>
            {revenueGrowthPct != null ? `${revenueGrowthPct >= 0 ? "+" : ""}${fmt(revenueGrowthPct, 1)}%` : "—"}
          </div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>Dividend ({latestDividend?.year ?? "—"})</div>
          <div style={statValue}>
            {latestDividend ? `${fmt(latestDividend.dividendCents / 100)}` : "—"}
          </div>
        </div>
        <PriceTargetCard
          exchangeCode={detail.exchangeCode}
          stockCode={detail.stockCode}
          currentPrice={hasPrices ? latest.close : null}
        />
      </div>

      <StockNotes exchangeCode={detail.exchangeCode} stockCode={detail.stockCode} />

      {watchDialogOpen && (
        <AddToWatchlistDialog
          stock={{ exchangeCode, stockCode, stockName: detail.stockName }}
          savedScreens={savedScreens}
          defaults={watchDefaults}
          submitting={watchSubmitting}
          error={watchDialogError}
          onSubmit={submitWatch}
          onClose={() => {
            setWatchDialogOpen(false);
            setWatchDialogError(null);
          }}
        />
      )}
    </div>
  );
}