import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import {
  getSubscriptionStatus,
  cancelSubscription,
  resumeSubscription,
  createBillingPortalSession,
  listMyPayments,
  updateMyProfile,
  requestEmailChange,
  verifyEmailChange,
  changeMyPassword,
  deleteMyAccount,
} from "../api/subscription";
import { getAiPreferences, updateAiPreferences } from "../api/aiPreferences";

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
  { id: "ai-preferences", label: "AI preferences", icon: "bi-robot" },
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

// Largest square the avatar is downscaled to before upload, and the JPEG
// quality. 256px keeps the stored data URL small (typically ~15-40KB) while
// still looking crisp at the sizes we render it (32-96px).
const AVATAR_MAX_PX = 256;
const AVATAR_QUALITY = 0.85;
const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

/**
 * Reads a chosen image file, downscales it to a centered AVATAR_MAX_PX
 * square via a canvas, and returns a compressed JPEG data URL. Doing the
 * resize in the browser means we never upload the multi-MB original - just a
 * small string that fits comfortably in the JSON body (see app.js) and the
 * API's size cap (see auth.controller.js avatarDataUrl).
 * @param {File} file
 * @returns {Promise<string>} a data:image/jpeg;base64,... URL
 */
function fileToAvatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      const out = Math.min(side, AVATAR_MAX_PX);
      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not process image"));
      // JPEG has no alpha channel - paint white first so transparent areas
      // (e.g. a PNG logo) come out white rather than black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out, out);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
      resolve(canvas.toDataURL("image/jpeg", AVATAR_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file doesn't look like a valid image."));
    };
    img.src = url;
  });
}

/**
 * Circular avatar: shows the uploaded photo when `src` is set, otherwise the
 * user's initials on the accent background. Shared by the account panel's
 * view and edit states so both stay visually identical.
 */
