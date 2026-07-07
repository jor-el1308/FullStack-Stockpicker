/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 * Login/signup form (POST /api/auth/login, /api/auth/signup) plus, once
 * logged in, a minimal account panel confirming the logged-in user.
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
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const body =
        mode === "login"
          ? { email: form.email, password: form.password }
          : { email: form.email, password: form.password, name: form.name };
      const data = await api.post(path, body);
      onAuthenticated(data.user, data.token);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
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

        <div>
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
        <button type="button" onClick={onLogout} className="auth-button" style={{ width: "auto" }}>
          Log Out
        </button>
      </section>
    </div>
  );
}
