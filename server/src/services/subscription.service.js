import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { pool } from "../config/db.js";
import { sendWelcomeEmail } from "../utils/mailer.js";

/**
 * Owner: Person 2 (Charles) - Data Pipeline + Subscription/Paywall.
 *
 * Stripe Checkout integration running in TEST MODE - real Stripe
 * infrastructure and real test card numbers (e.g. 4242 4242 4242 4242),
 * but nothing is actually charged since it uses a test secret key
 * (sk_test_...). See server/.env.example for how to get one.
 *
 * Uses Stripe's hosted Checkout page (redirect flow) rather than an
 * embedded card form - the server creates a Checkout Session and hands
 * the client a `url` to redirect to; Stripe hosts the actual payment page,
 * so no card data ever touches our code and no Stripe.js is needed on the
 * frontend.
 *
 * Billing model: monthly recurring subscription (mode: "subscription").
 * `users.is_active` is the paywall gate the rest of the app checks - it's
 * kept in sync with the *current* Stripe subscription status (active or
 * trialing = active, everything else - past_due, canceled, unpaid, ... -
 * = inactive) by syncSubscriptionFromStripeObject() below, called from
 * both the post-checkout redirect (UX convenience, immediate feedback) and
 * from webhooks (the reliable path - covers renewals, failed renewals,
 * and cancellations too, none of which involve the user's browser at all).
 *
 * GrabPay/PayNow (available on the old one-time flow) don't support
 * recurring billing, so card is the only payment method here.
 */

const SUBSCRIPTION_FEE_CENTS = 999; // S$9.99/month - purely a prototype placeholder amount
const SUBSCRIPTION_CURRENCY = "sgd"; // SGD - Stripe account is Singapore-based, see git history on the old ACTIVATION_CURRENCY constant
const SUBSCRIPTION_INTERVAL = "month";
const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"];

function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set - sign up at https://dashboard.stripe.com/register, " +
        "grab your test secret key from Developers > API keys, and add it to server/.env"
    );
  }
  return new Stripe(key);
}

/**
 * @param {string} userId
 */
