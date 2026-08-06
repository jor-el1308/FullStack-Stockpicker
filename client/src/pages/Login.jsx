/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 * Login/signup form (POST /api/auth/login, /api/auth/signup) plus, once
 * logged in, a minimal account panel confirming the logged-in user.
 *
 * NOTE for Person 1 (added by Person 2 for the subscription/paywall feature -
 * please review): after signup/login, new/unpaid accounts (isActive: false)
 * now route to /activate instead of straight to "/" - see handleSubmit()
 * below and client/src/pages/Activate.jsx.
 *
 * NOTE for Person 1 (added by Person 2 for login 2FA - please review): login
 * is now two steps. Step 1 (email+password) no longer logs the user in
 * directly - a correct password gets a one-time code emailed and the form
 * switches to an OTP entry stage (see `stage` state below). Step 2
 * (POST /auth/verify-otp) is what actually calls onAuthenticated(). Signup
 * is unchanged except for an added "Confirm Password" field, checked
 * client-side before submitting.
 *
 * "Sign in with Google" / "Sign in with Microsoft" (Person 1): the buttons
 * below are plain links to GET /api/auth/oauth/google and
 * /api/auth/oauth/microsoft (server/src/controllers/auth.controller.js) -
 * full-page navigations, not fetch calls, since the OAuth flow needs the
 * browser to actually visit the provider's consent screen. Either provider
 * redirects back to this same page with an `oauth=success` or `oauth=error`
 * query string (see googleOAuthCallback()/microsoftOAuthCallback()), which
 * the effect in Login() below picks up: on success it fetches the
 * now-logged-in user via GET /auth/me (the session cookie was already set
 * server-side) and finishes login the same way password login does; on
 * error it just surfaces the message.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const CRITERIA_OPTIONS = [
  { key: "marketCap", label: "Market Cap" },
  { key: "dividendCents", label: "Dividend (cents)" },
  { key: "revenue", label: "Revenue" },
  { key: "profitBeforeTax", label: "Profit Before Tax" },
  { key: "profitAfterTax", label: "Profit After Tax" },
  { key: "ebita", label: "EBITA" },
  { key: "peRatio", label: "P/E Ratio" },
  { key: "companyAgeYears", label: "Company Age (years)" },
];

export default function Login() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [oauthError, setOauthError] = useState("");
  // Only true while we still need to fetch the freshly-logged-in user after
  // a successful Google/Microsoft redirect - avoids flashing the empty
  // login form for the split second before that GET /auth/me resolves.
  const [checkingOAuth, setCheckingOAuth] = useState(searchParams.get("oauth") === "success");

  useEffect(() => {
    const oauth = searchParams.get("oauth");
    if (oauth === "success") {
      api
        .get("/auth/me")
        .then((freshUser) => {
          login(freshUser);
          navigate(freshUser.isActive ? "/" : "/activate", { replace: true });
        })
        .catch(() => {
          setOauthError("Sign-in failed - please try again.");
          setCheckingOAuth(false);
          navigate("/login", { replace: true });
        });
    } else if (oauth === "error") {
      setOauthError(searchParams.get("message") || "Sign-in failed - please try again.");
      navigate("/login", { replace: true });
    }
    // Only ever meant to run once, against whatever query string this page
    // first loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checkingOAuth) {
    return (
      <div className="auth-dark-page">
        <div className="auth-dark-hero" />
        <aside className="auth-dark-sidebar">
          <div className="auth-dark-content">
            <p className="auth-dark-subtitle">Signing you in...</p>
          </div>
        </aside>
      </div>
    );
  }

  if (user) {
    return <AccountPanel user={user} onLogout={logout} />;
  }
  return <AuthForm onAuthenticated={login} oauthError={oauthError} />;
}

