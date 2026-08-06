/**
 * Owner: Yong Wee (Person 1) - Auth ("Sign in with Microsoft").
 * Unit tests for auth.service.js's Microsoft-specific persistence:
 * findUserByMicrosoftId() and findOrCreateMicrosoftUser() - matching an
 * existing linked account, linking a Microsoft id onto an existing account
 * by email, and creating a brand-new (password-less) account.
 * server/src/config/db.js's pool is mocked so no real MySQL connection is
 * needed. Mirrors googleOAuthUser.service.test.js.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:crypto", () => ({ randomUUID: () => "test-uuid-1234", randomInt: () => 123456 }));
vi.mock("../../src/config/db.js", () => ({ pool: { query: vi.fn() } }));

import { pool } from "../../src/config/db.js";
import { findOrCreateMicrosoftUser, findUserByMicrosoftId } from "../../src/services/auth.service.js";

const existingByMicrosoftId = {
  id: "user-1",
  email: "ada@example.com",
  name: "Ada Lovelace",
  avatar: null,
  isActive: true,
  isAdmin: false,
};

describe("auth.service - findUserByMicrosoftId", () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  it("looks up a user by microsoft_id and returns null when there's no match", async () => {
    pool.query.mockResolvedValue([[]]);

    const result = await findUserByMicrosoftId("ms-uid-404");

    expect(result).toBeNull();
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("WHERE microsoft_id = ?");
    expect(params).toEqual(["ms-uid-404"]);
  });
});

describe("auth.service - findOrCreateMicrosoftUser", () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  it("returns the existing user immediately when the microsoft_id is already linked", async () => {
    pool.query.mockResolvedValueOnce([[existingByMicrosoftId]]); // findUserByMicrosoftId

    const user = await findOrCreateMicrosoftUser({
      microsoftId: "ms-uid-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      avatar: null,
    });

    expect(user).toEqual(existingByMicrosoftId);
    // Only the microsoft_id lookup should run - no email lookup, no insert/update.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("links the microsoft_id onto an existing account with the same email", async () => {
    pool.query
      .mockResolvedValueOnce([[]]) // findUserByMicrosoftId - no match yet
      .mockResolvedValueOnce([[{ ...existingByMicrosoftId, passwordHash: "hashed" }]]) // findUserByEmail
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users SET microsoft_id
      .mockResolvedValueOnce([[existingByMicrosoftId]]); // findUserById (refetch)

    const user = await findOrCreateMicrosoftUser({
      microsoftId: "ms-uid-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      avatar: null,
    });

    expect(user).toEqual(existingByMicrosoftId);
    const [updateSql, updateParams] = pool.query.mock.calls[2];
    expect(updateSql).toContain("UPDATE users SET microsoft_id = ?");
    expect(updateParams).toEqual(["ms-uid-1", "user-1"]);
  });

  it("creates a brand-new, password-less account when neither microsoft_id nor email match", async () => {
    const createdUser = {
      id: "test-uuid-1234",
      email: "new.user@example.com",
      name: "New User",
      avatar: null,
      isActive: false,
      isAdmin: false,
    };
    pool.query
      .mockResolvedValueOnce([[]]) // findUserByMicrosoftId - no match
      .mockResolvedValueOnce([[]]) // findUserByEmail - no match
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // INSERT INTO users
      .mockResolvedValueOnce([[createdUser]]); // findUserById (refetch)

    const user = await findOrCreateMicrosoftUser({
      microsoftId: "ms-uid-2",
      email: "new.user@example.com",
      name: "New User",
      avatar: null,
    });

    expect(user).toEqual(createdUser);
    const [insertSql, insertParams] = pool.query.mock.calls[2];
    expect(insertSql).toContain("INSERT INTO users");
    expect(insertSql).toContain("microsoft_id");
    expect(insertParams).toEqual([
      "test-uuid-1234",
      "new.user@example.com",
      "ms-uid-2",
      "New User",
      null,
    ]);
  });
});