export async function getStatus(userId) {
  const [rows] = await pool.query(
    `SELECT is_active AS isActive, activated_at AS activatedAt,
            subscription_status AS subscriptionStatus, current_period_end AS currentPeriodEnd,
            stripe_customer_id AS stripeCustomerId
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;
  return {
    isActive: Boolean(user.isActive),
    activatedAt: user.activatedAt,
    subscriptionStatus: user.subscriptionStatus,
    currentPeriodEnd: user.currentPeriodEnd,
    hasBillingAccount: Boolean(user.stripeCustomerId),
  };
}

/**
 * Creates a Stripe Checkout Session for the monthly subscription and
 * returns the hosted payment page URL to redirect the user to. Uses an
 * inline `price_data` with `recurring` set rather than a pre-created
 * Stripe Price, same "self-contained prototype, nothing to configure in
 * the Stripe Dashboard first" approach the old one-time flow used.
 *
 * `metadata.userId` on the *session* is how verifyAndActivateFromSession()
 * ties the redirect back to a local user; `subscription_data.metadata` puts
 * the same userId directly on the Subscription object Stripe creates, since
 * subscription-related webhooks (renewals, cancellations) deliver that
 * object without ever referencing the original checkout session.
 *
 * @param {string} userId
 * @param {string} userEmail
 * @param {string} clientOrigin e.g. http://localhost:5173
 */
export async function createCheckoutSession(userId, userEmail, clientOrigin) {
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: userEmail,
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: SUBSCRIPTION_CURRENCY,
          product_data: { name: "Stock Screener - Monthly Subscription" },
          unit_amount: SUBSCRIPTION_FEE_CENTS,
          recurring: { interval: SUBSCRIPTION_INTERVAL },
        },
        quantity: 1,
      },
    ],
    // Stripe replaces the literal "{CHECKOUT_SESSION_ID}" placeholder itself
    // after a successful payment - do not substitute a real ID here.
    success_url: `${clientOrigin}/activate?session_id={CHECKOUT_SESSION_ID}&status=success`,
    cancel_url: `${clientOrigin}/activate?status=cancelled`,
    metadata: { userId },
    subscription_data: { metadata: { userId } },
  });

  return { url: session.url };
}

/**
 * Records one successful charge (first invoice or a renewal) as a `payment`
 * row. Keyed by `stripe_invoice_id` (nullable-unique) so this is safe to
 * call twice for the same invoice - both the post-checkout redirect and the
 * `invoice.paid` webhook can end up covering the same first invoice, and
 * Stripe can redeliver any webhook.
 *
 * @param {{ userId: string, amountCents: number, currency: string, stripeInvoiceId: string }} details
 */
async function recordInvoicePayment({ userId, amountCents, currency, stripeInvoiceId }) {
  await pool.query(
    `INSERT IGNORE INTO payment (id, user_id, amount_cents, currency, status, payment_method, stripe_invoice_id)
     VALUES (?, ?, ?, ?, 'succeeded', 'stripe_subscription', ?)`,
    [randomUUID(), userId, amountCents, currency.toUpperCase(), stripeInvoiceId]
  );
}

/**
 * Shared by every path that learns about a Stripe Subscription's current
 * state (post-checkout redirect, checkout.session.completed,
 * customer.subscription.updated/.deleted webhooks): writes the
 * subscription's id/status/period-end onto the user row and flips
 * `is_active` to match ACTIVE_SUBSCRIPTION_STATUSES. Sends the welcome
 * email exactly once, on the inactive -> active transition (not on every
 * webhook delivery, and not on renewals which stay active -> active).
 *
 * @param {import("stripe").Stripe.Subscription} subscription full Subscription object (needs .metadata.userId, .customer, .status, .current_period_end)
 * @param {string} [userIdHint] fallback if the subscription itself has no metadata.userId (shouldn't happen - createCheckoutSession always sets it)
 */
async function syncSubscriptionFromStripeObject(subscription, userIdHint) {
  const userId = subscription.metadata?.userId ?? userIdHint;
  if (!userId) {
    console.error(`[subscription] Stripe subscription ${subscription.id} has no metadata.userId, ignoring`);
    return null;
  }

  const current = await getStatus(userId);
  if (!current) {
    console.error(`[subscription] No local user for id ${userId} (stripe subscription ${subscription.id})`);
    return null;
  }

  const isNowActive = ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;

  await pool.query(
    `UPDATE users
     SET is_active = ?,
         activated_at = CASE WHEN ? = 1 THEN COALESCE(activated_at, NOW()) ELSE activated_at END,
         stripe_customer_id = ?,
         stripe_subscription_id = ?,
         subscription_status = ?,
         current_period_end = FROM_UNIXTIME(?)
     WHERE id = ?`,
    [
      isNowActive ? 1 : 0,
      isNowActive ? 1 : 0,
      customerId,
      subscription.id,
      subscription.status,
      subscription.current_period_end,
      userId,
    ]
  );

  if (!current.isActive && isNowActive) {
    // Best-effort - a broken/unconfigured SMTP setup should never fail
    // activation, since the account is already active by this point.
    try {
      const [rows] = await pool.query(`SELECT name, email FROM users WHERE id = ? LIMIT 1`, [userId]);
      const user = rows[0];
      if (user) {
        await sendWelcomeEmail({ to: user.email, name: user.name });
      }
    } catch (err) {
      console.error("[subscription] Welcome email failed:", err.message);
    }
  }

  return { userId, status: await getStatus(userId) };
}

/**
 * Given a just-completed Checkout Session's subscription (expanded to
 * include `latest_invoice`), syncs the subscription state onto the user
 * and records the first invoice as a payment. Shared by the redirect path
 * and the checkout.session.completed webhook below.
 *
 * @param {string} userId
 * @param {import("stripe").Stripe.Subscription} subscription expanded with latest_invoice
 */
async function activateFromCheckoutSubscription(userId, subscription) {
  const result = await syncSubscriptionFromStripeObject(subscription, userId);
  if (!result) {
    throw new Error(`No user found for id ${userId}`);
  }

  const invoice = subscription.latest_invoice;
  if (invoice && typeof invoice === "object" && invoice.status === "paid") {
    await recordInvoicePayment({
      userId,
      amountCents: invoice.amount_paid,
      currency: invoice.currency,
      stripeInvoiceId: invoice.id,
    });
  }

  return { ...result.status, paymentStatus: "paid" };
}

/**
 * Called when the user is redirected back from Stripe. Re-fetches the
 * session from Stripe's API (never trusts the redirect URL alone - anyone
 * could type a fake session_id into that URL) and only activates the
 * account if the session actually completed with a live subscription.
 *
 * This is a UX convenience so the user sees "activated" immediately on
 * return, not the sole activation mechanism - the webhook handlers below
 * are the reliable path if the user closes the tab, loses connectivity
 * before this ever runs, or for anything that happens later (renewals,
 * failed renewals, cancellations from the billing portal).
 *
 * @param {string} sessionId
 * @param {string} expectedUserId req.userId - must match the session's metadata.userId
 */
export async function verifyAndActivateFromSession(sessionId, expectedUserId) {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "subscription.latest_invoice"],
  });

  if (session.metadata?.userId !== expectedUserId) {
    throw new Error("This checkout session does not belong to the logged-in user");
  }

  if (session.status !== "complete" || !session.subscription) {
    return { isActive: false, activatedAt: null, paymentStatus: session.payment_status };
  }

  return activateFromCheckoutSubscription(expectedUserId, session.subscription);
}

/**
 * Verifies a raw webhook request body against Stripe's signature and
 * returns the parsed event. Throws if STRIPE_WEBHOOK_SECRET isn't
 * configured or the signature doesn't match - callers should treat that as
 * a 400, never process the body as trusted in that case.
 *
 * @param {Buffer} rawBody
 * @param {string} signature the `stripe-signature` request header
 */
export function constructWebhookEvent(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not set - add the webhook in the Stripe Dashboard " +
        "(Developers > Webhooks) and copy its signing secret into server/.env"
    );
  }
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/**
 * The reliable activation path for the *first* payment (Person 2 -
 * Subscription/Paywall security fix): unlike verifyAndActivateFromSession()
 * above, this doesn't depend on the user's browser making it back to
 * /activate - Stripe calls this directly from its own servers once the
 * first invoice actually completes, so a user who pays and then closes the
 * tab (or loses connectivity on the redirect) still gets activated.
 *
 * @param {import("stripe").Stripe.Checkout.Session} session unexpanded - session.subscription is just an id here
 */
export async function handleCheckoutSessionCompleted(session) {
  const userId = session.metadata?.userId;
  if (!userId || !session.subscription) return;

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(session.subscription, {
    expand: ["latest_invoice"],
  });

  await activateFromCheckoutSubscription(userId, subscription);
}

/**
 * customer.subscription.updated - fires on every subscription state change:
 * a renewal succeeding (period end moves forward), a renewal failing
 * (status -> past_due / unpaid), a plan change, etc. This is what keeps
 * `is_active` accurate over the life of the subscription, independent of
 * the user ever visiting the app again.
 *
 * @param {import("stripe").Stripe.Subscription} subscription
 */
export async function handleSubscriptionUpdated(subscription) {
  await syncSubscriptionFromStripeObject(subscription);
}

/**
 * customer.subscription.deleted - fires when a subscription is fully
 * canceled (immediately, or at period end once Stripe finalizes it).
 * `subscription.status` is already "canceled" on this event, so this just
 * reuses the same sync path to flip `is_active` off.
 *
 * @param {import("stripe").Stripe.Subscription} subscription
 */
export async function handleSubscriptionDeleted(subscription) {
  await syncSubscriptionFromStripeObject(subscription);
}

/**
 * Actually cancels a user's Stripe subscription (immediately, not just at
 * period end) - called from the admin dashboard's "revoke access" so
 * revoking someone sticks instead of being silently undone by their next
 * renewal (see the caveat this used to have in admin.service.js's
 * revokeUser()). Syncs the canceled status onto the user row directly from
 * Stripe's response rather than waiting on the customer.subscription.deleted
 * webhook, so access is revoked immediately even if the webhook is slow,
 * misconfigured, or arrives later - the webhook handler above is still the
 * reliable path for cancellations a user makes themselves (e.g. via the
 * billing portal), this is just the same sync path invoked eagerly.
 *
 * A no-op if the user never subscribed (no stripe_subscription_id) or their
 * subscription is already canceled - safe to call unconditionally from
 * revokeUser() regardless of the user's billing history.
 *
 * @param {string} userId
 */
export async function cancelSubscriptionForUser(userId) {
  const [rows] = await pool.query(
    `SELECT stripe_subscription_id AS stripeSubscriptionId FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const subscriptionId = rows[0]?.stripeSubscriptionId;
  if (!subscriptionId) return;

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.status === "canceled") return;

  const canceled = await stripe.subscriptions.cancel(subscriptionId);
  await syncSubscriptionFromStripeObject(canceled);
}

