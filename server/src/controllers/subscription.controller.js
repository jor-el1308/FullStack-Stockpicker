import * as subscriptionService from "../services/subscription.service.js";
import * as authService from "../services/auth.service.js";
import { sendInternalError } from "../utils/errors.js";

/**
 * Owner: Person 2 (Charles) - Data Pipeline + Subscription/Paywall.
 *
 * Stripe Checkout (TEST MODE) endpoints. `createCheckoutSession` hands the
 * client a Stripe-hosted payment URL to redirect to; `verifySession`
 * handles the return trip after payment and is what actually flips the
 * account active (never the redirect itself - see subscription.service.js
 * for why). If STRIPE_SECRET_KEY isn't configured yet, these return a
 * clear 500 telling you to set it up rather than silently failing.
 */

// getStripeClient()/constructWebhookEvent() in subscription.service.js throw
// a deliberately-readable setup error when STRIPE_SECRET_KEY/
// STRIPE_WEBHOOK_SECRET aren't configured - that message is safe (and
// meant) to show the developer directly, unlike other errors here which
// could leak internal details (see sendInternalError).
function isConfigError(err) {
  return err.message?.startsWith("STRIPE_SECRET_KEY") || err.message?.startsWith("STRIPE_WEBHOOK_SECRET");
}

function sendSubscriptionError(res, err, logPrefix) {
  if (isConfigError(err)) {
    console.error(`${logPrefix} failed:`, err.message);
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
  sendInternalError(res, err, logPrefix);
}

export async function getStatus(req, res) {
  try {
    const status = await subscriptionService.getStatus(req.userId);
    if (!status) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    res.json({ success: true, data: { ...status, activationFee: subscriptionService.ACTIVATION_FEE } });
  } catch (err) {
    sendInternalError(res, err, "[subscription] getStatus");
  }
}

export async function createCheckoutSession(req, res) {
  try {
    const user = await authService.findUserById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
    const session = await subscriptionService.createCheckoutSession(req.userId, user.email, clientOrigin);
    res.status(201).json({ success: true, data: session });
  } catch (err) {
    sendSubscriptionError(res, err, "[subscription] createCheckoutSession");
  }
}

export async function verifySession(req, res) {
  const sessionId = req.query.session_id;
  if (!sessionId) {
    return res.status(400).json({ success: false, error: { message: "session_id query param is required" } });
  }
  try {
    const status = await subscriptionService.verifyAndActivateFromSession(sessionId, req.userId);
    res.json({ success: true, data: status });
  } catch (err) {
    sendSubscriptionError(res, err, "[subscription] verifySession");
  }
}

export async function listPayments(req, res) {
  try {
    const payments = await subscriptionService.listPayments(req.userId);
    res.json({ success: true, data: payments });
  } catch (err) {
    sendInternalError(res, err, "[subscription] listPayments");
  }
}

/**
 * Stripe webhook (Person 2 - security fix): the reliable counterpart to
 * verifySession() above. Registered in server/src/app.js with
 * express.raw() (not express.json()) ahead of the global JSON parser,
 * since Stripe's signature check needs the exact raw request body bytes.
 * See server/.env.example for how to set STRIPE_WEBHOOK_SECRET.
 */
export async function stripeWebhook(req, res) {
  let event;
  try {
    event = subscriptionService.constructWebhookEvent(req.body, req.headers["stripe-signature"]);
  } catch (err) {
    console.error("[subscription] webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      await subscriptionService.handleCheckoutSessionCompleted(event.data.object);
    }
    res.json({ received: true });
  } catch (err) {
    console.error("[subscription] webhook handler failed:", err.message);
    res.status(500).json({ success: false, error: { message: "Webhook handler failed" } });
  }
}
