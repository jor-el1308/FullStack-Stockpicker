/**
 * Owner: Person 2 (Charles) - Admin Dashboard.
 *
 * Minimal CSV builder for admin export endpoints (users.csv, payments.csv -
 * see admin.service.js/admin.controller.js). No dependency added for this -
 * CSV is a simple enough format that a small hand-rolled escaper is safer
 * than pulling in a library for two export endpoints.
 *
 * Uses CRLF line endings (per RFC 4180) since that's what Excel expects -
 * some versions mis-render bare LF as one long line.
 */

/**
 * Escapes a single value for CSV: wraps in double quotes if it contains a
 * comma, quote, or newline, doubling up any embedded quotes. Leaves
 * numbers/booleans/null alone (stringified, no quoting needed).
 *
 * Also neutralizes "CSV/formula injection": a value starting with =, +, -,
 * or @ (e.g. a user-supplied name like `=cmd|'/c calc'!A1`) is interpreted
 * by Excel/Sheets as a formula when the file is opened, not as literal
 * text. Prefixing with a tab keeps the displayed value effectively
 * unchanged but stops it from being parsed as a formula.
 * @param {*} value
 */
function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  let str = String(value);
  if (/^[=+\-@]/.test(str)) {
    str = `\t${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * @param {Array<{ key: string, header: string }>} columns
 * @param {Array<Record<string, *>>} rows
 * @returns {string} CSV text, including a header row
 */
export function toCsv(columns, rows) {
  const headerLine = columns.map((col) => escapeCsvValue(col.header)).join(",");
  const dataLines = rows.map((row) => columns.map((col) => escapeCsvValue(row[col.key])).join(","));
  return [headerLine, ...dataLines].join("\r\n") + "\r\n";
}
