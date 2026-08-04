/**
 * WhatsApp notification service (Twilio).
 *
 * Requires these env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM   e.g. "whatsapp:+14155238886" (Twilio sandbox number
 *                          or your approved WhatsApp sender)
 *
 * For local development, set WHATSAPP_DRY_RUN=true to log the payload instead
 * of calling Twilio directly.
 */
import twilio from "twilio";

let client = null;

export function resolveWhatsAppSender() {
  return process.env.TWILIO_WHATSAPP_FROM?.trim() ?? "";
}

export function normalizeWhatsAppRecipient(phoneNumber) {
  const value = (phoneNumber ?? "").trim();
  return value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;
}

function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio is not configured: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN"
    );
  }

  if (!client) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

export async function sendWhatsAppMessage(toNumber, body) {
  const sender = resolveWhatsAppSender();
  if (!sender) {
    throw new Error("TWILIO_WHATSAPP_FROM is not set");
  }

  if (process.env.WHATSAPP_DRY_RUN === "true") {
    console.info("[whatsapp] dry-run", {
      from: normalizeWhatsAppRecipient(sender),
      to: normalizeWhatsAppRecipient(toNumber),
      body,
    });
    return { sid: "dry-run", status: "queued" };
  }

  const message = await getClient().messages.create({
    from: normalizeWhatsAppRecipient(sender),
    to: normalizeWhatsAppRecipient(toNumber),
    body,
  });

  return { sid: message.sid, status: message.status };
}

export function buildWatchlistAlertText(item, currentPrice) {
  const direction = item.condition === "above" ? "risen above" : "fallen below";
  return (
    `📈 Watchlist alert: ${item.symbol} has ${direction} your target of ` +
    `${item.targetPrice}. Current price: ${currentPrice}.`
  );
}