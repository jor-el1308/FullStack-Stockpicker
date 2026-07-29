import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import {
  getSubscriptionStatus,
  cancelSubscription,
  resumeSubscription,
  createBillingPortalSession,
  listMyPayments,
  changeMyPassword,
  deleteMyAccount,
} from "../api/subscription";

/**
 * Account settings (Person 2 - Subscription/Paywall).
 *
 * GitHub-style sub-navigation: a left menu of categories (Account,
 * Appearance, Password, Subscription, Billing history, Delete account) and a
 * content pane on the right that shows only the selected one. Defaults to
 * Account. Each category owns its own control (dark-mode toggle, password
 * form, subscription cancel/resume + Stripe billing portal, payment history,
 * and self-service deletion with password re-confirmation).
 */

const TABS = [
  { id: "account", label: "Account", icon: "bi-person" },
  { id: "appearance", label: "Appearance", icon: "bi-palette" },
  { id: "password", label: "Password", icon: "bi-shield-lock" },
  { id: "subscription", label: "Subscription", icon: "bi-star" },
  { id: "billing", label: "Billing history", icon: "bi-receipt" },
  { id: "delete", label: "Delete account", icon: "bi-trash" },
];

function fmtDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function fmtShortDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtMoney(cents, currency) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "SGD" });
}

function initialsOf(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Big heading + helper text at the top of a panel, with a divider under it. */
function PanelHeader({ title, help }) {
  return (
    <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 12, marginBottom: 20 }}>
      <h2 style={{ fontFamily: "var(--font-title)", fontWeight: 600, fontSize: 20, margin: 0, color: "var(--color-text)" }}>
        {title}
      </h2>
      {help && <p className="settings-row-sub" style={{ margin: "4px 0 0" }}>{help}</p>}
    </div>
  );
}

