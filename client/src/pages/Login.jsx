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
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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

  if (user) {
    return <AccountPanel user={user} onLogout={logout} />;
  }
  return <AuthForm onAuthenticated={login} />;
}

function AuthForm({ onAuthenticated }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", confirmPassword: "", name: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Login 2FA (Person 2): "credentials" is the normal email+password step;
  // "otp" is the second step after a correct password gets a code emailed.
  const [stage, setStage] = useState("credentials");
  const [preAuthToken, setPreAuthToken] = useState(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  function finishLogin(data) {
    onAuthenticated(data.user, data.token);
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
