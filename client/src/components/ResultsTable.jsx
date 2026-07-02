import { colors, fonts } from "../theme";

/**
 * Owner: Person 4 (Enrico) - Dashboard & Stock Report Page.
 * Renders the results table described in the requirement doc (section 5b):
 * Exchange, Stock Code, Stock Name, then one column per criteria value.
 *
 * @param {{ rows: import("../../../shared/types/index.js").ScreenerResultRow[] }} props
 */
export default function ResultsTable({ rows }) {
  if (rows.length === 0) {
    return <p style={{ fontFamily: fonts.description }}>No results yet. Run the screener above.</p>;
  }

  const criteriaKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.values))));

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ fontFamily: fonts.titleLabel, textAlign: "left" }}>
          <th>Exchange</th>
          <th>Stock Code</th>
          <th>Stock Name</th>
          {criteriaKeys.map((key) => (
            <th key={key}>{key}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.exchangeCode}-${row.stockCode}`}>
            <td>{row.exchangeCode}</td>
            <td className="numeric">{row.stockCode}</td>
            <td>{row.stockName}</td>
            {criteriaKeys.map((key) => {
              const value = row.values[key];
              return (
                <td key={key} className="numeric" style={{ color: value && value < 0 ? colors.badNumber : colors.goodNumber }}>
                  {value ?? "-"}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
