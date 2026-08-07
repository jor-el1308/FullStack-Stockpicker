/**
 * Owner: Charles (Person 2) - Subscription/Paywall.
 * Unit tests for subscription.service.js. The MySQL pool (config/db.js) and
 * the Stripe SDK are mocked, so these never touch a real database or hit
 * Stripe's API / need a real key.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Shared Stripe mock, hoisted so the vi.mock factory below can close over it.
const { stripeMock } = vi.hoisted(() => ({
  stripeMock: {
    customers: { retrieve: vi.fn(), create: vi.fn() },
    subscriptions: { retrieve: vi.fn(), update: vi.fn(), cancel: vi.fn() },
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  },
}));

vi.mock("stripe", () => ({ default: vi.fn(() => stripeMock) }));
vi.mock("../../src/config/db.js", () => ({ pool: { query: vi.fn() } }));
vi.mock("../../src/utils/mailer.js", () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock("node:crypto", () => ({ randomUUID: () => "test-uuid-1234" }));

import { pool } from "../../src/config/db.js";
import {
  SUBSCRIPTION_FEE,
  ALREADY_SUBSCRIBED_MESSAGE,
  getStatus,
  listPayments,
  constructWebhookEvent,
  createCheckoutSession,
  createBillingPortalSession,
  scheduleCancelAtPeriodEnd,
  resumeSubscription,
  handleInvoicePaid,
} from "../../src/services/subscription.service.js";

beforeEach(() => {
  pool.query.mockReset();
  for (const group of Object.values(stripeMock)) {
    for (const fn of Object.values(group)) {
      if (typeof fn === "function" && fn.mockReset) fn.mockReset();
      else if (fn && typeof fn === "object") for (const f of Object.values(fn)) f.mockReset?.();
    }
  }
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

describe("SUBSCRIPTION_FEE", () => {
  it("advertises S$9.99/month in the currency actually charged", () => {
    expect(SUBSCRIPTION_FEE).toEqual({ amountCents: 999, currency: "SGD", interval: "month" });
  });
});

describe("getStatus", () => {
  it("returns null when the user does not exist", async () => {
    pool.query.mockResolvedValueOnce([[]]);
    expect(await getStatus("nobody")).toBeNull();
  });

  it("coerces the tinyint flags to booleans", async () => {
    pool.query.mockResolvedValueOnce([
      [
        {
          isActive: 1,
          activatedAt: null,
          subscriptionStatus: "active",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: 0,
          stripeCustomerId: "cus_123",
        },
      ],
    ]);
    const status = await getStatus("u1");
    expect(status).toMatchObject({
      isActive: true,
      subscriptionStatus: "active",
      cancelAtPeriodEnd: false,
      hasBillingAccount: true,
    });
  });
});

describe("listPayments", () => {
  it("returns the caller's payment rows", async () => {
    const rows = [{ id: "p1", amountCents: 999, currency: "SGD", status: "succeeded" }];
    pool.query.mockResolvedValueOnce([rows]);
    expect(await listPayments("u1")).toBe(rows);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("FROM payment"), ["u1"]);
  });
});

describe("constructWebhookEvent", () => {
  it("throws when STRIPE_WEBHOOK_SECRET is not configured", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => constructWebhookEvent(Buffer.from("{}"), "sig")).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("verifies the raw body against the Stripe signature", () => {
    const event = { type: "invoice.paid" };
    stripeMock.webhooks.constructEvent.mockReturnValueOnce(event);
    const raw = Buffer.from("{}");
    expect(constructWebhookEvent(raw, "sig_abc")).toBe(event);
    expect(stripeMock.webhooks.constructEvent).toHaveBeenCalledWith(raw, "sig_abc", "whsec_dummy");
  });
});

describe("createCheckoutSession", () => {
  it("refuses to start a second checkout for a live subscription", async () => {
    pool.query.mockResolvedValueOnce([[{ stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" }]]);
    stripeMock.subscriptions.retrieve.mockResolvedValueOnce({ status: "active" });
    await expect(createCheckoutSession("u1", "a@b.com", "http://localhost:5173")).rejects.toThrow(
      ALREADY_SUBSCRIBED_MESSAGE
    );
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("createBillingPortalSession", () => {
  it("throws when the user has no Stripe customer yet", async () => {
    pool.query.mockResolvedValueOnce([[{ stripeCustomerId: null }]]);
    await expect(createBillingPortalSession("u1", "http://localhost:5173")).rejects.toThrow(/No billing account/);
  });

  it("returns the hosted portal url for a user with a customer", async () => {
    pool.query.mockResolvedValueOnce([[{ stripeCustomerId: "cus_1" }]]);
    stripeMock.billingPortal.sessions.create.mockResolvedValueOnce({ url: "https://billing.stripe.test/p" });
    expect(await createBillingPortalSession("u1", "http://localhost:5173")).toEqual({
      url: "https://billing.stripe.test/p",
    });
  });
});

describe("scheduleCancelAtPeriodEnd / resumeSubscription", () => {
  it("cancel throws when there is no subscription to cancel", async () => {
    pool.query.mockResolvedValueOnce([[{ stripeSubscriptionId: null }]]);
    await expect(scheduleCancelAtPeriodEnd("u1")).rejects.toThrow(/No active subscription to cancel/);
  });

  it("resume throws when there is no subscription to resume", async () => {
    pool.query.mockResolvedValueOnce([[{ stripeSubscriptionId: null }]]);
    await expect(resumeSubscription("u1")).rejects.toThrow(/No subscription to resume/);
  });
});

describe("handleInvoicePaid", () => {
  it("ignores an invoice that isn't tied to a subscription", async () => {
    await handleInvoicePaid({ subscription: null });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("records a payment (idempotent insert) for a known customer", async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: "u1" }]]) // user lookup by customer id
      .mockResolvedValueOnce([{}]); // INSERT IGNORE
    await handleInvoicePaid({
      subscription: "sub_1",
      customer: "cus_1",
      amount_paid: 999,
      currency: "sgd",
      id: "in_123",
    });
    expect(pool.query).toHaveBeenLastCalledWith(expect.stringContaining("INSERT IGNORE INTO payment"), [
      "test-uuid-1234",
      "u1",
      999,
      "SGD",
      "in_123",
    ]);
  });
});
