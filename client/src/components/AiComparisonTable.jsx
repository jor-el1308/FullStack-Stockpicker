/**
 * Owner: Person 1 (Yong Wee) - Auth + AI Recommendation.
 * Renders the structured head-to-head comparison ai.service.js produces when
 * two or more stocks are shortlisted (mode: "comparison" from POST
 * /api/ai/analyze) - one row per criterion, one column per stock, with the
 * winning stock highlighted. Used by both Screener.jsx (a fresh run) and
 * AiHistory.jsx (a saved run, JSON.parsed back out of analysis_text).
 */
export default function AiComparisonTable({ comparison }) {
  const { stocks = [], criteria = [], summary, disclaimer } = comparison ?? {};
  if (stocks.length === 0 || criteria.length === 0) return null;

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table className="ai-comparison-table">
          <thead>
            <tr>
              <th>Criterion</th>
              {stocks.map((name) => (
                <th key={name}>{name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criteria.map((row, i) => (
              <tr key={`${row.name}-${i}`}>
                <td className="ai-comparison-criterion">{row.name}</td>
                {stocks.map((name, j) => (
                  <td key={name} className={row.winner === name ? "ai-comparison-winner" : undefined}>
                    {row.notes?.[j] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary && (
        <p
          style={{
            marginTop: 12,
            fontFamily: "var(--font-body)",
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--color-text)",
          }}
        >
          {summary}
        </p>
      )}

      {disclaimer && (
        <p className="page-subtitle" style={{ marginTop: 6 }}>
          {disclaimer}
        </p>
      )}
    </div>
  );
}