function StatusBadge({ tone, children }) {
  const color = tone === "admin" ? "var(--color-special, #C9A84C)" : "var(--color-good)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        border: `1px solid ${color}`,
        color,
        fontFamily: "var(--font-title)",
        fontWeight: 600,
        fontSize: 11,
      }}
    >
      {children}
    </span>
  );
}

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const [active, setActive] = useState("account");

  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [billingBusy, setBillingBusy] = useState(false); // "cancel" | "resume" | "portal" | false
  const [billingMsg, setBillingMsg] = useState("");

  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    getSubscriptionStatus()
      .then(setStatus)
      .catch((err) => setStatusError(err.message))
      .finally(() => setStatusLoading(false));
  }, []);

  async function handleCancel() {
    if (!window.confirm("Cancel your subscription? You'll keep access until the end of the current billing period.")) {
      return;
    }
    setBillingBusy("cancel");
    setBillingMsg("");
    try {
      const next = await cancelSubscription();
      setStatus(next);
      setBillingMsg("Your subscription is scheduled to cancel at the end of this period.");
    } catch (err) {
      setBillingMsg(err.message);
    } finally {
      setBillingBusy(false);
    }
  }

  async function handleResume() {
    setBillingBusy("resume");
    setBillingMsg("");
    try {
      const next = await resumeSubscription();
      setStatus(next);
      setBillingMsg("Your subscription will continue - renewal is back on.");
    } catch (err) {
      setBillingMsg(err.message);
    } finally {
      setBillingBusy(false);
    }
  }

  async function handlePortal() {
    setBillingBusy("portal");
    setBillingMsg("");
    try {
      const { url } = await createBillingPortalSession();
      window.location.href = url;
    } catch (err) {
      setBillingBusy(false);
      setBillingMsg(err.message);
    }
  }

  const renewDate = fmtDate(status?.currentPeriodEnd);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your app preferences, subscription, and account.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Left sub-navigation */}
        <nav style={{ flex: "0 0 200px", display: "flex", flexDirection: "column", gap: 2 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={"settings-nav-item" + (active === t.id ? " active" : "")}
              onClick={() => setActive(t.id)}
            >
              <i className={"bi " + t.icon} />
              {t.label}
            </button>
          ))}
        </nav>

        {/* Content pane - only the selected category */}
        <div style={{ flex: "1 1 auto", minWidth: 0, maxWidth: 640 }}>
          {active === "account" && (
            <div>
              <PanelHeader title="Account" help="Your account details." />
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <div
                  style={{
                    flex: "0 0 auto",
                    width: 96,
                    height: 96,
                    borderRadius: "50%",
                    background: "var(--color-clickable)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-title)",
                    fontWeight: 600,
                    fontSize: 34,
                  }}
                >
                  {initialsOf(user?.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-title)", fontWeight: 600, fontSize: 18, color: "var(--color-text)" }}>
                    {user?.name}
                  </div>
                  <div
                    className="settings-row-sub"
                    title={user?.email}
                    style={{ marginTop: 2, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {user?.email}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {user?.isAdmin && <StatusBadge tone="admin">Admin</StatusBadge>}
                    {user?.isActive && <StatusBadge tone="active">Active</StatusBadge>}
                  </div>
                </div>
              </div>
              {user?.createdAt && (
                <div className="settings-row-sub" style={{ marginTop: 18 }}>Member since {fmtDate(user.createdAt)}</div>
              )}
            </div>
          )}

          {active === "appearance" && (
            <div>
              <PanelHeader title="Appearance" help="Switch between a light and dark theme for the app." />
              <div className="theme-toggle-wrap">
                <i className="bi bi-sun theme-toggle-icon" />
                <input
                  type="checkbox"
                  className="theme-toggle"
                  role="switch"
                  aria-label="Toggle dark mode"
                  checked={isDark}
                  onChange={toggleTheme}
                />
                <i className="bi bi-moon-stars theme-toggle-icon" />
              </div>
            </div>
          )}

          {active === "password" && (
            <div>
              <PanelHeader title="Change password" help="Use at least 8 characters. You'll stay logged in on this device." />
              <ChangePasswordControl />
            </div>
          )}

          {active === "subscription" && (
            <div>
              <PanelHeader title="Subscription" help="Your monthly plan and its renewal." />
              {statusLoading && <div className="settings-row-sub">Loading subscription…</div>}
              {statusError && <div className="settings-row-sub" style={{ color: "var(--color-bad)" }}>{statusError}</div>}

              {!statusLoading && !statusError && status && (
                <>
                  {status.hasBillingAccount ? (
                    status.cancelAtPeriodEnd ? (
                      <div className="settings-row-sub">
                        Your subscription is set to cancel{renewDate ? ` on ${renewDate}` : " at the end of the period"}.
                        You'll keep full access until then.
                      </div>
                    ) : status.isActive ? (
                      <div className="settings-row-sub">
                        Active — S$9.99/month{renewDate ? `, renews on ${renewDate}` : ""}.
                      </div>
                    ) : (
                      <div className="settings-row-sub">Your subscription isn't currently active.</div>
                    )
                  ) : (
                    <div className="settings-row-sub">
                      No paid subscription is on file for this account (access was granted directly).
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                    {status.hasBillingAccount && !status.cancelAtPeriodEnd && status.isActive && (
                      <button type="button" className="btn btn-danger" disabled={billingBusy} onClick={handleCancel}>
                        {billingBusy === "cancel" ? "Cancelling…" : "Cancel subscription"}
                      </button>
                    )}
                    {status.hasBillingAccount && status.cancelAtPeriodEnd && (
                      <button type="button" className="btn btn-primary" disabled={billingBusy} onClick={handleResume}>
                        {billingBusy === "resume" ? "Resuming…" : "Resume subscription"}
                      </button>
                    )}
                    {status.hasBillingAccount && (
                      <button type="button" className="btn btn-secondary" disabled={billingBusy} onClick={handlePortal}>
                        <i className="bi bi-credit-card" />
                        {billingBusy === "portal" ? "Opening…" : "Manage billing & invoices"}
                      </button>
                    )}
                  </div>

                  {billingMsg && <div className="settings-row-sub" style={{ marginTop: 12 }}>{billingMsg}</div>}
                </>
              )}
            </div>
          )}

          {active === "billing" && (
            <div>
              <PanelHeader title="Billing history" help="Your past payments." />
              <BillingHistoryControl />
            </div>
          )}

          {active === "delete" && (
            <div>
              <PanelHeader
                title="Delete account"
                help="Permanently delete your account and all your saved screens and watchlists. Any active subscription is cancelled. This can't be undone."
              />
              <button type="button" className="btn btn-danger" onClick={() => setShowDelete(true)}>
                Delete account
              </button>
            </div>
          )}
        </div>
      </div>

      {showDelete && (
        <DeleteAccountModal
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            logout();
            navigate("/login");
          }}
        />
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  maxWidth: 460,
  padding: "9px 12px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
};

/**
 * "Change password" control - verifies the current password server-side, so
 * no client-side check beyond the new/confirm match and minimum length.
 */
function ChangePasswordControl() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setDone(false);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await changeMyPassword(currentPassword, newPassword);
      setDone(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          style={inputStyle}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          style={inputStyle}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          style={inputStyle}
        />
      </div>

      {error && <div className="settings-row-sub" style={{ color: "var(--color-bad)", marginTop: 10 }}>{error}</div>}
      {done && (
        <div className="settings-row-sub" style={{ color: "var(--color-good)", marginTop: 10 }}>Password updated.</div>
      )}

      <div style={{ marginTop: 14 }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !currentPassword || !newPassword || !confirm}
        >
          {busy ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}

/**
 * "Billing history" control - the user's own past payments. Backed by
 * GET /api/subscription/payments (listMyPayments).
 */
function BillingHistoryControl() {
  const [payments, setPayments] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listMyPayments()
      .then(setPayments)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="settings-row-sub">Loading…</div>;
  if (error) return <div className="settings-row-sub" style={{ color: "var(--color-bad)" }}>{error}</div>;
  if (!payments || payments.length === 0) return <div className="settings-row-sub">No payments yet.</div>;

  return (
    <div style={{ maxWidth: 460, border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}>
      {payments.map((p, i) => (
        <div
          key={p.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            borderTop: i === 0 ? "none" : "1px solid var(--color-border)",
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-numeric)", fontSize: 13, color: "var(--color-text)" }}>
              {fmtMoney(p.amountCents, p.currency)}
            </div>
            <div className="settings-row-sub">{fmtShortDate(p.paidAt)}</div>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: p.status === "succeeded" ? "var(--color-good)" : "var(--color-bad)",
              textTransform: "capitalize",
            }}
          >
            {p.status}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Confirmation modal for self-service account deletion. Requires the account
 * password to be re-entered (checked server-side) before the destructive
 * call fires.
 */
function DeleteAccountModal({ onClose, onDeleted }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await deleteMyAccount(password);
      onDeleted();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 22, 40, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 1000,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleDelete}
        className="card card-pad"
        style={{ width: "100%", maxWidth: 420 }}
      >
        <div className="settings-row-label" style={{ marginBottom: 6 }}>Delete your account?</div>
        <div className="settings-row-sub" style={{ marginBottom: 14 }}>
          This permanently deletes your account and everything in it. Enter your password to confirm.
        </div>

        <input
          type="password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          style={{ ...inputStyle, maxWidth: "100%", marginBottom: error ? 6 : 14 }}
        />

        {error && (
          <div className="settings-row-sub" style={{ color: "var(--color-bad)", marginBottom: 14 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={busy || !password}>
            {busy ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </form>
    </div>
  );
}
