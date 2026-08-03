/**
 * Client-side metadata for every criterion the backend filter engine
 * understands (see server/src/services/screener.service.js CRITERIA_DEFS).
 *
 * `scale` converts between UI units and the raw DB values sent to the API
 * (e.g. the UI edits Market Cap in $B, the API expects dollars).
 *
 * `ticks` are the slider's stop points, in UI units. The sliders move from
 * tick to tick rather than over a raw linear range: dragging a linear 0-500
 * $B slider makes everything under ~$20B land in the first few pixels, so the
 * values people actually screen on were impossible to hit. The ticks are
 * roughly log-spaced and evenly distributed across the track, which gives the
 * crowded low end most of the width, and they double as the histogram's bin
 * edges. First and last tick must equal slider.min / slider.max — the filter
 * builder reads a thumb parked on either extreme as "no bound this side".
 */
export const CRITERIA_META = {
  marketCap: {
    label: "Market Cap",
    section: "Size & Valuation",
    tooltip: "Latest market capitalisation. Filter out companies below/above a size.",
    unit: "$B",
    scale: 1e9,
    slider: { min: 0, max: 500, step: 1 },
    ticks: [0, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 200, 300, 500],
  },
  peRatio: {
    label: "P/E Ratio",
    section: "Size & Valuation",
    tooltip: "Market cap ÷ latest profit after tax. Lower can mean cheaper relative to earnings.",
    unit: "×",
    scale: 1,
    slider: { min: 0, max: 100, step: 0.5 },
    ticks: [0, 5, 10, 12.5, 15, 20, 25, 30, 35, 40, 50, 60, 75, 100],
  },
  revenue: {
    label: "Revenue",
    section: "Profitability",
    tooltip: "Latest fiscal-year total revenue.",
    unit: "$B",
    scale: 1e9,
    slider: { min: 0, max: 300, step: 1 },
    ticks: [0, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 150, 200, 300],
  },
  profitBeforeTax: {
    label: "Profit Before Tax",
    section: "Profitability",
    tooltip: "Latest fiscal-year profit before tax.",
    unit: "$B",
    scale: 1e9,
    slider: { min: -10, max: 100, step: 0.5 },
    ticks: [-10, -5, -2, -1, -0.5, 0, 0.5, 1, 2.5, 5, 10, 25, 50, 100],
  },
  profitAfterTax: {
    label: "Profit After Tax",
    section: "Profitability",
    tooltip: "Latest fiscal-year profit after tax (net income).",
    unit: "$B",
    scale: 1e9,
    slider: { min: -10, max: 100, step: 0.5 },
    ticks: [-10, -5, -2, -1, -0.5, 0, 0.5, 1, 2.5, 5, 10, 25, 50, 100],
  },
  ebita: {
    label: "EBITA",
    section: "Profitability",
    tooltip: "Earnings before interest, taxes and amortisation, latest fiscal year.",
    unit: "$B",
    scale: 1e9,
    slider: { min: -10, max: 100, step: 0.5 },
    ticks: [-10, -5, -2, -1, -0.5, 0, 0.5, 1, 2.5, 5, 10, 25, 50, 100],
  },
  dividendCents: {
    label: "Dividend",
    section: "Income & Stability",
    tooltip: "Dividend declared for the latest year, in cents per share.",
    unit: "¢",
    scale: 1,
    slider: { min: 0, max: 300, step: 1 },
    ticks: [0, 1, 2, 5, 10, 20, 30, 50, 75, 100, 150, 200, 250, 300],
  },
  companyAgeYears: {
    label: "Company Age",
    section: "Income & Stability",
    tooltip: "Years since listing. Screens out young, unproven companies.",
    unit: "yrs",
    scale: 1,
    slider: { min: 0, max: 100, step: 1 },
    ticks: [0, 1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100],
  },
};

// ---------------------------------------------------------------------------
// Slider stop points
// ---------------------------------------------------------------------------

/** The stop points for a criterion, in UI units. Always length >= 2. */
export function ticksFor(key) {
  const meta = CRITERIA_META[key];
  if (meta?.ticks?.length >= 2) return meta.ticks;
  // Fallback for a criterion added to CRITERIA_META without explicit ticks:
  // 10 evenly spaced stops across its linear slider range.
  const { min = 0, max = 100 } = meta?.slider ?? {};
  return Array.from({ length: 11 }, (_, i) => min + ((max - min) * i) / 10);
}

/**
 * Index of the stop point nearest to `value`. Ties go to the lower index so
 * that dragging left never overshoots. Returns `fallback` for a blank value.
 */
export function tickIndexOf(key, value, fallback = 0) {
  const ticks = ticksFor(key);
  if (value == null || value === "" || Number.isNaN(Number(value))) return fallback;
  const v = Number(value);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < ticks.length; i++) {
    const dist = Math.abs(ticks[i] - v);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Value at a stop index, clamped into range. */
export function tickAt(key, index) {
  const ticks = ticksFor(key);
  const i = Math.min(Math.max(Math.round(index), 0), ticks.length - 1);
  return ticks[i];
}

/** Snap an arbitrary (e.g. typed) value onto the nearest stop point. */
export function snapToTick(key, value) {
  if (value == null || value === "") return null;
  return tickAt(key, tickIndexOf(key, value));
}

/**
 * Which stop indices get a printed label. Every tick gets a mark, but printing
 * all 14 labels turns the axis into mush, so label ~5 spread across the track
 * (always including both ends).
 */
export function labelledTickIndices(key, maxLabels = 5) {
  const n = ticksFor(key).length;
  if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i);
  const out = new Set([0, n - 1]);
  for (let i = 1; i < maxLabels - 1; i++) out.add(Math.round((i * (n - 1)) / (maxLabels - 1)));
  return [...out].sort((a, b) => a - b);
}

/** Compact axis label for a tick, e.g. `0.25`, `12.5`, `500`. */
export function formatTick(value) {
  const abs = Math.abs(value);
  if (abs >= 100 || Number.isInteger(value)) return String(Math.round(value));
  if (abs >= 1) return value.toFixed(1).replace(/\.0$/, "");
  return String(value);
}

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
