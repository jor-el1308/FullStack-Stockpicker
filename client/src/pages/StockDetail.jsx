/**
 * Owner: Person 4 (Enrico) - Dashboard & Stock Report Page.
 * Fetches GET /api/stocks/:exchangeCode/:stockCode and
 * /api/stocks/:exchangeCode/:stockCode/prices, renders the closing price
 * graph and 52-week high/low (StockDetail typedef in shared/types/index.js).
 */
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
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
import { getStockDetail, getStockPrices } from "../api/stocks";

const NEUTRAL = { white: "#FFFFFF", border: "#E1E7F0", textMuted: "#5B6B85" };

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

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getStockDetail(exchangeCode, stockCode),
      getStockPrices(exchangeCode, stockCode),
    ])
      .then(([detailRes, pricesRes]) => {
        setDetail(detailRes);
        setPrices(pricesRes ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [exchangeCode, stockCode]);

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
          style={{ color: colors.clickable, background: "none", border: "none", cursor: "pointer", fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel }}
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
          color: colors.clickable,
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
          <div style={{ fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 22, color: colors.darkMenu }}>
            {detail.stockName}
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
              <Tooltip
                contentStyle={{ fontFamily: fonts.numeric, fontSize: 12, borderRadius: 8, border: `1px solid ${NEUTRAL.border}` }}
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
            {detail.fiftyTwoWeekHigh != null ? fmt(detail.fiftyTwoWeekHigh) : "—"}
          </div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>52W Low</div>
          <div style={{ ...statValue, color: colors.badNumber }}>
            {detail.fiftyTwoWeekLow != null ? fmt(detail.fiftyTwoWeekLow) : "—"}
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
      </div>
    </div>
  );
}
