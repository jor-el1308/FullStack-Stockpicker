/**
 * Client-side metadata for every criterion the backend filter engine
 * understands (see server/src/services/screener.service.js CRITERIA_DEFS).
 *
 * `scale` converts between UI units and the raw DB values sent to the API
 * (e.g. the UI edits Market Cap in $B, the API expects dollars).
 */
export const CRITERIA_META = {
  marketCap: {
    label: "Market Cap",
    section: "Size & Valuation",
    tooltip: "Latest market capitalisation. Filter out companies below/above a size.",
    unit: "$B",
    scale: 1e9,
    slider: { min: 0, max: 500, step: 1 },
  },
  peRatio: {
    label: "P/E Ratio",
    section: "Size & Valuation",
    tooltip: "Market cap ÷ latest profit after tax. Lower can mean cheaper relative to earnings.",
    unit: "×",
    scale: 1,
    slider: { min: 0, max: 100, step: 0.5 },
  },
  revenue: {
    label: "Revenue",
    section: "Profitability",
    tooltip: "Latest fiscal-year total revenue.",
    unit: "$B",
    scale: 1e9,
    slider: { min: 0, max: 300, step: 1 },
  },
  profitBeforeTax: {
    label: "Profit Before Tax",
    section: "Profitability",
    tooltip: "Latest fiscal-year profit before tax.",
    unit: "$B",
    scale: 1e9,
    slider: { min: -10, max: 100, step: 0.5 },
  },
  profitAfterTax: {
    label: "Profit After Tax",
    section: "Profitability",
    tooltip: "Latest fiscal-year profit after tax (net income).",
    unit: "$B",
    scale: 1e9,
    slider: { min: -10, max: 100, step: 0.5 },
  },
  ebita: {
    label: "EBITA",
    section: "Profitability",
    tooltip: "Earnings before interest, taxes and amortisation, latest fiscal year.",
    unit: "$B",
    scale: 1e9,
    slider: { min: -10, max: 100, step: 0.5 },
  },
  dividendCents: {
    label: "Dividend",
    section: "Income & Stability",
    tooltip: "Dividend declared for the latest year, in cents per share.",
    unit: "¢",
    scale: 1,
    slider: { min: 0, max: 300, step: 1 },
  },
  companyAgeYears: {
    label: "Company Age",
    section: "Income & Stability",
    tooltip: "Years since listing. Screens out young, unproven companies.",
    unit: "yrs",
    scale: 1,
    slider: { min: 0, max: 100, step: 1 },
  },
};

export const SECTIONS = ["Size & Valuation", "Profitability", "Income & Stability"];

export const EXCHANGES = ["SGX", "NYSE", "NASDAQ"];
export const DEFAULT_EXCLUDED_SECTORS = ["Gambling", "Tobacco"];

export function labelFor(key) {
  return CRITERIA_META[key]?.label ?? key;
}

/** Compact display for a raw (API-unit) value of a criterion. */
export function formatValue(key, raw) {
  if (raw == null || Number.isNaN(Number(raw))) return "—";
  const n = Number(raw);
  switch (key) {
    case "marketCap":
    case "revenue":
    case "profitBeforeTax":
    case "profitAfterTax":
    case "ebita":
      return formatMoney(n);
    case "peRatio":
      return `${n.toFixed(1)}×`;
    case "dividendCents":
      return `${n.toFixed(0)}¢`;
    case "companyAgeYears":
      return `${n.toFixed(0)} yrs`;
    default:
      return String(n);
  }
}

export function formatMoney(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toLocaleString()}`;
}

/** Short human summary of one CriteriaRange, e.g. "P/E ≤ 35×" — used for chips. */
export function describeRange(range) {
  const meta = CRITERIA_META[range.key];
  const label = meta?.label ?? range.key;
  const fmt = (v) => formatValue(range.key, v);
  const hasMin = range.min != null && range.min !== "";
  const hasMax = range.max != null && range.max !== "";
  if (hasMin && hasMax) return `${label} ${fmt(range.min)}–${fmt(range.max)}`;
  if (hasMin) return `${label} ≥ ${fmt(range.min)}`;
  if (hasMax) return `${label} ≤ ${fmt(range.max)}`;
  return label;
}
