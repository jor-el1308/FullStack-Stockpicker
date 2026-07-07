import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { pool } from "../config/db.js";

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
 * frontend. After payment, Stripe redirects back to our success_url with
 * a session_id, which verifyAndActivateFromSession() looks up to confirm
 * payment actually succeeded before activating the account (never trust
 * the redirect alone - a user could hand-craft that URL).
 *
 * Billing model: one-time activation fee, no recurring subscription.
 */

const ACTIVATION_FEE_CENTS = 999; // $9.99 one-time - purely a prototype placeholder amount
const ACTIVATION_CURRENCY = "usd";

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
    `SELECT is_active AS isActive, activated_at AS activatedAt FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;
  return { isActive: Boolean(user.isActive), activatedAt: user.activatedAt };
}

/**
 * Shared DB write: records a payment row and flips the user active.
 * The only caller is the real Stripe flow below, but this stays a
 * separate function so there's exactly one place that touches these
 * tables if another payment path is ever added.
 *
 * @param {string} userId
 * @param {{ amountCents: number, currency: string, paymentMethod: string }} details
 */
async function recordPaymentAndActivate(userId, { amountCents, currency, paymentMethod }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO payment (id, user_id, amount_cents, currency, status, payment_method)
       VALUES (?, ?, ?, ?, 'succeeded', ?)`,
      [randomUUID(), userId, amountCents, currency, paymentMethod]
    );

    await conn.query(`UPDATE users SET is_active = 1, activated_at = NOW() WHERE id = ?`, [userId]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return getStatus(userId);
}

/**
 * Creates a Stripe Checkout Session for the one-time activation fee and
 * returns the hosted payment page URL to redirect the user to.
 *
 * @param {string} userId
 * @param {string} userEmail
 * @param {string} clientOrigin e.g. http://localhost:5173
 */
export async function createCheckoutSession(userId, userEmail, clientOrigin) {
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: userEmail,
    line_items: [
      {
        price_data: {
          currency: ACTIVATION_CURRENCY,
          product_data: { name: "Stock Screener - Account Activation (one-time)" },
          unit_amount: ACTIVATION_FEE_CENTS,
        },
        quantity: 1,
      },
    ],
    // Stripe replaces the literal "{CHECKOUT_SESSION_ID}" placeholder itself
    // after a successful payment - do not substitute a real ID here.
    success_url: `${clientOrigin}/activate?session_id={CHECKOUT_SESSION_ID}&status=success`,
    cancel_url: `${clientOrigin}/activate?status=cancelled`,
    metadata: { userId },
  });

  return { url: session.url };
}

/**
 * Called when the user is redirected back from Stripe. Re-fetches the
 * session from Stripe's API (never trusts the redirect URL alone - anyone
 * could type a fake session_id into that URL) and only activates the
 * account if Stripe confirms payment_status === "paid".
 *
 * @param {string} sessionId
 * @param {string} expectedUserId req.userId - must match the session's metadata.userId
 */
export async function verifyAndActivateFromSession(sessionId, expectedUserId) {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.metadata?.userId !== expectedUserId) {
    throw new Error("This checkout session does not belong to the logged-in user");
  }

  if (session.payment_status !== "paid") {
    return { isActive: false, activatedAt: null, paymentStatus: session.payment_status };
  }

  const status = await recordPaymentAndActivate(expectedUserId, {
    amountCents: session.amount_total ?? ACTIVATION_FEE_CENTS,
    currency: (session.currency ?? ACTIVATION_CURRENCY).toUpperCase(),
    paymentMethod: "stripe_test",
  });

  return { ...status, paymentStatus: session.payment_status };
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

export const ACTIVATION_FEE = { amountCents: ACTIVATION_FEE_CENTS, currency: ACTIVATION_CURRENCY.toUpperCase() };
