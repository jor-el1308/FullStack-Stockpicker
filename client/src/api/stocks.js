import { colors, fonts } from "../theme";
import { labelFor, formatValue } from "../screener/criteria";

/**
 * Owner: Person 4 (Enrico) - Dashboard & Stock Report Page.
 * Renders the results table described in the requirement doc (section 5b):
 * Exchange, Stock Code, Stock Name, then one column per criteria value.
 * Shared by the Dashboard and the Screener so both stay visually consistent.
 *
 * @param {{ rows: import("../../../shared/types/index.js").ScreenerResultRow[], onRowClick?: (row) => void, emptyMessage?: string }} props
 */
export default function ResultsTable({ rows, onRowClick, emptyMessage }) {
  if (rows.length === 0) {
    return (
      <p style={{ fontFamily: fonts.description, color: colors.mutedText ?? "#5B6B85", fontSize: 13 }}>
        {emptyMessage ?? "No results yet. Run the screener above."}
      </p>
    );
  }

  const criteriaKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.values))));
  const hasScore = rows.some((r) => r.score != null);

  return (
    <table className="results-table">
      <thead>
        <tr>
          <th>Exchange</th>
          <th>Stock Code</th>
          <th>Stock Name</th>
          {criteriaKeys.map((key) => (
            <th key={key} className="numeric">
              {labelFor(key)}
            </th>
          ))}
          {hasScore && <th className="numeric">Score</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={`${row.exchangeCode}-${row.stockCode}`}
            onClick={() => onRowClick?.(row)}
            style={{ cursor: onRowClick ? "pointer" : "default" }}
          >
            <td>{row.exchangeCode}</td>
            <td className="numeric">{row.stockCode}</td>
            <td>{row.stockName}</td>
            {criteriaKeys.map((key) => {
              const value = row.values[key];
              return (
                <td
                  key={key}
                  className="numeric"
                  style={{ color: value != null && value < 0 ? colors.badNumber : colors.goodNumber }}
                >
                  {formatValue(key, value)}
                </td>
              );
            })}
            {hasScore && (
              <td className="numeric" style={{ color: colors.special }}>
                {row.score != null ? row.score : "—"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
