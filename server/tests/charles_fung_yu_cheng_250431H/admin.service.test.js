/**
 * Owner: Charles (Person 2) - Admin Dashboard.
 * Unit tests for admin.service.js. The MySQL pool and the collaborating
 * services (subscription, auth) and cache util are mocked, so no real DB,
 * Stripe, or bcrypt work happens.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config/db.js", () => ({ pool: { query: vi.fn() } }));
vi.mock("../../src/services/subscription.service.js", () => ({ cancelSubscriptionForUser: vi.fn() }));
vi.mock("../../src/services/auth.service.js", () => ({ hashPassword: vi.fn(async () => "hashed-pw") }));
vi.mock("../../src/utils/cache.js", () => ({ cacheClear: vi.fn(), cacheSize: vi.fn(() => 3) }));
vi.mock("node:crypto", () => ({ randomUUID: () => "new-user-id" }));

import { pool } from "../../src/config/db.js";
import { cancelSubscriptionForUser } from "../../src/services/subscription.service.js";
import { cacheClear } from "../../src/utils/cache.js";
import {
  listUsers,
  revokeUser,
  deleteUser,
  restoreUser,
  setAdmin,
  getStats,
  createUser,
  clearCache,
} from "../../src/services/admin.service.js";

beforeEach(() => {
  pool.query.mockReset();
  cancelSubscriptionForUser.mockReset();
  cancelSubscriptionForUser.mockResolvedValue(undefined);
  cacheClear.mockReset();
});

describe("listUsers", () => {
  it("coerces isActive/isAdmin tinyints to booleans", async () => {
    pool.query.mockResolvedValueOnce([
      [{ id: "u1", email: "a@b.com", name: "A", isActive: 1, isAdmin: 0, paymentCount: 2 }],
    ]);
    const users = await listUsers();
    expect(users[0]).toMatchObject({ isActive: true, isAdmin: false });
  });
});

describe("revokeUser", () => {
  it("cancels the Stripe subscription and flips is_active to 0", async () => {
    pool.query
      .mockResolvedValueOnce([{}]) // UPDATE users SET is_active = 0
      .mockResolvedValueOnce([[{ id: "u1", isActive: 0, isAdmin: 0 }]]); // getUser
    const user = await revokeUser("u1");
    expect(cancelSubscriptionForUser).toHaveBeenCalledWith("u1");
    expect(pool.query).toHaveBeenCalledWith("UPDATE users SET is_active = 0 WHERE id = ?", ["u1"]);
    expect(user.isActive).toBe(false);
    expect(user.stripeCancelError).toBeUndefined();
  });

  it("still revokes (and surfaces the error) when the Stripe cancel fails", async () => {
    cancelSubscriptionForUser.mockRejectedValueOnce(new Error("stripe down"));
    pool.query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ id: "u1", isActive: 0, isAdmin: 0 }]]);
    const user = await revokeUser("u1");
    expect(pool.query).toHaveBeenCalledWith("UPDATE users SET is_active = 0 WHERE id = ?", ["u1"]);
    expect(user.stripeCancelError).toBe("stripe down");
  });
});

describe("deleteUser", () => {
  it("returns deleted:true when a row was removed", async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    expect(await deleteUser("u1")).toEqual({ deleted: true });
    expect(cancelSubscriptionForUser).toHaveBeenCalledWith("u1");
  });

  it("returns deleted:false when no such user existed", async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    expect(await deleteUser("ghost")).toEqual({ deleted: false });
  });
});

describe("restoreUser", () => {
  it("sets is_active = 1 and returns the refreshed user", async () => {
    pool.query
      .mockResolvedValueOnce([{}]) // UPDATE
      .mockResolvedValueOnce([[{ id: "u1", isActive: 1, isAdmin: 0 }]]); // getUser
    const user = await restoreUser("u1");
    expect(pool.query.mock.calls[0][0]).toMatch(/is_active = 1/);
    expect(user.isActive).toBe(true);
  });
});

describe("setAdmin", () => {
  it("promotes a user (is_admin = 1)", async () => {
    pool.query
      .mockResolvedValueOnce([{}]) // UPDATE
      .mockResolvedValueOnce([[{ id: "u1", isActive: 1, isAdmin: 1 }]]); // getUser
    const user = await setAdmin("u1", true);
    expect(pool.query).toHaveBeenCalledWith("UPDATE users SET is_admin = ? WHERE id = ?", [1, "u1"]);
    expect(user.isAdmin).toBe(true);
  });
});

describe("getStats", () => {
  it("derives inactive count and sums revenue from succeeded payments", async () => {
    pool.query
      .mockResolvedValueOnce([[{ totalUsers: 10, activeUsers: 4 }]])
      .mockResolvedValueOnce([[{ totalRevenueCents: 3996 }]]);
    expect(await getStats()).toEqual({
      totalUsers: 10,
      activeUsers: 4,
      inactiveUsers: 6,
      totalRevenueCents: 3996,
    });
  });
});

describe("createUser", () => {
  it("hashes the password and returns a listUsers-shaped row", async () => {
    pool.query
      .mockResolvedValueOnce([{}]) // INSERT
      .mockResolvedValueOnce([[{ id: "new-user-id", email: "a@b.com", name: "A", isActive: 0, isAdmin: 0 }]]); // getUser
    const user = await createUser({ email: "a@b.com", password: "pw", name: "A" });
    expect(pool.query.mock.calls[0][0]).toMatch(/INSERT INTO users/);
    expect(user).toMatchObject({ id: "new-user-id", avatar: null, paymentCount: 0 });
  });
});

describe("clearCache", () => {
  it("reports how many entries it wiped", () => {
    expect(clearCache()).toEqual({ entriesCleared: 3 });
    expect(cacheClear).toHaveBeenCalledOnce();
  });
});
