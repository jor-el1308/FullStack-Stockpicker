/**
 * Owner: Person 2 (Charles) - Data Pipeline + Subscription/Paywall.
 *
 * Stripe Checkout (TEST MODE) - real Stripe-hosted payment page, real test
 * card numbers, nothing actually charged. Flow:
 *   1. User clicks "Pay & activate" -> POST /api/subscription/checkout-session
 *      -> redirect the whole page to the Stripe-hosted url we get back.
 *   2. User pays on Stripe's page with a test card (e.g. 4242 4242 4242 4242,
 *      any future expiry, any CVC).
 *   3. Stripe redirects back here with ?session_id=...&status=success.
 *   4. We call GET /api/subscription/verify-session?session_id=... - the
 *      server re-checks with Stripe directly (never trusts the URL alone)
 *      and only then marks the account active.
 *
 * If STRIPE_SECRET_KEY isn't configured on the server yet, step 1 will
 * fail with a clear error message telling you to set it up - see
 * server/.env.example.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors, fonts, fontWeights } from "../theme";

const ACTIVATION_FEE_DISPLAY = "S$9.99";

export default function Activate() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const verifiedRef = useRef(false);

  const sessionId = searchParams.get("session_id");
  const status = searchParams.get("status");

  // Not logged in at all (e.g. visited /activate directly) - nothing here
  // works without a token, so bounce to login instead of showing dead buttons.
  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
    }
  }, [user, navigate]);

  // Handle the return trip from Stripe Checkout.
  useEffect(() => {
    if (status === "cancelled") {
      setCancelled(true);
      return;
    }
    if (!sessionId || verifiedRef.current) return;
    verifiedRef.current = true;

    setVerifying(true);
    api
      .get(`/subscription/verify-session?session_id=${encodeURIComponent(sessionId)}`)
      .then((result) => {
        if (result.isActive) {
          updateUser({ isActive: true, activatedAt: result.activatedAt });
          navigate("/", { replace: true });
        } else {
          setError(`Payment not completed (status: ${result.paymentStatus}). You can try again below.`);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setVerifying(false));
  }, [sessionId, status, navigate, updateUser]);

  async function handlePay() {
    setError("");
    setSubmitting(true);
    try {
      const { url } = await api.post("/subscription/checkout-session");
      window.location.href = url; // full redirect to Stripe's hosted Checkout page
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  if (!user) {
    return null; // redirecting via the effect above
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.lightBackground,
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 32,
          maxWidth: 420,
          width: "100%",
        }}
      >
        <div style={{ fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 20, color: colors.darkMenu, marginBottom: 8 }}>
          Activate your account
        </div>
        <p style={{ fontFamily: fonts.description, color: colors.mutedText, fontSize: 13, marginBottom: 20 }}>
          {user?.name ? `Hi ${user.name}, one` : "One"} more step - a one-time activation fee unlocks the
          screener, dashboard, and watchlist. This uses Stripe's test mode - you'll pay with a fake test
          card, nothing is actually charged.
        </p>

        {verifying && (
          <p style={{ fontFamily: fonts.description, color: colors.mutedText, fontSize: 13, marginBottom: 16 }}>
            Confirming your payment with Stripe...
          </p>
        )}

        {cancelled && !verifying && (
          <p style={{ fontFamily: fonts.description, color: colors.badNumber, fontSize: 13, marginBottom: 16 }}>
            Payment was cancelled. You can try again below.
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          <span style={{ fontFamily: fonts.description, fontSize: 13, color: colors.darkMenu }}>
            One-time activation fee
          </span>
          <span style={{ fontFamily: fonts.numeric, fontWeight: fontWeights.numeric, fontSize: 16, color: colors.darkMenu }}>
            {ACTIVATION_FEE_DISPLAY}
          </span>
        </div>

        <p style={{ fontFamily: fonts.description, color: colors.mutedText, fontSize: 12, marginBottom: 16 }}>
          Test card: 4242 4242 4242 4242 · any future expiry · any 3-digit CVC
        </p>

        {error && (
          <p style={{ fontFamily: fonts.description, color: colors.badNumber, fontSize: 13, marginBottom: 12 }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handlePay}
          disabled={submitting || verifying}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 8,
            border: "none",
            background: colors.clickable,
            color: "#fff",
            fontFamily: fonts.titleLabel,
            fontWeight: fontWeights.titleLabel,
            fontSize: 14,
            cursor: submitting || verifying ? "default" : "pointer",
            opacity: submitting || verifying ? 0.7 : 1,
          }}
        >
          {submitting ? "Redirecting to Stripe..." : `Pay ${ACTIVATION_FEE_DISPLAY} & activate`}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: "none",
            color: colors.mutedText,
            fontFamily: fonts.description,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Log out instead
        </button>
      </div>
    </div>
  );
}