function Avatar({ src, name, size, fontSize }) {
  const base = {
    flex: "0 0 auto",
    width: size,
    height: size,
    borderRadius: "50%",
    background: "var(--color-clickable)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-title)",
    fontWeight: 600,
    fontSize,
    overflow: "hidden",
  };
  if (src) {
    return (
      <div style={base}>
        <img src={src} alt={name || "Profile"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }
  return <div style={base}>{initialsOf(name)}</div>;
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
  const { user, logout, updateUser } = useAuth();
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
              <AccountControl user={user} updateUser={updateUser} />
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

          {active === "ai-preferences" && (
            <div>
              <PanelHeader
                title="AI preferences"
                help="Choose the model, analyst persona, and level of detail used when the AI reviews your shortlisted stocks."
              />
              <AiPreferencesControl />
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
 * Account panel - shows the avatar/name/email/badges, and (in edit mode) an
 * inline form to change the display name and login email.
 *
 * The name is saved directly (PATCH /auth/me). Changing the email is a
 * verified two-step flow: saving a new address emails a 6-digit code to that
 * address (POST /auth/email-change/request), and the panel switches to a
 * code-entry step that only applies the change once the code checks out
 * (POST /auth/email-change/verify). Both paths merge the refreshed user into
 * the shared auth state via updateUser(), so the nav bar and the rest of the
 * app update without a re-login.
 */
function AccountControl({ user, updateUser }) {
  // "view" | "edit" | "verify-email"
  const [mode, setMode] = useState("view");
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  // Email awaiting code confirmation (set once request() succeeds).
  const [pendingEmail, setPendingEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendMsg, setResendMsg] = useState("");

  // Working copy of the avatar while editing: undefined = unchanged, a data
  // URL = new photo, null = remove the existing photo.
  const [avatarDraft, setAvatarDraft] = useState(undefined);
  const fileInputRef = useRef(null);

  const avatarChanged = avatarDraft !== undefined;
  // What to show in the edit-mode preview: the draft if touched, else current.
  const previewAvatar = avatarChanged ? avatarDraft : user?.avatar ?? null;

  function startEditing() {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setAvatarDraft(undefined);
    setError("");
    setDone("");
    setMode("edit");
  }

  async function handlePickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    setError("");
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setAvatarDraft(dataUrl);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleRemovePhoto() {
    setError("");
    // Only mark for removal if there's actually a photo to remove; otherwise
    // just discard any freshly-picked draft.
    setAvatarDraft(user?.avatar ? null : undefined);
  }

  function cancelEditing() {
    setMode("view");
    setError("");
    setPendingEmail("");
    setCode("");
    setResendMsg("");
    setAvatarDraft(undefined);
  }

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const nameChanged = trimmedName !== (user?.name ?? "");
  const emailChanged = trimmedEmail.toLowerCase() !== (user?.email ?? "").toLowerCase();
  const changed = nameChanged || emailChanged || avatarChanged;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setDone("");
    if (!trimmedName) {
      setError("Name can't be empty.");
      return;
    }

    setBusy(true);
    try {
      // Name and photo are safe to apply immediately - no verification needed.
      if (nameChanged || avatarChanged) {
        const patch = {};
        if (nameChanged) patch.name = trimmedName;
        if (avatarChanged) patch.avatar = avatarDraft; // data URL, or null to remove
        const updated = await updateMyProfile(patch);
        updateUser(updated);
        setAvatarDraft(undefined);
      }

      if (emailChanged) {
        // Kicks off email verification; the change itself lands in step 2.
        const { email: sentTo } = await requestEmailChange(trimmedEmail);
        setPendingEmail(sentTo);
        setCode("");
        setResendMsg("");
        setMode("verify-email");
      } else {
        setMode("view");
        setDone("Profile updated.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const updated = await verifyEmailChange(pendingEmail, code.trim());
      updateUser(updated);
      setMode("view");
      setPendingEmail("");
      setCode("");
      setDone("Email updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setError("");
    setResendMsg("");
    setBusy(true);
    try {
      await requestEmailChange(pendingEmail);
      setResendMsg("A new code is on its way.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 20, alignItems: mode === "edit" ? "flex-start" : "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {mode === "edit" ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Upload a new photo"
              style={{ position: "relative", border: "none", background: "none", padding: 0, cursor: "pointer", lineHeight: 0 }}
            >
              <Avatar src={previewAvatar} name={user?.name} size={96} fontSize={34} />
              <span
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: 0,
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "var(--color-clickable)",
                  border: "2px solid var(--color-surface)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                }}
              >
                <i className="bi bi-camera-fill" />
              </span>
            </button>
          ) : (
            <Avatar src={user?.avatar} name={user?.name} size={96} fontSize={34} />
          )}

          {mode === "edit" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "var(--color-clickable)", fontFamily: "var(--font-body)", fontSize: 12 }}
              >
                {previewAvatar ? "Change photo" : "Upload photo"}
              </button>
              {previewAvatar && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "var(--color-bad)", fontFamily: "var(--font-body)", fontSize: 12 }}
                >
                  Remove
                </button>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={AVATAR_ACCEPT}
            onChange={handlePickFile}
            style={{ display: "none" }}
          />
        </div>

        {mode === "edit" && (
          <form onSubmit={handleSubmit} style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label className="settings-row-sub" style={{ display: "block", marginBottom: 4 }}>Name</label>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="settings-row-sub" style={{ display: "block", marginBottom: 4 }}>Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                />
                {emailChanged && (
                  <div className="settings-row-sub" style={{ marginTop: 4 }}>
                    We'll email a code to this address to verify it before switching.
                  </div>
                )}
              </div>
            </div>

            {error && <div className="settings-row-sub" style={{ color: "var(--color-bad)", marginTop: 10 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="submit" className="btn btn-primary" disabled={busy || !changed}>
                {busy ? "Saving…" : emailChanged ? "Save & verify email" : "Save changes"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={cancelEditing} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {mode === "verify-email" && (
          <form onSubmit={handleVerify} style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div className="settings-row-sub" style={{ marginBottom: 10 }}>
              Enter the 6-digit code we sent to <strong style={{ color: "var(--color-text)" }}>{pendingEmail}</strong> to
              confirm it as your new email.
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              autoFocus
              style={{ ...inputStyle, letterSpacing: "0.3em", fontFamily: "var(--font-numeric)" }}
            />

            {error && <div className="settings-row-sub" style={{ color: "var(--color-bad)", marginTop: 10 }}>{error}</div>}
            {resendMsg && (
              <div className="settings-row-sub" style={{ color: "var(--color-good)", marginTop: 10 }}>{resendMsg}</div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
                {busy ? "Verifying…" : "Verify email"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleResend} disabled={busy}>
                Resend code
              </button>
              <button type="button" className="btn btn-secondary" onClick={cancelEditing} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {mode === "view" && (
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
        )}
      </div>

      {mode === "view" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" onClick={startEditing}>
            <i className="bi bi-pencil" />
            Edit profile
          </button>
          {done && <span className="settings-row-sub" style={{ color: "var(--color-good)" }}>{done}</span>}
        </div>
      )}

      {mode === "view" && user?.createdAt && (
        <div className="settings-row-sub" style={{ marginTop: 14 }}>Member since {fmtDate(user.createdAt)}</div>
      )}
    </div>
  );
}

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

// Model tiers selectable in the AI preferences panel. All four route through
// OpenRouter under one API key (server/src/services/ai.service.js -
// OPENROUTER_API_KEY), so every option here is fully wired up. Keep in sync
// with MODEL_TIERS in ai.service.js and AI_MODEL_TIERS in
// aiPreferences.service.js.
const AI_MODEL_OPTIONS = [
  { id: "flash", label: "Gemini 2.5 Flash", description: "Google's Gemini model - fast and well-rounded. The default." },
  { id: "gpt-4o-mini", label: "GPT-4o mini", description: "OpenAI's lightweight GPT-4o model - quick, cost-efficient responses." },
  { id: "claude-haiku", label: "Claude Haiku 4.5", description: "Anthropic's fast Claude model - crisp, concise write-ups." },
  { id: "deepseek-chat", label: "DeepSeek Chat", description: "DeepSeek's general-purpose chat model - strong reasoning at low cost." },
];

const AI_PERSONA_OPTIONS = [
  { id: "balanced", label: "Balanced", description: "Weighs growth potential and risk evenly - a neutral, well-rounded take on each stock." },
  { id: "conservative", label: "Conservative", description: "Prioritizes stability and capital preservation, quick to flag downside risk over growth potential." },
  { id: "growth", label: "Growth", description: "Focuses on momentum and future upside, even where that means more volatility." },
  { id: "income", label: "Income & dividends", description: "Emphasizes dividend yield and payout stability over capital growth." },
];

const AI_DETAIL_OPTIONS = [
  { id: "concise", label: "Concise", description: "Short, to-the-point write-ups (3-4 sentences per stock)." },
  { id: "detailed", label: "Detailed", description: "Longer write-ups with extra nuance and reasoning (5-7 sentences per stock)." },
];

const CUSTOM_INSTRUCTIONS_MAX = 1000;

/**
 * One selectable option in the AI preferences panel: a radio input plus a
 * label and short description, the description doubling as a native
 * tooltip (title attr) and always-visible helper text so users can compare
 * options before picking one.
 */
function OptionCard({ name, id, label, description, checked, onSelect }) {
  return (
    <label
      title={description}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 12px",
        border: `1px solid ${checked ? "var(--color-clickable)" : "var(--color-border)"}`,
        borderRadius: 8,
        cursor: "pointer",
        background: checked ? "var(--color-surface)" : "transparent",
      }}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={() => onSelect(id)}
        style={{ marginTop: 3, flex: "0 0 auto" }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-title)", fontWeight: 600, fontSize: 13, color: "var(--color-text)" }}>
          {label}
        </div>
        <div className="settings-row-sub" style={{ marginTop: 2 }}>{description}</div>
      </div>
    </label>
  );
}

/**
 * "AI preferences" control - lets a user choose the model tier, analyst
 * persona, and output detail level used by the AI stock analysis feature
 * (ai.service.js), plus free-text custom instructions. Backed by
 * GET/PATCH /api/ai/preferences (ai_preferences table, one row per user).
 *
 * `loaded` holds the last-saved values, `draft` the in-progress edits - the
 * Save button is only enabled once they diverge, same "changed" idiom as
 * AccountControl above.
 */
function AiPreferencesControl() {
  const [loaded, setLoaded] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAiPreferences()
      .then((prefs) => {
        setLoaded(prefs);
        setDraft(prefs);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function update(patch) {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  }

  const changed =
    !!loaded &&
    !!draft &&
    (loaded.aiModelTier !== draft.aiModelTier ||
      loaded.aiPersona !== draft.aiPersona ||
      loaded.aiDetailLevel !== draft.aiDetailLevel ||
      (loaded.customInstructions ?? "") !== (draft.customInstructions ?? ""));

  async function handleSave() {
    setBusy(true);
    setError("");
    try {
      const next = await updateAiPreferences({
        aiModelTier: draft.aiModelTier,
        aiPersona: draft.aiPersona,
        aiDetailLevel: draft.aiDetailLevel,
        customInstructions: draft.customInstructions ?? "",
      });
      setLoaded(next);
      setDraft(next);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="settings-row-sub">Loading…</div>;
  if (!draft) return <div className="settings-row-sub" style={{ color: "var(--color-bad)" }}>{error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div className="settings-row-label" style={{ marginBottom: 8 }}>AI model</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 460 }}>
          {AI_MODEL_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.id}
              name="ai-model"
              {...opt}
              checked={draft.aiModelTier === opt.id}
              onSelect={(id) => update({ aiModelTier: id })}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="settings-row-label" style={{ marginBottom: 8 }}>Analyst persona</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 460 }}>
          {AI_PERSONA_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.id}
              name="ai-persona"
              {...opt}
              checked={draft.aiPersona === opt.id}
              onSelect={(id) => update({ aiPersona: id })}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="settings-row-label" style={{ marginBottom: 8 }}>Output detail</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 460 }}>
          {AI_DETAIL_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.id}
              name="ai-detail"
              {...opt}
              checked={draft.aiDetailLevel === opt.id}
              onSelect={(id) => update({ aiDetailLevel: id })}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="settings-row-label" style={{ display: "block", marginBottom: 4 }}>
          Custom instructions
        </label>
        <div className="settings-row-sub" style={{ marginBottom: 6 }}>
          Optional - tell the AI anything else to keep in mind, e.g. "Focus on ASX-listed stocks" or "explain like I'm
          new to investing".
        </div>
        <textarea
          value={draft.customInstructions ?? ""}
          onChange={(e) => update({ customInstructions: e.target.value.slice(0, CUSTOM_INSTRUCTIONS_MAX) })}
          placeholder="e.g. Favor long-term dividend stability over short-term momentum."
          rows={4}
          style={{ ...inputStyle, maxWidth: 460, resize: "vertical" }}
        />
        <div className="settings-row-sub" style={{ marginTop: 4, maxWidth: 460, textAlign: "right" }}>
          {(draft.customInstructions ?? "").length}/{CUSTOM_INSTRUCTIONS_MAX}
        </div>
      </div>

      {error && <div className="settings-row-sub" style={{ color: "var(--color-bad)" }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className="btn btn-primary" disabled={busy || !changed} onClick={handleSave}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        {saved && !changed && <span className="settings-row-sub" style={{ color: "var(--color-good)" }}>Saved.</span>}
      </div>
    </div>
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
