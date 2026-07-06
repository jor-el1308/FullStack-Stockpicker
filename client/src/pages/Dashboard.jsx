/**
 * Owner: Person 4 (Enrico) - Dashboard & Stock Report Page.
 * Fetches screener results and renders them via ResultsTable.
 * Clicking a row navigates to /stock/:exchangeCode/:stockCode (StockDetail.jsx).
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fonts, fontWeights } from "../theme";
import ResultsTable from "../components/ResultsTable";
import { getStocks } from "../api/stocks";

const NEUTRAL = { textMuted: "#5B6B85", bad: "#D16B6B" };

export default function Dashboard() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getStocks()
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section style={{ padding: 28 }}>
      <h1 style={{ fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 20, margin: "0 0 4px" }}>
        Dashboard
      </h1>
      <p style={{ fontFamily: fonts.description, fontWeight: fontWeights.description, fontSize: 13, color: NEUTRAL.textMuted, margin: "0 0 18px" }}>
        Screener results ranked by your saved criteria.
      </p>

      {loading && (
        <p style={{ fontFamily: fonts.description, color: NEUTRAL.textMuted }}>Loading results…</p>
      )}

      {error && (
        <p style={{ fontFamily: fonts.description, color: NEUTRAL.bad }}>
          Couldn't load screener results. {error}
        </p>
      )}

      {!loading && !error && (
        <ResultsTable
          rows={rows}
          onRowClick={(row) => navigate(`/stock/${row.exchangeCode}/${row.stockCode}`)}
        />
      )}
    </section>
  );
}