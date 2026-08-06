/**
 * Owner: Person 5 - Notifications / Watchlist (Twilio WhatsApp).
 * Unit tests for whatsapp.service.js: the pure helpers (recipient
 * normalisation, sender resolution, alert-text builder) and sendWhatsAppMessage
 * in dry-run mode plus its "not configured" guard. No real Twilio calls are
 * made - the dry-run path returns before hitting the network, and the
 * misconfiguration case throws before any client is created.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  normalizeWhatsAppRecipient,
  resolveWhatsAppSender,
  buildWatchlistAlertText,
  sendWhatsAppMessage,
} from "../../src/services/whatsapp.service.js";

describe("normalizeWhatsAppRecipient", () => {
  it("prefixes a bare number with the whatsapp: scheme", () => {
    expect(normalizeWhatsAppRecipient("+6591234567")).toBe("whatsapp:+6591234567");
  });

  it("leaves an already-prefixed number unchanged", () => {
    expect(normalizeWhatsAppRecipient("whatsapp:+6591234567")).toBe("whatsapp:+6591234567");
  });

  it("trims surrounding whitespace before prefixing", () => {
    expect(normalizeWhatsAppRecipient("  +6591234567  ")).toBe("whatsapp:+6591234567");
  });

  it("returns the scheme only for a null/undefined input", () => {
    expect(normalizeWhatsAppRecipient(undefined)).toBe("whatsapp:");
    expect(normalizeWhatsAppRecipient(null)).toBe("whatsapp:");
  });
});

describe("resolveWhatsAppSender", () => {
  const original = process.env.TWILIO_WHATSAPP_FROM;
  afterEach(() => {
    process.env.TWILIO_WHATSAPP_FROM = original;
  });

  it("returns the configured sender, trimmed", () => {
    process.env.TWILIO_WHATSAPP_FROM = "  whatsapp:+14155238886  ";
    expect(resolveWhatsAppSender()).toBe("whatsapp:+14155238886");
  });

  it("returns an empty string when the sender is not set", () => {
    delete process.env.TWILIO_WHATSAPP_FROM;
    expect(resolveWhatsAppSender()).toBe("");
  });
});

describe("buildWatchlistAlertText", () => {
  it("phrases an 'above' condition as 'risen above' and includes the numbers", () => {
    const text = buildWatchlistAlertText({ symbol: "AAPL", condition: "above", targetPrice: 200 }, 205);
    expect(text).toContain("AAPL");
    expect(text).toContain("risen above");
    expect(text).toContain("200");
    expect(text).toContain("205");
  });

  it("phrases a 'below' condition as 'fallen below'", () => {
    const text = buildWatchlistAlertText({ symbol: "TSLA", condition: "below", targetPrice: 300 }, 280);
    expect(text).toContain("fallen below");
    expect(text).toContain("TSLA");
  });
});

describe("sendWhatsAppMessage", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("throws when TWILIO_WHATSAPP_FROM is not configured", async () => {
    delete process.env.TWILIO_WHATSAPP_FROM;
    await expect(sendWhatsAppMessage("+6591234567", "hi")).rejects.toThrow(
      /TWILIO_WHATSAPP_FROM is not set/
    );
  });

  it("returns a dry-run result without calling Twilio when WHATSAPP_DRY_RUN is true", async () => {
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
    process.env.WHATSAPP_DRY_RUN = "true";
    vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendWhatsAppMessage("+6591234567", "Test alert");

    expect(result).toEqual({ sid: "dry-run", status: "queued" });
    // Confirms the dry-run branch logged the payload instead of sending.
    expect(console.info).toHaveBeenCalled();
  });
});