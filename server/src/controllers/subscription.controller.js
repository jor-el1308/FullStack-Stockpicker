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
    res.json({ success: true, data: { ...status, subscriptionFee: subscriptionService.SUBSCRIPTION_FEE } });
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
    // Already-subscribed guard (prevents duplicate subscriptions) - a 409,
    // not a generic 500. See createCheckoutSession() in subscription.service.js.
    if (err.message === subscriptionService.ALREADY_SUBSCRIBED_MESSAGE) {
      return res.status(409).json({ success: false, error: { message: err.message } });
    }
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
 * Hands the client a link to Stripe's hosted billing portal, where a
 * subscribed user can see invoices, update their card, or cancel - no
 * custom cancellation UI needed on our side.
 */
export async function createBillingPortalSession(req, res) {
  try {
    const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
    const session = await subscriptionService.createBillingPortalSession(req.userId, clientOrigin);
    res.json({ success: true, data: session });
  } catch (err) {
    if (err.message?.startsWith("No billing account")) {
      return res.status(400).json({ success: false, error: { message: err.message } });
    }
    sendSubscriptionError(res, err, "[subscription] createBillingPortalSession");
  }
}

/**
 * Native in-app cancellation (the "Cancel subscription" button in Settings).
 * Schedules the cancellation for the end of the paid period rather than
 * cutting access off immediately - see scheduleCancelAtPeriodEnd().
 */
export async function cancelSubscription(req, res) {
  try {
    const status = await subscriptionService.scheduleCancelAtPeriodEnd(req.userId);
    res.json({ success: true, data: status });
  } catch (err) {
    if (err.message?.startsWith("No active subscription") || err.message?.startsWith("Subscription is already")) {
      return res.status(400).json({ success: false, error: { message: err.message } });
    }
    sendSubscriptionError(res, err, "[subscription] cancelSubscription");
  }
}

/**
 * Undoes a pending cancellation (the "Resume subscription" button).
 */
export async function resumeSubscription(req, res) {
  try {
    const status = await subscriptionService.resumeSubscription(req.userId);
    res.json({ success: true, data: status });
  } catch (err) {
    if (err.message?.startsWith("No subscription") || err.message?.startsWith("Subscription has already")) {
      return res.status(400).json({ success: false, error: { message: err.message } });
    }
    sendSubscriptionError(res, err, "[subscription] resumeSubscription");
  }
}

/**
 * Stripe webhook (Person 2 - security fix): the reliable counterpart to
 * verifySession() above - covers the first payment (if the browser never
 * makes it back to /activate) as well as everything that happens with no
 * browser involved at all: renewals, failed renewals, and cancellations
 * (including ones a user makes from the billing portal). Registered in
 * server/src/app.js with express.raw() (not express.json()) ahead of the
 * global JSON parser, since Stripe's signature check needs the exact raw
 * request body bytes. See server/.env.example for how to set
 * STRIPE_WEBHOOK_SECRET.
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
    switch (event.type) {
      case "checkout.session.completed":
        await subscriptionService.handleCheckoutSessionCompleted(event.data.object);
        break;
      case "customer.subscription.updated":
        await subscriptionService.handleSubscriptionUpdated(event.data.object);
        break;
      case "customer.subscription.deleted":
        await subscriptionService.handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.paid":
        await subscriptionService.handleInvoicePaid(event.data.object);
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error("[subscription] webhook handler failed:", err.message);
    res.status(500).json({ success: false, error: { message: "Webhook handler failed" } });
  }
}
