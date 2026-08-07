/**
 * Client-side metadata for every criterion the backend filter engine
 * understands (see server/src/services/screener.service.js CRITERIA_DEFS).
 *
 * `scale` converts between UI units and the raw DB values sent to the API
 * (e.g. the UI edits Market Cap in $B, the API expects dollars).
 *
 * `ticks` are the slider's stop points, in UI units. They define a *scale*,
 * not a list of allowed values: each consecutive pair of ticks gets an equal
 * slice of the track and the slider interpolates continuously inside that
 * slice, so dragging is smooth while the crowded low end still gets most of
 * the width. (A raw linear 0-500 $B track buries everything under ~$20B in the
 * first few pixels; an earlier tick-index-only slider fixed that but could
 * then only jump between the 14 fixed values.) The ticks also double as the
 * histogram's bin edges and as magnets the thumb snaps onto when dragged near
 * one, so round targets like "P/E 15" or "$1B market cap" stay easy to hit.
 *
 * First and last tick must equal slider.min / slider.max — the filter builder
 * reads a thumb parked on either extreme as "no bound this side".
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

// ---------------------------------------------------------------------------
// Continuous positions along the tick scale
//
// A "position" is a fractional tick index: 0 = first stop, 1 = second stop,
// 3.5 = halfway between the fourth and fifth stops. The track is laid out in
// this space (every segment the same width), so position/lastIndex is exactly
// the thumb's left offset as a fraction of the track — which is what keeps the
// thumbs, tick marks, fill and histogram bars lined up with each other.
// ---------------------------------------------------------------------------

/**
 * Detent ("lock") behaviour around each stop point, in fractions of one
 * segment. Inside TICK_MAGNET the value snaps onto the stop exactly; between
 * TICK_MAGNET and DETENT_ZONE the value is pulled back toward the stop, so the
 * thumb holds there for a moment and then releases as you keep dragging -
 * the same feel as a notched dial. Beyond DETENT_ZONE the drag is 1:1.
 */
export const TICK_MAGNET = 0.12;
const DETENT_ZONE = 0.32;
const DETENT_CURVE = 1.9;

/**
 * Remap a within-segment fraction so it clings to the nearer end of the
 * segment. Continuous and strictly increasing, so the thumb never jumps
 * backwards or skips a value while dragging.
 */
function applyDetent(frac) {
  if (frac <= TICK_MAGNET) return 0;
  if (frac >= 1 - TICK_MAGNET) return 1;
  if (frac < DETENT_ZONE) {
    const t = (frac - TICK_MAGNET) / (DETENT_ZONE - TICK_MAGNET);
    return DETENT_ZONE * t ** DETENT_CURVE;
  }
  if (frac > 1 - DETENT_ZONE) {
    const t = (1 - frac - TICK_MAGNET) / (DETENT_ZONE - TICK_MAGNET);
    return 1 - DETENT_ZONE * t ** DETENT_CURVE;
  }
  return frac;
}

/** Number of intermediate stops the free-drag rounding aims for per segment. */
const STEPS_PER_SEGMENT = 20;

function clamp(value, lo, hi) {
  return Math.min(Math.max(value, lo), hi);
}

/** Round to a multiple of `step`, without float dust like 12.300000000000001. */
export function roundToStep(value, step) {
  if (!(step > 0) || !Number.isFinite(value)) return value;
  const decimals = clamp(Math.ceil(-Math.log10(step)) + 2, 0, 10);
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/**
 * Increment used while free-dragging inside segment `segIndex` (the span from
 * ticks[i] to ticks[i+1]). Picked as a round 1/2/2.5/5 x 10^n number near
 * span/20, so the low end gets fine control ($5M steps between $0 and $100M)
 * and the top end coarse ($10B steps between $300B and $500B) without ever
 * producing values like 137.4285714.
 */
export function stepForSegment(key, segIndex) {
  const ticks = ticksFor(key);
  const i = clamp(Math.trunc(segIndex), 0, ticks.length - 2);
  const span = Math.abs(ticks[i + 1] - ticks[i]);
  if (!(span > 0)) return CRITERIA_META[key]?.slider?.step || 1;
  const raw = span / STEPS_PER_SEGMENT;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw - 1e-12) ?? magnitude * 10;
}