/**
 * invoice.paid - fires for the first invoice AND every renewal. Records the
 * charge in `payment` (idempotent via stripe_invoice_id, so this safely
 * overlaps with activateFromCheckoutSubscription() recording the same first
 * invoice). Subscription status/period-end are synced separately via
 * customer.subscription.updated, which Stripe always sends alongside this.
 *
 * @param {import("stripe").Stripe.Invoice} invoice
 */
export async function handleInvoicePaid(invoice) {
  if (!invoice.subscription) return; // not a subscription invoice - ignore

  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const [rows] = await pool.query(`SELECT id FROM users WHERE stripe_customer_id = ? LIMIT 1`, [customerId]);
  const user = rows[0];
  if (!user) {
    console.error(`[subscription] invoice.paid for unknown stripe_customer_id ${customerId}, ignoring`);
    return;
  }

  await recordInvoicePayment({
    userId: user.id,
    amountCents: invoice.amount_paid,
    currency: invoice.currency,
    stripeInvoiceId: invoice.id,
  });
}

/**
 * Stripe's hosted "Manage billing" page - lets a subscribed user see their
 * invoice history and cancel/update payment method themselves without any
 * custom UI on our side. Requires the user to already have a
 * stripe_customer_id (i.e. to have completed checkout at least once).
 *
 * @param {string} userId
 * @param {string} clientOrigin e.g. http://localhost:5173
 */
export async function createBillingPortalSession(userId, clientOrigin) {
  const [rows] = await pool.query(`SELECT stripe_customer_id AS stripeCustomerId FROM users WHERE id = ? LIMIT 1`, [
    userId,
  ]);
  const customerId = rows[0]?.stripeCustomerId;
  if (!customerId) {
    throw new Error("No billing account on file yet - subscribe first before managing billing.");
  }

  const stripe = getStripeClient();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${clientOrigin}/`,
  });

  return { url: portalSession.url };
}

/**
 * @param {string} userId
 */
export async function listPayments(userId) {
  const [rows] = await pool.query(
    `SELECT id, amount_cents AS amountCents, currency, status, payment_method AS paymentMethod, paid_at AS paidAt
     FROM payment WHERE user_id = ? ORDER BY paid_at DESC`,
    [userId]
  );
  return rows;
}

export const SUBSCRIPTION_FEE = {
  amountCents: SUBSCRIPTION_FEE_CENTS,
  currency: SUBSCRIPTION_CURRENCY.toUpperCase(),
  interval: SUBSCRIPTION_INTERVAL,
};
