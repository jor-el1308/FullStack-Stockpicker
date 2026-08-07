/**
 * Owner: Charles (Person 2) - Subscription/Paywall & Admin.
 * Unit tests for the thin API-client wrappers (client/src/api/subscription.js
 * and client/src/api/admin.js) - verifies each function hits the correct
 * method/path (and body) per api-documentation.md. global.fetch is stubbed
 * so no real network call happens.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSubscriptionStatus,
  listMyPayments,
  cancelSubscription,
  resumeSubscription,
  createBillingPortalSession,
} from "../../src/api/subscription";
import {
  getStats,
  listUsers,
  createUser,
  revokeUser,
  restoreUser,
  deleteUser,
  setAdmin,
  clearCache,
  runReseed,
} from "../../src/api/admin";

function mockFetchJson(data) {
  global.fetch.mockResolvedValue({ text: async () => JSON.stringify({ success: true, data }) });
}

function lastCall() {
  return global.fetch.mock.calls[0];
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("api/subscription.js", () => {
  it("getSubscriptionStatus GETs /api/subscription/status", async () => {
    mockFetchJson({ isActive: true });
    const result = await getSubscriptionStatus();
    const [url, options] = lastCall();
    expect(url).toBe("/api/subscription/status");
    expect(options?.method).toBeUndefined();
    expect(result).toEqual({ isActive: true });
  });

  it("listMyPayments GETs /api/subscription/payments", async () => {
    mockFetchJson([]);
    await listMyPayments();
    expect(lastCall()[0]).toBe("/api/subscription/payments");
  });

  it("cancelSubscription POSTs /api/subscription/cancel", async () => {
    mockFetchJson({ cancelAtPeriodEnd: true });
    await cancelSubscription();
    const [url, options] = lastCall();
    expect(url).toBe("/api/subscription/cancel");
    expect(options.method).toBe("POST");
  });

  it("resumeSubscription POSTs /api/subscription/resume", async () => {
    mockFetchJson({ cancelAtPeriodEnd: false });
    await resumeSubscription();
    const [url, options] = lastCall();
    expect(url).toBe("/api/subscription/resume");
    expect(options.method).toBe("POST");
  });

  it("createBillingPortalSession POSTs /api/subscription/billing-portal", async () => {
    mockFetchJson({ url: "https://billing.stripe.test" });
    const result = await createBillingPortalSession();
    expect(lastCall()[0]).toBe("/api/subscription/billing-portal");
    expect(lastCall()[1].method).toBe("POST");
    expect(result).toEqual({ url: "https://billing.stripe.test" });
  });
});

describe("api/admin.js", () => {
  it("getStats GETs /api/admin/stats", async () => {
    mockFetchJson({ totalUsers: 3 });
    await getStats();
    expect(lastCall()[0]).toBe("/api/admin/stats");
  });

  it("listUsers GETs /api/admin/users", async () => {
    mockFetchJson([]);
    await listUsers();
    expect(lastCall()[0]).toBe("/api/admin/users");
  });

  it("createUser POSTs /api/admin/users with the payload", async () => {
    mockFetchJson({ id: "u9" });
    const payload = { email: "a@b.com", password: "pw", name: "A", isActive: true };
    await createUser(payload);
    const [url, options] = lastCall();
    expect(url).toBe("/api/admin/users");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual(payload);
  });

  it("revokeUser POSTs /api/admin/users/:id/revoke", async () => {
    mockFetchJson({ isActive: false });
    await revokeUser("u1");
    const [url, options] = lastCall();
    expect(url).toBe("/api/admin/users/u1/revoke");
    expect(options.method).toBe("POST");
  });

  it("restoreUser POSTs /api/admin/users/:id/restore", async () => {
    mockFetchJson({ isActive: true });
    await restoreUser("u1");
    expect(lastCall()[0]).toBe("/api/admin/users/u1/restore");
  });

  it("deleteUser DELETEs /api/admin/users/:id", async () => {
    mockFetchJson({ deleted: true });
    await deleteUser("u1");
    const [url, options] = lastCall();
    expect(url).toBe("/api/admin/users/u1");
    expect(options.method).toBe("DELETE");
  });

  it("setAdmin POSTs /api/admin/users/:id/admin with { isAdmin }", async () => {
    mockFetchJson({ isAdmin: true });
    await setAdmin("u1", true);
    const [url, options] = lastCall();
    expect(url).toBe("/api/admin/users/u1/admin");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ isAdmin: true });
  });

  it("clearCache POSTs /api/admin/cache/clear", async () => {
    mockFetchJson({ entriesCleared: 2 });
    await clearCache();
    expect(lastCall()[0]).toBe("/api/admin/cache/clear");
    expect(lastCall()[1].method).toBe("POST");
  });

  it("runReseed POSTs /api/admin/reseed", async () => {
    mockFetchJson({ started: true });
    await runReseed();
    expect(lastCall()[0]).toBe("/api/admin/reseed");
    expect(lastCall()[1].method).toBe("POST");
  });
});
