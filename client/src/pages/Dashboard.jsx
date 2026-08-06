/**
 * Owner: Person 4 (Enrico) - Dashboard & Stock Report Page.
 * Fetches screener results and renders them via ResultsTable.
 * Clicking a row navigates to /stock/:exchangeCode/:stockCode (StockDetail.jsx).
 *
 * Also owns the user's starred stocks: the star column in the results table
 * and the "Starred" section share this state, so starring from either place
 * updates both immediately.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { colors, fonts, fontWeights } from "../theme";
import ResultsTable from "../components/ResultsTable";
import StarredStocks from "../components/StarredStocks";
import { getStocks } from "../api/stocks";
import { listStarred, addStar, removeStar } from "../api/personal";

const NEUTRAL = { textMuted: "var(--color-muted-text)" };

const keyOf = (s) => `${s.exchangeCode}-${s.stockCode}`;

export default function Dashboard() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [starred, setStarred] = useState([]); // [{ exchangeCode, stockCode, stockName }]

  useEffect(() => {
    let cancelled = false;
    getStocks()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Load the user's starred stocks (best-effort; failure just leaves it empty).
    listStarred()
      .then((data) => {
        if (!cancelled) setStarred(data ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const starredKeys = useMemo(() => new Set(starred.map(keyOf)), [starred]);

  // Toggle used by both the results-table star column and the Starred section.
  async function toggleStar(row) {
    const key = keyOf(row);
    const isStarred = starredKeys.has(key);
    const prev = starred;
    if (isStarred) {
      setStarred((list) => list.filter((s) => keyOf(s) !== key));
      try {
        await removeStar(row.exchangeCode, row.stockCode);
      } catch {
        setStarred(prev);
      }
    } else {
      const item = { exchangeCode: row.exchangeCode, stockCode: row.stockCode, stockName: row.stockName };
      setStarred((list) => [item, ...list]);
      try {
        await addStar(row.exchangeCode, row.stockCode);
      } catch {
        setStarred(prev);
      }
    }
  }

  return (
    <section style={{ padding: 28 }}>
      <h1 style={{ fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 20, margin: "0 0 4px" }}>
        Dashboard
      </h1>
      <p style={{ fontFamily: fonts.description, fontWeight: fontWeights.description, fontSize: 13, color: NEUTRAL.textMuted, margin: "0 0 18px" }}>
        Screener results ranked by your saved criteria.
      </p>

      <StarredStocks items={starred} onUnstar={toggleStar} />

      {loading && (
        <p style={{ fontFamily: fonts.description, color: NEUTRAL.textMuted }}>Loading results…</p>
      )}

      {error && (
        <p style={{ fontFamily: fonts.description, color: colors.badNumber }}>
          Couldn't load screener results. {error}
        </p>
      )}

      {!loading && !error && (
        <ResultsTable
          rows={rows}
          onRowClick={(row) => navigate(`/stock/${row.exchangeCode}/${row.stockCode}`)}
          starredKeys={starredKeys}
          onToggleStar={toggleStar}
        />
      )}
    </section>
  );
}