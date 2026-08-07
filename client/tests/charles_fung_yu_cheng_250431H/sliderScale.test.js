/**
 * Owner: Charles (250431H).
 * Unit tests for the Advanced Filters slider scale (client/src/screener/criteria.js).
 *
 * The sliders lay their stop points (`ticks`) out evenly across the track and
 * interpolate between them, so these cover the two things that were broken:
 * the thumb could only sit *on* a stop point (no values in between), and the
 * value it reported didn't line up with the stop point it appeared to be on.
 */
import { describe, it, expect } from "vitest";
import {
  CRITERIA_META,
  ticksFor,
  positionOf,
  valueAtPosition,
  nudgeValue,
  clampToRange,
  stepForSegment,
  TICK_MAGNET,
} from "../../src/screener/criteria";

describe("slider scale - stop points", () => {
  it("puts every stop point at its own whole position, in order", () => {
    for (const key of Object.keys(CRITERIA_META)) {
      const ticks = ticksFor(key);
      ticks.forEach((tick, i) => {
        expect(positionOf(key, tick)).toBeCloseTo(i, 10);
      });
    }
  });

  it("returns the exact stop point value when the thumb is on a stop point", () => {
    const ticks = ticksFor("peRatio");
    ticks.forEach((tick, i) => {
      expect(valueAtPosition("peRatio", i)).toBe(tick);
    });
  });

  it("snaps onto a stop point when dragged close to one", () => {
    // Just inside the magnet on either side of the "P/E 15" stop (index 4).
    expect(valueAtPosition("peRatio", 4 - TICK_MAGNET / 2)).toBe(15);
    expect(valueAtPosition("peRatio", 4 + TICK_MAGNET / 2)).toBe(15);
  });

  it("keeps holding a stop point past the snap zone, then lets go", () => {
    const ticks = ticksFor("marketCap");
    const lower = ticks[6]; // $5B
    const upper = ticks[7]; // $10B
    const linear = (frac) => lower + frac * (upper - lower);

    // Still locked on just past the hard snap.
    expect(valueAtPosition("marketCap", 6 + TICK_MAGNET + 0.01)).toBeLessThan(linear(0.1));
    // Pulled back toward the stop through the detent zone...
    expect(valueAtPosition("marketCap", 6.25)).toBeLessThan(linear(0.25));
    // ...but tracking the pointer again by the middle of the segment.
    expect(valueAtPosition("marketCap", 6.5)).toBeCloseTo(linear(0.5), 1);
    // And it locks onto the far stop on the way out.
    expect(valueAtPosition("marketCap", 7 - TICK_MAGNET / 2)).toBe(upper);
  });

  it("never runs backwards while the detent pulls the value around", () => {
    const last = ticksFor("marketCap").length - 1;
    let previous = -Infinity;
    for (let step = 0; step <= 3000; step++) {
      const value = valueAtPosition("marketCap", (step / 3000) * last);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("keeps the first/last stop equal to the slider bounds, which mean 'no bound'", () => {
    for (const [key, meta] of Object.entries(CRITERIA_META)) {
      const ticks = ticksFor(key);
      expect(ticks[0]).toBe(meta.slider.min);
      expect(ticks[ticks.length - 1]).toBe(meta.slider.max);
    }
  });
});

describe("slider scale - dragging between stop points", () => {
  it("reaches values strictly between two stop points", () => {
    // Halfway between $0.5B and $1B, i.e. not a stop point at all.
    const value = valueAtPosition("marketCap", 3.5);
    expect(value).toBeGreaterThan(0.5);
    expect(value).toBeLessThan(1);
  });

  it("moves monotonically and never leaves its segment", () => {
    const ticks = ticksFor("marketCap");
    let previous = -Infinity;
    for (let step = 0; step <= 200; step++) {
      const position = (step / 200) * (ticks.length - 1);
      const value = valueAtPosition("marketCap", position);
      expect(value).toBeGreaterThanOrEqual(previous);
      const segment = Math.min(Math.floor(position), ticks.length - 2);
      expect(value).toBeGreaterThanOrEqual(ticks[segment]);
      expect(value).toBeLessThanOrEqual(ticks[segment + 1]);
      previous = value;
    }
  });

  it("round-trips a dragged value back to the same position on the track", () => {
    for (const position of [0.4, 2.3, 5.75, 9.1, 12.6]) {
      const value = valueAtPosition("marketCap", position, { magnet: false });
      // Within a hundredth of a segment: the value is rounded to the segment's
      // step, so the position moves by at most half a step.
      expect(positionOf("marketCap", value)).toBeCloseTo(position, 1);
    }
  });

  it("rounds to clean numbers instead of floating-point noise", () => {
    for (const position of [1.37, 4.62, 7.19, 11.44]) {
      const value = valueAtPosition("marketCap", position, { magnet: false });
      const step = stepForSegment("marketCap", Math.floor(position));
      expect(Math.abs(value / step - Math.round(value / step))).toBeLessThan(1e-6);
    }
  });

  it("uses a finer step at the crowded low end than at the top", () => {
    expect(stepForSegment("marketCap", 0)).toBeLessThan(stepForSegment("marketCap", 12));
  });
});

describe("slider scale - keyboard and typed input", () => {
  it("moves off a stop point by one step per arrow key, in both directions", () => {
    const up = nudgeValue("marketCap", 1, 1);
    const down = nudgeValue("marketCap", 1, -1);
    expect(up).toBeGreaterThan(1);
    expect(up).toBeLessThan(2);
    expect(down).toBeLessThan(1);
    expect(down).toBeGreaterThan(0.5);
  });

  it("jumps a whole stop point with Shift/PageUp", () => {
    expect(nudgeValue("marketCap", 1.3, 1, { wholeStop: true })).toBe(2);
    expect(nudgeValue("marketCap", 1.3, -1, { wholeStop: true })).toBe(1);
  });

  it("never walks past either end of the track", () => {
    const ticks = ticksFor("marketCap");
    expect(nudgeValue("marketCap", ticks[0], -1)).toBe(ticks[0]);
    expect(nudgeValue("marketCap", ticks[ticks.length - 1], 1)).toBe(ticks[ticks.length - 1]);
  });

  it("clamps typed values into the slider's range", () => {
    expect(clampToRange("marketCap", 9999)).toBe(500);
    expect(clampToRange("marketCap", -5)).toBe(0);
    expect(clampToRange("marketCap", "")).toBeNull();
    expect(clampToRange("marketCap", null)).toBeNull();
  });
});
