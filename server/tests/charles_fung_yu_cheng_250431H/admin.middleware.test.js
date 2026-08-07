/**
 * Owner: Charles (Person 2) - Admin Dashboard.
 * Unit tests for the requireAdmin gate. The MySQL pool is mocked; the
 * Express req/res/next are plain stubs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config/db.js", () => ({ pool: { query: vi.fn() } }));

import { pool } from "../../src/config/db.js";
import { requireAdmin } from "../../src/middleware/admin.middleware.js";

function makeRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

beforeEach(() => pool.query.mockReset());

describe("requireAdmin", () => {
  it("401s when there is no authenticated user id", async () => {
    const res = makeRes();
    const next = vi.fn();
    await requireAdmin({}, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("401s when the user id doesn't resolve to a row", async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = makeRes();
    const next = vi.fn();
    await requireAdmin({ userId: "ghost" }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("403s a logged-in non-admin", async () => {
    pool.query.mockResolvedValueOnce([[{ isAdmin: 0 }]]);
    const res = makeRes();
    const next = vi.fn();
    await requireAdmin({ userId: "u1" }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() for an admin", async () => {
    pool.query.mockResolvedValueOnce([[{ isAdmin: 1 }]]);
    const res = makeRes();
    const next = vi.fn();
    await requireAdmin({ userId: "admin1" }, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
