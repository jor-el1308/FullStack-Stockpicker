/**
 * Owner: Charles (250431H).
 * Unit tests for the per-slider stock counts under each Advanced Filters
 * slider (client/src/screener/distribution.js).
 *
 * `shown` is the pool the histogram is drawn from - everything passing the
 * *other* enabled criteria - and stays put while you drag this slider, which
 * is what keeps the bars outside the selection visible. `selected` is the
 * subset that also falls inside this slider's own range, so it is the number
 * that has to move as the range is narrowed.
 */
import { describe, it, expect } from "vitest";
import { buildHistograms } from "../../src/screener/distribution";

// Market cap in dollars (UI unit is $B), P/E as-is. Ten stocks at $1B..$10B,
// with P/E climbing in step, so both axes are easy to reason about.
const dist = {
  keys: ["marketCap", "peRatio"],
  rows: Array.from({ length: 10 }, (_, i) => [(i + 1) * 1e9, (i + 1) * 5]),
};

const state = (marketCap, peRatio) => ({
  marketCap: { enabled: true, ...marketCap },
  peRatio: { enabled: true, ...peRatio },
});

describe("slider counts", () => {
  it("counts every stock when nothing is bounded", () => {
    const { byKey, matching, total } = buildHistograms(dist, state({}, {}));
    expect(total).toBe(10);
    expect(matching).toBe(10);
    expect(byKey.marketCap.selected).toBe(10);
    expect(byKey.marketCap.shown).toBe(10);
  });

  it("shrinks the selected count as the slider's own range narrows", () => {
    const wide = buildHistograms(dist, state({ min: 3 }, {}));
    const narrow = buildHistograms(dist, state({ min: 8 }, {}));
    expect(wide.byKey.marketCap.selected).toBe(8); // $3B..$10B
    expect(narrow.byKey.marketCap.selected).toBe(3); // $8B..$10B
    expect(narrow.byKey.marketCap.selected).toBeLessThan(wide.byKey.marketCap.selected);
  });

  it("counts a two-sided range", () => {
    const { byKey } = buildHistograms(dist, state({ min: 4, max: 6 }, {}));
    expect(byKey.marketCap.selected).toBe(3); // $4B, $5B, $6B
  });

  it("leaves the histogram pool alone when only this slider changes", () => {
    const a = buildHistograms(dist, state({ min: 2 }, {}));
    const b = buildHistograms(dist, state({ min: 9 }, {}));
    // Same pool (nothing else is filtering), different selection.
    expect(a.byKey.marketCap.shown).toBe(b.byKey.marketCap.shown);
    expect(a.byKey.marketCap.selected).not.toBe(b.byKey.marketCap.selected);
  });

  it("cross-filters: another criterion shrinks both the pool and the selection", () => {
    const { byKey } = buildHistograms(dist, state({ min: 2 }, { max: 25 }));
    // P/E <= 25 keeps the first five stocks ($1B..$5B); that is the pool the
    // market-cap histogram is drawn from...
    expect(byKey.marketCap.shown).toBe(5);
    // ...and market cap >= $2B keeps four of them.
    expect(byKey.marketCap.selected).toBe(4);
  });

  it("agrees with the page-level match count", () => {
    const { byKey, matching } = buildHistograms(dist, state({ min: 3 }, { max: 40 }));
    expect(matching).toBe(6); // $3B..$8B
    expect(byKey.marketCap.selected).toBe(matching);
    expect(byKey.peRatio.selected).toBe(matching);
  });

  it("returns an empty result rather than throwing on a missing distribution", () => {
    expect(buildHistograms(null, state({}, {}))).toEqual({ byKey: {}, matching: 0, total: 0 });
  });
});
