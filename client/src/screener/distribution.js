/**
 * Owner: Person 3 (Jorel) - Screener / Filter Engine (filter UI).
 *
 * Turns the raw universe sample from GET/POST /api/screener/distribution into
 * the histograms drawn behind each Advanced Filters slider.
 *
 * The bars are *cross-filtered*: the histogram under, say, P/E Ratio counts the
 * stocks that pass every other enabled criterion, so it answers "given the rest
 * of my screen, where do the candidates sit on this axis?" rather than showing
 * the same static universe under every slider.
 *
 * Doing that naively is O(criteria^2 x stocks) per drag frame. Instead we build
 * one pass/fail mask per criterion, count each row's failures once, and then a
 * row belongs in criterion k's histogram when it fails nothing, or fails only
 * k itself - O(criteria x stocks) total.
 *
 * Bin edges are the slider's own tick stops (criteria.js `ticks`), so a bar
 * always lines up with the segment of track above it.
 */
import { CRITERIA_META, ticksFor } from "./criteria";

/**
 * @param {{ keys: string[], rows: (number|null)[][] } | null} dist
 *   Universe sample from the API. Values are in raw API units.
 * @param {Record<string, { enabled: boolean, min: number|null, max: number|null }>} uiValues
 *   Current per-criterion filter state, in UI units.
 * @returns {{
 *   byKey: Record<string, { counts: number[], max: number, shown: number, selected: number }>,
 *   matching: number,
 *   total: number,
 * }}
 *
 * `shown` is how many stocks the histogram is drawn from (everything passing
 * the *other* enabled criteria). `selected` is the subset of those that also
 * fall inside this criterion's own min/max, i.e. what the slider is currently
 * keeping - so it moves as you drag.
 */
export function buildHistograms(dist, uiValues) {
  const empty = { byKey: {}, matching: 0, total: 0 };
  if (!dist?.rows?.length || !dist?.keys?.length) return empty;

  const { keys, rows } = dist;
  const total = rows.length;

  // ---- per-criterion pass masks -------------------------------------------
  // A criterion only constrains anything once it's enabled AND has a bound.
  // Bounds are compared in raw API units to avoid dividing every cell by scale.
  const constraints = keys
    .map((key, col) => {
      const meta = CRITERIA_META[key];
      const state = uiValues?.[key];
      if (!meta || !state?.enabled) return null;
      const ticks = ticksFor(key);
      // A thumb parked on an extreme means "no bound that side" - same rule
      // AdvancedFilters.buildCriteria() uses when POSTing to the API, so the
      // bars agree with the result count you'll actually get.
      const hasMin = state.min != null && state.min !== "" && Number(state.min) > ticks[0];
      const hasMax = state.max != null && state.max !== "" && Number(state.max) < ticks[ticks.length - 1];
      if (!hasMin && !hasMax) return null;
      return {
        key,
        col,
        min: hasMin ? Number(state.min) * meta.scale : null,
        max: hasMax ? Number(state.max) * meta.scale : null,
      };
    })
    .filter(Boolean);

  const failCounts = new Int16Array(total);
  // masks[i] aligns with constraints[i]; true = this row passes that constraint.
  const masks = constraints.map(() => new Uint8Array(total));

  for (let c = 0; c < constraints.length; c++) {
    const { col, min, max } = constraints[c];
    const mask = masks[c];
    for (let r = 0; r < total; r++) {
      const v = rows[r][col];
      // Mirror SQL: a NULL value never satisfies a bounded comparison.
      const pass = v != null && (min == null || v >= min) && (max == null || v <= max);
      mask[r] = pass ? 1 : 0;
      if (!pass) failCounts[r]++;
    }
  }

  let matching = 0;
  for (let r = 0; r < total; r++) if (failCounts[r] === 0) matching++;

  // ---- bin each criterion over the rows that survive the *other* filters ---
  const constraintIndexByKey = new Map(constraints.map((c, i) => [c.key, i]));
  const byKey = {};

  for (let col = 0; col < keys.length; col++) {
    const key = keys[col];
    const meta = CRITERIA_META[key];
    if (!meta) continue;

    const ticks = ticksFor(key);
    const binCount = ticks.length - 1;
    const counts = new Array(binCount).fill(0);
    const own = constraintIndexByKey.get(key);
    const ownMask = own != null ? masks[own] : null;
    let shown = 0;
    let selected = 0;

    for (let r = 0; r < total; r++) {
      const fails = failCounts[r];
      // Ignore this criterion's own constraint so the bars outside the current
      // selection stay visible - that's the whole point of the histogram.
      if (fails > 1) continue;
      if (fails === 1 && !(ownMask && ownMask[r] === 0)) continue;

      const raw = rows[r][col];
      if (raw == null) continue;
      counts[binIndex(ticks, raw / meta.scale)]++;
      shown++;
      // fails === 0 means the row also satisfies this criterion's own range,
      // so it is inside the slider's current selection.
      if (fails === 0) selected++;
    }

    byKey[key] = { counts, max: Math.max(0, ...counts), shown, selected };
  }

  return { byKey, matching, total };
}

/**
 * Bin for a UI-unit value: the segment [ticks[i], ticks[i+1]) it falls in.
 * Values below the first tick fold into bin 0 and values at or above the last
 * tick fold into the final bin, matching the sliders' "0 = no min / max = no
 * max" open-ended extremes.
 */
export function binIndex(ticks, value) {
  const last = ticks.length - 2;
  if (!(value > ticks[0])) return 0;
  for (let i = 1; i <= last; i++) if (value < ticks[i]) return i - 1;
  return last;
}