function AuthForm({ onAuthenticated, oauthError }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", confirmPassword: "", name: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Surfaces an error handed down from a failed Google redirect (see
  // Login() above). A plain assignment rather than useState's initializer
  // since oauthError can arrive after this component has already mounted.
  useEffect(() => {
    if (oauthError) setError(oauthError);
  }, [oauthError]);

  // Login 2FA (Person 2): "credentials" is the normal email+password step;
  // "otp" is the second step after a correct password gets a code emailed.
  const [stage, setStage] = useState("credentials");
  const [preAuthToken, setPreAuthToken] = useState(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  function finishLogin(data) {
    onAuthenticated(data.user);
    // Subscription/paywall (Person 2): unpaid accounts go to /activate
    // instead of the main app.
    navigate(data.user.isActive ? "/" : "/activate");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (mode === "signup" && form.password !== form.confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setSubmitting(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const body =
        mode === "login"
          ? { email: form.email, password: form.password }
          : { email: form.email, password: form.password, name: form.name };
      const data = await api.post(path, body);

      if (mode === "login" && data.mfaRequired) {
        setPreAuthToken(data.preAuthToken);
        setPendingEmail(data.email);
        setStage("otp");
        return;
      }

      finishLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtpSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await api.post("/auth/verify-otp", { preAuthToken, code: otp });
      finishLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendOtp() {
    setError("");
    setResendMessage("");
    setResending(true);
    try {
      await api.post("/auth/resend-otp", { preAuthToken });
      setResendMessage("New code sent.");
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  function handleBackToCredentials() {
    setStage("credentials");
    setOtp("");
    setError("");
    setResendMessage("");
  }

  return (
    <div className="auth-dark-page">
      <div className="auth-dark-hero">
        <div className="auth-dark-hero-inner">
          <span className="auth-dark-hero-eyebrow">Stock Screener</span>
          <h2 className="auth-dark-hero-title">Find promising investments, faster.</h2>
          <p className="auth-dark-hero-text">
            Screen stocks by fundamentals, track dividends and valuations, and build
            watchlists tailored to the criteria that matter to you.
          </p>
        </div>
      </div>

      <aside className="auth-dark-sidebar">
        <div className="auth-dark-logo">
          <span className="auth-dark-logo-mark">SS</span>
          <span className="auth-dark-logo-text">Stock Screener</span>
        </div>

        <div className="auth-dark-content">
          {stage === "credentials" ? (
            <>
              <h1 className="auth-dark-title">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
              <p className="auth-dark-subtitle">
                {mode === "login"
                  ? "Log in to access your saved screeners and watchlist."
                  : "Sign up to start building your investment screeners."}
              </p>
              <form onSubmit={handleSubmit} className="auth-dark-form">
                {mode === "signup" && (
                  <label className="auth-dark-label">
                    Name
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="auth-dark-input"
                    />
                  </label>
                )}
                <label className="auth-dark-label">
                  Email
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="auth-dark-input"
                  />
                </label>
                <label className="auth-dark-label">
                  Password
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="auth-dark-input"
                  />
                </label>
                {mode === "signup" && (
                  <label className="auth-dark-label">
                    Confirm Password
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={form.confirmPassword}
                      onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                      className="auth-dark-input"
                    />
                  </label>
                )}
                {error && <p className="auth-dark-error">{error}</p>}
                <button type="submit" disabled={submitting} className="auth-dark-button">
                  {submitting ? "Please wait..." : mode === "login" ? "Log In" : "Sign Up"}
                </button>
              </form>

              <div className="auth-dark-divider">
                <span>or</span>
              </div>
              {/* Full-page links (not fetch/onClick) to GET /api/auth/oauth/google
                  and /api/auth/oauth/microsoft - the browser needs to actually
                  navigate to the provider's consent screen. Works for both login
                  and signup: a first-time sign-in creates the account
                  automatically (see findOrCreateGoogleUser()/findOrCreateMicrosoftUser()). */}
              <div className="auth-oauth-buttons">
                <a href="/api/auth/oauth/google" className="auth-google-button">
                  <GoogleLogo />
                  Continue with Google
                </a>
                <a href="/api/auth/oauth/microsoft" className="auth-microsoft-button">
                  <MicrosoftLogo />
                  Continue with Microsoft
                </a>
              </div>

              <p className="auth-dark-footer">
                {mode === "login" ? "Need an account? " : "Already have an account? "}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login");
                    setError("");
                  }}
                  className="auth-dark-link"
                >
                  {mode === "login" ? "Sign up" : "Log in"}
                </button>
              </p>
            </>
          ) : (
            <>
              <h1 className="auth-dark-title">Check your email</h1>
              <p className="auth-dark-subtitle">
                We sent a 6-digit code to {pendingEmail}. Enter it below to finish logging in.
              </p>
              <form onSubmit={handleOtpSubmit} className="auth-dark-form">
                <label className="auth-dark-label">
                  Verification code
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    autoFocus
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="auth-dark-input"
                    style={{ letterSpacing: "0.3em", textAlign: "center", fontFamily: "var(--font-numeric)" }}
                  />
                </label>
                {error && <p className="auth-dark-error">{error}</p>}
                {resendMessage && (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--color-good)" }}>{resendMessage}</p>
                )}
                <button type="submit" disabled={submitting || otp.length !== 6} className="auth-dark-button">
                  {submitting ? "Verifying..." : "Verify & Log In"}
                </button>
              </form>
              <p className="auth-dark-footer">
                Didn't get it?{" "}
                <button type="button" onClick={handleResendOtp} disabled={resending} className="auth-dark-link">
                  {resending ? "Sending..." : "Resend code"}
                </button>
                {" · "}
                <button type="button" onClick={handleBackToCredentials} className="auth-dark-link">
                  Back
                </button>
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

// Google's official four-color "G" mark, per Google's branding guidelines
// for third-party "Sign in with Google" buttons.
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.8741 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.3436 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.9641 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9641 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.3459l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6564 3.5795 9 3.5795z"
      />
    </svg>
  );
}

// Microsoft's official four-square logo mark, per Microsoft's branding
// guidelines for third-party "Sign in with Microsoft" buttons.
function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022" />
      <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00" />
      <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF" />
      <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900" />
    </svg>
  );
}

function AccountPanel({ user, onLogout }) {
  return (
    <div className="auth-page">
      <section className="auth-card account-card">
        <h1 className="auth-title" style={{ textAlign: "left" }}>
          My Account
        </h1>
        <p style={{ marginTop: 0 }}>
          Logged in as <strong>{user.name}</strong> ({user.email})
        </p>
        <p style={{ fontSize: 13, color: user.isActive ? "#00A86B" : "#D16B6B" }}>
          {user.isActive ? "Account active" : "Account not activated - payment required"}
        </p>
        <button type="button" onClick={onLogout} className="auth-button" style={{ width: "auto" }}>
          Log Out
        </button>
      </section>
    </div>
  );
}
