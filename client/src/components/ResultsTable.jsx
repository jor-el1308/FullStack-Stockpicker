import { useEffect, useState } from "react";
import { colors, fonts } from "../theme";
import { labelFor, formatValue } from "../screener/criteria";

const DEFAULT_PAGE_SIZE = 15;

/**
 * Owner: Person 4 (Enrico) - Dashboard & Stock Report Page.
 * Renders the results table described in the requirement doc (section 5b):
 * Exchange, Stock Code, Stock Name, then one column per criteria value.
 * Shared by the Dashboard and the Screener so both stay visually consistent.
 *
 * Paginates client-side (rows are already loaded in memory from the
 * screener/dashboard fetch, so there's no reason to round-trip to the
 * server just to change page) - defaults to 15 rows/page, resets back to
 * page 1 whenever the `rows` prop changes (e.g. a new screen is run).
 *
 * Optional selection (checkboxes) support - used by the Screener page to let
 * users shortlist rows for AI analysis (Person 1, requirement doc section 6).
 * Off by default (no `selectable` prop) so Dashboard's read-only usage is
 * unaffected.
 *
 * @param {{ rows: import("../../../shared/types/index.js").ScreenerResultRow[], onRowClick?: (row) => void, emptyMessage?: string, pageSize?: number, selectable?: boolean, selectedKeys?: Set<string>, onToggleRow?: (row) => void }} props
 */
export default function ResultsTable({
  rows,
  onRowClick,
  emptyMessage,
  pageSize = DEFAULT_PAGE_SIZE,
  selectable = false,
  selectedKeys,
  onToggleRow,
}) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  if (rows.length === 0) {
    return (
      <p style={{ fontFamily: fonts.description, color: colors.mutedText ?? "#5B6B85", fontSize: 13 }}>
        {emptyMessage ?? "No results yet. Run the screener above."}
      </p>
    );
  }

  const criteriaKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.values))));
  const hasScore = rows.some((r) => r.score != null);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return (
    <>
      <table className="results-table">
        <thead>
          <tr>
            {selectable && <th style={{ width: 32 }} />}
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
          {pageRows.map((row) => {
            const rowKey = `${row.exchangeCode}-${row.stockCode}`;
            return (
              <tr
                key={rowKey}
                onClick={() => onRowClick?.(row)}
                style={{ cursor: onRowClick ? "pointer" : "default" }}
              >
                {selectable && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedKeys?.has(rowKey) ?? false}
                      onChange={() => onToggleRow?.(row)}
                      aria-label={`Select ${row.stockName}`}
                    />
                  </td>
                )}
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
            );
          })}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            padding: "12px 4px 4px",
            fontFamily: fonts.description,
            fontSize: 13,
            color: colors.mutedText ?? "#5B6B85",
          }}
        >
          <span>
            Showing {start + 1}–{Math.min(start + pageSize, rows.length)} of {rows.length}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={pagerButtonStyle(currentPage === 1)}
            >
              Previous
            </button>
            <span style={{ fontFamily: fonts.numeric, fontSize: 13, color: colors.darkMenu }}>
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={pagerButtonStyle(currentPage === totalPages)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function pagerButtonStyle(disabled) {
  return {
    padding: "6px 12px",
    borderRadius: 6,
    border: `1px solid ${colors.border ?? "#E1E7F0"}`,
    background: "#fff",
    color: disabled ? (colors.mutedText ?? "#5B6B85") : colors.darkMenu,
    fontFamily: fonts.description,
    fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

