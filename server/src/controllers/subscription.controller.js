import * as subscriptionService from "../services/subscription.service.js";
import * as authService from "../services/auth.service.js";

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

export async function getStatus(req, res) {
  try {
    const status = await subscriptionService.getStatus(req.userId);
    if (!status) {
      return res.status(404).json({ success: false, error: { message: "User not found" } });
    }
    res.json({ success: true, data: { ...status, activationFee: subscriptionService.ACTIVATION_FEE } });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
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
    res.status(500).json({ success: false, error: { message: err.message } });
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
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

export async function listPayments(req, res) {
  try {
    const payments = await subscriptionService.listPayments(req.userId);
    res.json({ success: true, data: payments });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}
