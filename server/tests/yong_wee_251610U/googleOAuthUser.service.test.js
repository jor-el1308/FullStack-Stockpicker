/**
 * Owner: Yong Wee (Person 1) - Auth ("Sign in with Google").
 * Unit tests for auth.service.js's Google-specific persistence:
 * findUserByGoogleId() and findOrCreateGoogleUser() - matching an existing
 * linked account, linking a Google id onto an existing password account by
 * verified email, and creating a brand-new (password-less) account.
 * server/src/config/db.js's pool is mocked so no real MySQL connection is
 * needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:crypto", () => ({ randomUUID: () => "test-uuid-1234", randomInt: () => 123456 }));
vi.mock("../../src/config/db.js", () => ({ pool: { query: vi.fn() } }));

import { pool } from "../../src/config/db.js";
import { findOrCreateGoogleUser, findUserByGoogleId } from "../../src/services/auth.service.js";

const existingByGoogleId = {
  id: "user-1",
  email: "ada@example.com",
  name: "Ada Lovelace",
  avatar: null,
  isActive: true,
  isAdmin: false,
};

describe("auth.service - findUserByGoogleId", () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  it("looks up a user by google_id and returns null when there's no match", async () => {
    pool.query.mockResolvedValue([[]]);

    const result = await findUserByGoogleId("google-uid-404");

    expect(result).toBeNull();
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("WHERE google_id = ?");
    expect(params).toEqual(["google-uid-404"]);
  });
});

describe("auth.service - findOrCreateGoogleUser", () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  it("returns the existing user immediately when the google_id is already linked", async () => {
    pool.query.mockResolvedValueOnce([[existingByGoogleId]]); // findUserByGoogleId

    const user = await findOrCreateGoogleUser({
      googleId: "google-uid-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      avatar: null,
    });

    expect(user).toEqual(existingByGoogleId);
    // Only the google_id lookup should run - no email lookup, no insert/update.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("links the google_id onto an existing password account with the same (verified) email", async () => {
    pool.query
      .mockResolvedValueOnce([[]]) // findUserByGoogleId - no match yet
      .mockResolvedValueOnce([[{ ...existingByGoogleId, passwordHash: "hashed" }]]) // findUserByEmail
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users SET google_id
      .mockResolvedValueOnce([[existingByGoogleId]]); // findUserById (refetch)

    const user = await findOrCreateGoogleUser({
      googleId: "google-uid-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      avatar: null,
    });

    expect(user).toEqual(existingByGoogleId);
    const [updateSql, updateParams] = pool.query.mock.calls[2];
    expect(updateSql).toContain("UPDATE users SET google_id = ?");
    expect(updateParams).toEqual(["google-uid-1", "user-1"]);
  });

  it("creates a brand-new, password-less account when neither google_id nor email match", async () => {
    const createdUser = {
      id: "test-uuid-1234",
      email: "new.user@example.com",
      name: "New User",
      avatar: "https://example.com/pic.jpg",
      isActive: false,
      isAdmin: false,
    };
    pool.query
      .mockResolvedValueOnce([[]]) // findUserByGoogleId - no match
      .mockResolvedValueOnce([[]]) // findUserByEmail - no match
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // INSERT INTO users
      .mockResolvedValueOnce([[createdUser]]); // findUserById (refetch)

    const user = await findOrCreateGoogleUser({
      googleId: "google-uid-2",
      email: "new.user@example.com",
      name: "New User",
      avatar: "https://example.com/pic.jpg",
    });

    expect(user).toEqual(createdUser);
    const [insertSql, insertParams] = pool.query.mock.calls[2];
    expect(insertSql).toContain("INSERT INTO users");
    expect(insertSql).toContain("google_id");
    expect(insertParams).toEqual([
      "test-uuid-1234",
      "new.user@example.com",
      "google-uid-2",
      "New User",
      "https://example.com/pic.jpg",
    ]);
  });
});
