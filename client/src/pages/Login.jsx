/**
 * Owner: Person 1 (Yong Wee) - Auth & User Management.
 * Login/signup form (POST /api/auth/login, /api/auth/signup) plus, once
 * logged in, an account panel for saving/viewing screener criteria sets
 * (GET/POST /api/auth/me/criteria-sets).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

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
    <section style={{ maxWidth: 380 }}>
      <h1>{mode === "login" ? "Log In" : "Create Account"}</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "signup" && (
          <label>
            Name
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={inputStyle}
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            style={inputStyle}
          />
        </label>
        {error && <p style={{ color: colors.badNumber }}>{error}</p>}
        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? "Please wait..." : mode === "login" ? "Log In" : "Sign Up"}
        </button>
      </form>
      <p>
        {mode === "login" ? "Need an account? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
          }}
          style={linkButtonStyle}
        >
          {mode === "login" ? "Sign up" : "Log in"}
        </button>
      </p>
    </section>
  );
}

function AccountPanel({ user, onLogout }) {
  const [sets, setSets] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [rows, setRows] = useState([{ key: CRITERIA_OPTIONS[0].key, min: "", max: "" }]);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshSets();
  }, []);

  async function refreshSets() {
    try {
      const data = await api.get("/auth/me/criteria-sets");
      setSets(data);
    } catch (err) {
      setLoadError(err.message);
    }
  }

  function updateRow(index, field, value) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { key: CRITERIA_OPTIONS[0].key, min: "", max: "" }]);
  }

  function removeRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaveError("");
    setSaving(true);
    try {
      const criteria = rows
        .filter((row) => row.min !== "" || row.max !== "")
        .map((row) => ({
          key: row.key,
          min: row.min === "" ? undefined : Number(row.min),
          max: row.max === "" ? undefined : Number(row.max),
        }));
      if (criteria.length === 0) {
        throw new Error("Add at least one criteria row with a min or max value");
      }
      await api.post("/auth/me/criteria-sets", { name, criteria });
      setName("");
      setRows([{ key: CRITERIA_OPTIONS[0].key, min: "", max: "" }]);
      await refreshSets();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ maxWidth: 560 }}>
      <h1>My Account</h1>
      <p>
        Logged in as <strong>{user.name}</strong> ({user.email})
        <button type="button" onClick={onLogout} style={{ ...buttonStyle, marginLeft: 16 }}>
          Log Out
        </button>
      </p>

      <h2>Saved Screener Criteria</h2>
      {loadError && <p style={{ color: colors.badNumber }}>{loadError}</p>}
      {sets.length === 0 && !loadError && <p>No saved criteria sets yet.</p>}
      <ul>
        {sets.map((set) => (
          <li key={set.id}>
            <strong>{set.name}</strong>
            <ul>
              {set.criteria.map((range, i) => (
                <li key={i} className="numeric">
                  {range.key}: {range.min ?? "–"} to {range.max ?? "–"}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <h2>Save a New Criteria Set</h2>
      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Set name
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </label>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={row.key} onChange={(e) => updateRow(i, "key", e.target.value)} style={inputStyle}>
              {CRITERIA_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Min"
              value={row.min}
              onChange={(e) => updateRow(i, "min", e.target.value)}
              style={inputStyle}
            />
            <input
              type="number"
              placeholder="Max"
              value={row.max}
              onChange={(e) => updateRow(i, "max", e.target.value)}
              style={inputStyle}
            />
            {rows.length > 1 && (
              <button type="button" onClick={() => removeRow(i)} style={buttonStyle}>
                Remove
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addRow} style={{ ...buttonStyle, alignSelf: "flex-start" }}>
          + Add Criteria Row
        </button>
        {saveError && <p style={{ color: colors.badNumber }}>{saveError}</p>}
        <button type="submit" disabled={saving} style={buttonStyle}>
          {saving ? "Saving..." : "Save Criteria Set"}
        </button>
      </form>
    </section>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  padding: "8px 10px",
  marginTop: 4,
  border: "1px solid #ccc",
  borderRadius: 4,
  fontFamily: "inherit",
};

const buttonStyle = {
  padding: "8px 14px",
  background: colors.clickable,
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const linkButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  textDecoration: "underline",
  color: colors.clickable,
};
