/**
 * Owner: Charles (Person 2) - Data Pipeline / Admin reseed control.
 * Unit tests for the reseed scheduler in ingestion.service.js. The MySQL
 * pool and child_process.spawn are mocked so no Python process is launched
 * and no real DB is touched.
 *
 * NOTE: the service keeps module-level state (the current run + schedule
 * cache), so the two startReseed cases below run in order on purpose — the
 * first launch leaves the mocked child "running" (it never emits 'close'),
 * which is exactly what the concurrency guard is expected to catch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { fakeChild } = vi.hoisted(() => ({
  fakeChild: { stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn() },
}));

vi.mock("node:child_process", () => ({ spawn: vi.fn(() => fakeChild) }));
vi.mock("../../src/config/db.js", () => ({ pool: { query: vi.fn(async () => [[]]) } }));

import { spawn } from "node:child_process";
import { pool } from "../../src/config/db.js";
import {
  getReseedSchedule,
  setReseedSchedule,
  startReseed,
  getReseedStatus,
} from "../../src/services/ingestion.service.js";

beforeEach(() => {
  pool.query.mockClear();
  spawn.mockClear();
});

describe("reseed schedule", () => {
  it("starts disabled (no interval, no next run)", () => {
    expect(getReseedSchedule()).toEqual({ intervalHours: null, nextRunAt: null, lastReseedAt: null });
  });

  it("persists and reflects an enabled interval", async () => {
    const result = await setReseedSchedule(24);
    expect(result.intervalHours).toBe(24);
    expect(result.nextRunAt).not.toBeNull();
    // upserts row id=1 with the interval and a computed next-run timestamp
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO reseed_schedule"),
      [24, expect.any(Number)]
    );
    expect(getReseedSchedule().intervalHours).toBe(24);
  });

  it("treats 0 / null as 'disable auto-reseed'", async () => {
    expect((await setReseedSchedule(0)).intervalHours).toBeNull();
    const disabled = await setReseedSchedule(null);
    expect(disabled).toEqual({ intervalHours: null, nextRunAt: null, lastReseedAt: null });
    expect(getReseedSchedule().nextRunAt).toBeNull();
  });
});

describe("startReseed", () => {
  it("launches the pipeline when idle", () => {
    expect(startReseed()).toEqual({ started: true });
    expect(spawn).toHaveBeenCalledOnce();
    expect(getReseedStatus().running).toBe(true);
  });

  it("refuses to start a second concurrent run", () => {
    expect(startReseed()).toEqual({ started: false, alreadyRunning: true });
    expect(spawn).not.toHaveBeenCalled();
  });
});