/** Segment a position sits in (the last segment is used for the top stop). */
export function segmentAt(key, position) {
  const last = ticksFor(key).length - 1;
  return clamp(Math.floor(position), 0, last - 1);
}

/**
 * Fractional tick index for a value. Values outside the tick range clamp to
 * the ends; a blank value falls back to `fallback` (a position, not a value).
 */
export function positionOf(key, value, fallback = 0) {
  const ticks = ticksFor(key);
  const last = ticks.length - 1;
  if (value == null || value === "" || Number.isNaN(Number(value))) return fallback;
  const v = Number(value);
  if (v <= ticks[0]) return 0;
  if (v >= ticks[last]) return last;
  for (let i = 0; i < last; i++) {
    if (v <= ticks[i + 1]) {
      const span = ticks[i + 1] - ticks[i];
      return span > 0 ? i + (v - ticks[i]) / span : i;
    }
  }
  return last;
}

/**
 * Value at a fractional tick index. With `magnet` on (the default) the stop
 * points act as detents - the value locks onto one while the pointer is close,
 * then eases back to tracking the pointer 1:1. Elsewhere it interpolates and
 * rounds to the segment's step, so dragging is continuous but never lands on a
 * junk number. Pass `{ magnet: false }` for a pure linear read of the position.
 */
export function valueAtPosition(key, position, { magnet = true } = {}) {
  const ticks = ticksFor(key);
  const last = ticks.length - 1;
  const p = clamp(Number(position) || 0, 0, last);
  const i = segmentAt(key, p);
  const frac = magnet ? applyDetent(p - i) : p - i;
  if (frac === 0) return ticks[i];
  if (frac === 1) return ticks[i + 1];
  const raw = ticks[i] + frac * (ticks[i + 1] - ticks[i]);
  return clamp(roundToStep(raw, stepForSegment(key, i)), ticks[i], ticks[i + 1]);
}

/**
 * Keyboard movement. One arrow key press moves by the current segment's step;
 * `wholeStop` (Page Up/Down) jumps to the next stop point instead.
 */
export function nudgeValue(key, value, direction, { wholeStop = false } = {}) {
  const ticks = ticksFor(key);
  const last = ticks.length - 1;
  const pos = positionOf(key, value, direction > 0 ? 0 : last);

  if (wholeStop) {
    const idx = direction > 0 ? Math.floor(pos + 1e-9) + 1 : Math.ceil(pos - 1e-9) - 1;
    return ticks[clamp(idx, 0, last)];
  }

  // Stepping left off a stop point should use the step of the segment being
  // entered, not the one being left, or the thumb wouldn't move at all on the
  // narrow side of a boundary.
  const seg = segmentAt(key, direction < 0 ? pos - 1e-9 : pos);
  const step = stepForSegment(key, seg);
  const current = Number(value ?? ticks[direction > 0 ? 0 : last]);
  return clamp(roundToStep(current + direction * step, step), ticks[0], ticks[last]);
}

/** Clamp a typed value into the slider's range and strip float dust. */
export function clampToRange(key, value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return null;
  const ticks = ticksFor(key);
  const clamped = clamp(Number(value), ticks[0], ticks[ticks.length - 1]);
  return roundToStep(clamped, stepForSegment(key, segmentAt(key, positionOf(key, clamped))));
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

/**
 * Display for an arbitrary value the sliders can now land on (formatTick is
 * for the fixed, deliberately round stop points and rounds hard above 100).
 */
export function formatUiValue(value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const abs = Math.abs(n);
  if (Number.isInteger(n)) return String(n);
  if (abs >= 100) return n.toFixed(1);
  if (abs >= 1) return String(Number(n.toFixed(2)));
  return String(Number(n.toPrecision(4)));
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
