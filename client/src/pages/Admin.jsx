/**
 * Owner: Person 2 (Charles) - Admin Dashboard.
 * View every user, revoke/restore their (paywall) access, and
 * promote/demote other admins. Gated to admins only - see App.jsx's
 * RequireAdmin guard and server/src/middleware/admin.middleware.js for
 * the real (server-side) enforcement.
 *
 * Delete is a permanent hard-delete (irreversible, unlike revoke) - it keeps
 * the user's anonymized payment rows so revenue stats stay intact. See
 * server/src/services/admin.service.js.
 *
 * Quick-win additions: summary stat cards, a search box, and per-user
 * payment history (expand a row to fetch it on demand).
 *
 * Clear cache button: the stock data endpoints (server/src/services/
 * stockLookup.service.js) cache reads in memory for a few minutes (see
 * utils/cache.js) - this button lets an admin force a refresh right after
 * re-running the ingestion pipeline instead of waiting out the TTL.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listUsers,
  createUser,
  revokeUser,
  restoreUser,
  deleteUser,
  setAdmin,
  getStats,
  getUserPayments,
  clearCache,
  runReseed,
  getReseedStatus,
  getReseedSchedule,
  setReseedSchedule,
  exportUsersCsv,
  exportPaymentsCsv,
  exportSummaryPdf,
} from "../api/admin";
import { colors, fonts, fontWeights } from "../theme";

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Default SGD, not USD - the activation fee is charged in SGD (see
// server/src/services/subscription.service.js's ACTIVATION_CURRENCY,
// required for GrabPay/PayNow support). Per-payment rows below pass the
// payment's own stored currency instead of relying on this default.
function fmtMoney(cents, currency = "SGD") {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency });
}

const th = { textAlign: "left", padding: "10px 12px", fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 12, color: colors.mutedText, borderBottom: `1px solid ${colors.border}` };
const td = { padding: "10px 12px", fontFamily: fonts.description, fontSize: 13, color: colors.darkMenu, borderBottom: `1px solid ${colors.border}` };

const statCard = {
  flex: 1,
  minWidth: 150,
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: "14px 16px",
};
const statLabel = { fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 12, color: colors.mutedText, marginBottom: 4 };
const statValue = { fontFamily: fonts.numeric, fontWeight: fontWeights.numeric, fontSize: 22, color: colors.darkMenu };

// Status filters for the user table. `test` runs against a single user row.
// "Active"/"Inactive" reflect the paywall flag (is_active); "Paid"/"Not paid"
// reflect whether any payment exists - deliberately separate, since an admin
// can grant access (Restore) without the user ever paying, so "active" and
// "paid" aren't the same thing. Single-select, combined with the search box.
const USER_FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "active", label: "Active", test: (u) => u.isActive },
  { id: "inactive", label: "Inactive", test: (u) => !u.isActive },
  { id: "paid", label: "Paid", test: (u) => Number(u.paymentCount) > 0 },
  { id: "unpaid", label: "Not paid", test: (u) => Number(u.paymentCount) === 0 },
  { id: "admin", label: "Admins", test: (u) => u.isAdmin },
];

/**
 * A clickable table header that sorts the user table by `sortKey`. Shows a
 * ▲/▼ arrow on the active column and a faint neutral ↕ on the rest so it's
 * clear every one of these is sortable.
 */
function SortableTh({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  return (
    <th
      style={{ ...th, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      <span style={{ marginLeft: 5, fontSize: 10, opacity: active ? 1 : 0.3 }}>
        {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}

function initialsOf(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

/**
 * Small circular avatar for the user table - the uploaded profile picture
 * when set, otherwise initials on the accent background. Mirrors the larger
 * avatar in Settings so the same user reads the same everywhere.
 */
function TableAvatar({ src, name }) {
  const base = {
    flexShrink: 0,
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: colors.clickable,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: fonts.titleLabel,
    fontWeight: fontWeights.titleLabel,
    fontSize: 11,
    overflow: "hidden",
  };
  return (
    <span style={base}>
      {src ? (
        <img src={src} alt={name || "Profile"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

function Badge({ good, children }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontFamily: fonts.titleLabel,
        fontWeight: fontWeights.titleLabel,
        fontSize: 11,
        color: "#fff",
        background: good ? colors.goodNumber : colors.badNumber,
      }}
    >
      {children}
    </span>
  );
}

function PaymentsPanel({ payments, loading, error }) {
  if (loading) return <p style={{ fontFamily: fonts.description, fontSize: 12, color: colors.mutedText, margin: 0 }}>Loading payments...</p>;
  if (error) return <p style={{ fontFamily: fonts.description, fontSize: 12, color: colors.badNumber, margin: 0 }}>{error}</p>;
  if (!payments || payments.length === 0) {
    return <p style={{ fontFamily: fonts.description, fontSize: 12, color: colors.mutedText, margin: 0 }}>No payments yet.</p>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...th, borderBottom: `1px solid ${colors.border}`, fontSize: 11 }}>Amount</th>
          <th style={{ ...th, fontSize: 11 }}>Status</th>
          <th style={{ ...th, fontSize: 11 }}>Method</th>
          <th style={{ ...th, fontSize: 11 }}>Paid at</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => (
          <tr key={p.id}>
            <td style={{ ...td, fontFamily: fonts.numeric }}>{fmtMoney(p.amountCents, p.currency)}</td>
            <td style={td}>
              <Badge good={p.status === "succeeded"}>{p.status}</Badge>
            </td>
            <td style={td}>{p.paymentMethod}</td>
            <td style={{ ...td, fontFamily: fonts.numeric }}>{fmtDateTime(p.paidAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Modal form for admin-provisioned account creation (the "Create" of the
 * admin CRUD). Name/email/password mirror the public signup fields; the two
 * checkboxes expose what only an admin can set - granting access immediately
 * (skipping the paywall) and making the new account an admin. On success it
 * hands the created user row back to onCreated() so the table updates without
 * a refetch.
 */
function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", isActive: false, isAdmin: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const created = await createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        isActive: form.isActive,
        isAdmin: form.isAdmin,
      });
      onCreated(created);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const field = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    fontFamily: fonts.description,
    fontSize: 13,
    boxSizing: "border-box",
  };
  const label = { fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 12, color: colors.mutedText, display: "block", marginBottom: 4 };

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
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 440,
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h2 style={{ fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 18, margin: "0 0 4px", color: colors.darkMenu }}>
          Create user
        </h2>
        <p style={{ fontFamily: fonts.description, fontSize: 13, color: colors.mutedText, margin: "0 0 18px" }}>
          Provision a new account directly. Leave both toggles off for a normal inactive account, same as a public sign-up.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={label}>Name</label>
            <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Jane Tan" required style={field} />
          </div>
          <div>
            <label style={label}>Email</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jane@example.com" required style={field} />
          </div>
          <div>
            <label style={label}>Password</label>
            <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" style={field} />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: fonts.description, fontSize: 13, color: colors.darkMenu, cursor: "pointer" }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
            Grant access immediately (skip the paywall)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: fonts.description, fontSize: 13, color: colors.darkMenu, cursor: "pointer" }}>
            <input type="checkbox" checked={form.isAdmin} onChange={(e) => set("isAdmin", e.target.checked)} />
            Make this account an admin
          </label>
        </div>

        {error && (
          <div style={{ fontFamily: fonts.description, fontSize: 12, color: colors.badNumber, marginTop: 12 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              fontFamily: fonts.description,
              fontSize: 12,
              color: colors.darkMenu,
              background: colors.surface,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !form.name.trim() || !form.email.trim() || !form.password}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              fontFamily: fonts.description,
              fontSize: 12,
              color: "#fff",
              background: colors.clickable,
              cursor: busy || !form.name.trim() || !form.email.trim() || !form.password ? "not-allowed" : "pointer",
              opacity: busy || !form.name.trim() || !form.email.trim() || !form.password ? 0.6 : 1,
            }}
          >
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Admin() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Column sort. Defaults to newest-first (createdAt desc), matching the
  // order the API already returns rows in.
  const [sort, setSort] = useState({ key: "createdAt", dir: "desc" });
  const [expandedId, setExpandedId] = useState(null);
  const [paymentsByUser, setPaymentsByUser] = useState({});
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheMsg, setCacheMsg] = useState("");
  const [exportBusy, setExportBusy] = useState(null); // "users" | "payments" | "pdf" | null
  const [exportMsg, setExportMsg] = useState("");
  const [reseedStatus, setReseedStatus] = useState(null); // latest /admin/reseed/status payload
  const [reseedMsg, setReseedMsg] = useState("");
  const reseedPollRef = useRef(null);
  const [schedule, setSchedule] = useState(null); // latest /admin/reseed/schedule payload
  const [scheduleForm, setScheduleForm] = useState({ amount: 1, unit: "days" });
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState("");
  const scheduleFormInitialized = useRef(false);

  function load() {
    setLoading(true);
    Promise.all([listUsers(), getStats()])
      .then(([userRows, statRow]) => {
        setUsers(userRows);
        setStats(statRow);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  // Narrow by the search box first; the status-filter pill counts are then
  // computed against that searched set, so a count reflects what you'd
  // actually see after clicking it.
  const searchedUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  const filterCounts = useMemo(() => {
    const counts = {};
    for (const f of USER_FILTERS) counts[f.id] = searchedUsers.filter(f.test).length;
    return counts;
  }, [searchedUsers]);

  const filteredUsers = useMemo(() => {
    const active = USER_FILTERS.find((f) => f.id === statusFilter) ?? USER_FILTERS[0];
    return searchedUsers.filter(active.test);
  }, [searchedUsers, statusFilter]);

  // Sort a copy (never mutate the memoized filter result). Payments sort
  // numerically, Joined by timestamp, everything else case-insensitively.
  const sortedUsers = useMemo(() => {
    const mult = sort.dir === "asc" ? 1 : -1;
    const valueOf = (u) => {
      if (sort.key === "paymentCount") return Number(u.paymentCount);
      if (sort.key === "createdAt") return new Date(u.createdAt).getTime();
      return (u[sort.key] ?? "").toString().toLowerCase();
    };
    return [...filteredUsers].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (av < bv) return -1 * mult;
      if (av > bv) return 1 * mult;
      return 0;
    });
  }, [filteredUsers, sort]);

  // Toggle direction when re-clicking the active column; otherwise switch to
  // the new column with a sensible default (newest/biggest first for
  // date/number columns, A-Z for text).
  function toggleSort(key) {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      const numericOrDate = key === "paymentCount" || key === "createdAt";
      return { key, dir: numericOrDate ? "desc" : "asc" };
    });
  }

  // Prepend the freshly-created account to the table and reflect it in the
  // stat cards, so it shows up immediately without a full refetch.
  function handleCreated(created) {
    setUsers((prev) => [created, ...prev]);
    setStats((prev) =>
      prev
        ? {
            ...prev,
            totalUsers: prev.totalUsers + 1,
            activeUsers: prev.activeUsers + (created.isActive ? 1 : 0),
            inactiveUsers: prev.inactiveUsers + (created.isActive ? 0 : 1),
          }
        : prev
    );
    setShowCreate(false);
  }

  async function handleToggleActive(row) {
    setBusyId(row.id);
    setError("");
    try {
      const { stripeCancelError, ...updated } = row.isActive ? await revokeUser(row.id) : await restoreUser(row.id);
      setUsers((prev) => prev.map((u) => (u.id === row.id ? { ...u, ...updated } : u)));
      setStats((prev) =>
        prev
          ? {
              ...prev,
              activeUsers: prev.activeUsers + (updated.isActive ? 1 : -1),
              inactiveUsers: prev.inactiveUsers + (updated.isActive ? -1 : 1),
            }
          : prev
      );
      // Access is already revoked locally either way (see admin.service.js) -
      // this just warns the admin that Stripe itself still needs attention
      // (e.g. STRIPE_SECRET_KEY misconfigured), so billing doesn't silently
      // keep charging a now-locked-out user.
      if (stripeCancelError) {
        setError(`Access revoked, but canceling the Stripe subscription failed: ${stripeCancelError}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(row) {
    if (
      !window.confirm(
        `Permanently delete ${row.name} (${row.email})? This can't be undone. Their saved screens and watchlists are removed; payment history is kept (anonymized).`
      )
    ) {
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      const { stripeCancelError } = await deleteUser(row.id);
      setUsers((prev) => prev.filter((u) => u.id !== row.id));
      setStats((prev) =>
        prev
          ? {
              ...prev,
              totalUsers: prev.totalUsers - 1,
              activeUsers: prev.activeUsers - (row.isActive ? 1 : 0),
              inactiveUsers: prev.inactiveUsers - (row.isActive ? 0 : 1),
            }
          : prev
      );
      if (expandedId === row.id) setExpandedId(null);
      // Account is deleted regardless (see admin.service.js) - this just warns
      // the admin that Stripe still needs attention so an orphaned live
      // subscription doesn't keep charging a now-deleted user's card.
      if (stripeCancelError) {
        setError(`Account deleted, but canceling the Stripe subscription failed: ${stripeCancelError}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleAdmin(row) {
    const question = row.isAdmin
      ? `Remove admin access from ${row.name} (${row.email})? They'll lose access to this admin dashboard.`
      : `Make ${row.name} (${row.email}) an admin? They'll get full access to this admin dashboard - including managing users and admins.`;
    if (!window.confirm(question)) {
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      const updated = await setAdmin(row.id, !row.isAdmin);
      setUsers((prev) => prev.map((u) => (u.id === row.id ? { ...u, ...updated } : u)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function toggleExpand(row) {
    const willExpand = expandedId !== row.id;
    setExpandedId(willExpand ? row.id : null);
    if (willExpand && !paymentsByUser[row.id]) {
      setPaymentsByUser((prev) => ({ ...prev, [row.id]: { loading: true } }));
      getUserPayments(row.id)
        .then((payments) => setPaymentsByUser((prev) => ({ ...prev, [row.id]: { payments } })))
        .catch((err) => setPaymentsByUser((prev) => ({ ...prev, [row.id]: { error: err.message } })));
    }
  }

  async function handleClearCache() {
    setCacheBusy(true);
    setCacheMsg("");
    try {
      const result = await clearCache();
      setCacheMsg(`Cache cleared (${result.entriesCleared} entr${result.entriesCleared === 1 ? "y" : "ies"}).`);
    } catch (err) {
      setCacheMsg(`Failed: ${err.message}`);
    } finally {
      setCacheBusy(false);
    }
  }

  function stopReseedPolling() {
    if (reseedPollRef.current) {
      clearInterval(reseedPollRef.current);
      reseedPollRef.current = null;
    }
  }

  function pollReseedStatus() {
    getReseedStatus()
      .then((status) => {
        setReseedStatus(status);
        if (!status.running) {
          stopReseedPolling();
          // The server pushes next_run_at out by a full interval after
          // every completed run (manual or scheduled) - refresh so the
          // displayed "next run" time stays accurate.
          getReseedSchedule().then(setSchedule).catch(() => {});
          if (status.error) {
            setReseedMsg(`Reseed failed: ${status.error}`);
          } else if (status.exitCode === 0) {
            setReseedMsg("Reseed complete - fresh data loaded. Use \"Clear data cache\" above to see it immediately.");
          } else if (status.exitCode != null) {
            setReseedMsg(`Reseed exited with code ${status.exitCode} - check server logs for details.`);
          }
        }
      })
      .catch((err) => {
        setReseedMsg(err.message);
        stopReseedPolling();
      });
  }

  function startReseedPolling() {
    stopReseedPolling();
    pollReseedStatus();
    reseedPollRef.current = setInterval(pollReseedStatus, 2000);
  }

  // Picks up a run already in flight (e.g. kicked off from another tab, or
  // this page was reloaded mid-run) instead of only tracking runs started
  // from this exact page load.
  useEffect(() => {
    getReseedStatus()
      .then((status) => {
        setReseedStatus(status);
        if (status.running) startReseedPolling();
      })
      .catch(() => {});
    return stopReseedPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReseed() {
    if (
      !window.confirm(
        "Reseed live data now? This re-runs the full ingestion pipeline against Yahoo Finance and can take a few minutes, overwriting current stock data."
      )
    ) {
      return;
    }
    setReseedMsg("");
    try {
      await runReseed();
      startReseedPolling();
    } catch (err) {
      setReseedMsg(err.message);
      // A 409 here means a run (possibly an auto-reseed) is already in
      // flight - poll anyway so its live progress shows up instead of
      // just an error toast.
      startReseedPolling();
    }
  }

  useEffect(() => {
    getReseedSchedule()
      .then(setSchedule)
      .catch(() => {});
  }, []);

  // Prefills the amount/unit inputs from the persisted schedule the first
  // time it loads, so the form reflects what's actually saved instead of
  // always defaulting to "1 day" - but only once, so it doesn't stomp on
  // an admin's in-progress edits every time the schedule refetches.
  useEffect(() => {
    if (!schedule || scheduleFormInitialized.current) return;
    scheduleFormInitialized.current = true;
    if (schedule.intervalHours) {
      if (schedule.intervalHours % 24 === 0) {
        setScheduleForm({ amount: schedule.intervalHours / 24, unit: "days" });
      } else {
        setScheduleForm({ amount: schedule.intervalHours, unit: "hours" });
      }
    }
  }, [schedule]);

  async function handleSaveSchedule() {
    setScheduleBusy(true);
    setScheduleMsg("");
    try {
      const hours = scheduleForm.unit === "days" ? scheduleForm.amount * 24 : scheduleForm.amount;
      const result = await setReseedSchedule(hours);
      setSchedule(result);
      setScheduleMsg("Auto-reseed schedule saved.");
    } catch (err) {
      setScheduleMsg(err.message);
    } finally {
      setScheduleBusy(false);
    }
  }

  async function handleDisableSchedule() {
    setScheduleBusy(true);
    setScheduleMsg("");
    try {
      const result = await setReseedSchedule(null);
      setSchedule(result);
      setScheduleMsg("Auto-reseed disabled.");
    } catch (err) {
      setScheduleMsg(err.message);
    } finally {
      setScheduleBusy(false);
    }
  }

  async function handleExport(kind) {
    setExportBusy(kind);
    setExportMsg("");
    try {
      if (kind === "users") await exportUsersCsv();
      else if (kind === "payments") await exportPaymentsCsv();
      else await exportSummaryPdf();
    } catch (err) {
      setExportMsg(`Export failed: ${err.message}`);
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <section style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 20, margin: "0 0 4px", color: colors.darkMenu }}>
            Admin - Users
          </h1>
          <p style={{ fontFamily: fonts.description, fontSize: 13, color: colors.mutedText, margin: "0 0 18px" }}>
            Revoke flips the same flag the paywall checks (reversible). Delete is permanent - it removes the account and
            their data, but keeps payment history (anonymized).
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              title="Provision a new user account directly"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                fontFamily: fonts.description,
                fontSize: 12,
                color: "#fff",
                background: colors.clickable,
                cursor: "pointer",
              }}
            >
              + Create user
            </button>
            <button
              type="button"
              onClick={() => handleExport("users")}
              disabled={exportBusy !== null}
              title="Download every user account (status, role, payment count/total) as a CSV file"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                fontFamily: fonts.description,
                fontSize: 12,
                color: colors.darkMenu,
                background: colors.surface,
                cursor: exportBusy !== null ? "not-allowed" : "pointer",
                opacity: exportBusy !== null ? 0.6 : 1,
              }}
            >
              {exportBusy === "users" ? "Exporting..." : "Export users CSV"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("payments")}
              disabled={exportBusy !== null}
              title="Download every payment across every user as a CSV file"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                fontFamily: fonts.description,
                fontSize: 12,
                color: colors.darkMenu,
                background: colors.surface,
                cursor: exportBusy !== null ? "not-allowed" : "pointer",
                opacity: exportBusy !== null ? 0.6 : 1,
              }}
            >
              {exportBusy === "payments" ? "Exporting..." : "Export payments CSV"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              disabled={exportBusy !== null}
              title="Download a branded one-page summary report (stat cards + full user table) as a PDF"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                fontFamily: fonts.description,
                fontSize: 12,
                color: colors.darkMenu,
                background: colors.surface,
                cursor: exportBusy !== null ? "not-allowed" : "pointer",
                opacity: exportBusy !== null ? 0.6 : 1,
              }}
            >
              {exportBusy === "pdf" ? "Exporting..." : "Export PDF report"}
            </button>
          </div>
          {exportMsg && (
            <div style={{ fontFamily: fonts.description, fontSize: 11, color: colors.mutedText, marginTop: 4 }}>
              {exportMsg}
            </div>
          )}
        </div>
      </div>

      {stats && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={statCard}>
            <div style={statLabel}>Total users</div>
            <div style={statValue}>{stats.totalUsers}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>Active</div>
            <div style={{ ...statValue, color: colors.goodNumber }}>{stats.activeUsers}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>Inactive</div>
            <div style={{ ...statValue, color: colors.badNumber }}>{stats.inactiveUsers}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>Total revenue (test mode)</div>
            <div style={statValue}>{fmtMoney(stats.totalRevenueCents)}</div>
          </div>
        </div>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email..."
        style={{
          width: "100%",
          maxWidth: 320,
          padding: "8px 12px",
          marginBottom: 12,
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          fontFamily: fonts.description,
          fontSize: 13,
        }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {USER_FILTERS.map((f) => {
          const selected = statusFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${selected ? colors.clickable : colors.border}`,
                fontFamily: fonts.description,
                fontSize: 12,
                color: selected ? "#fff" : colors.darkMenu,
                background: selected ? colors.clickable : colors.surface,
                cursor: "pointer",
              }}
            >
              {f.label}
              <span style={{ marginLeft: 6, opacity: 0.75, fontFamily: fonts.numeric }}>{filterCounts[f.id] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {loading && <p style={{ fontFamily: fonts.description, color: colors.mutedText }}>Loading users...</p>}

      {error && (
        <p style={{ fontFamily: fonts.description, color: colors.badNumber, fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}

      {!loading && filteredUsers.length > 0 && (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <SortableTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                <SortableTh label="Email" sortKey="email" sort={sort} onSort={toggleSort} />
                <th style={th}>Status</th>
                <th style={th}>Role</th>
                <SortableTh label="Payments" sortKey="paymentCount" sort={sort} onSort={toggleSort} />
                <SortableTh label="Joined" sortKey="createdAt" sort={sort} onSort={toggleSort} />
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((row) => {
                const isSelf = row.id === currentUser?.id;
                const busy = busyId === row.id;
                const isExpanded = expandedId === row.id;
                const paymentsState = paymentsByUser[row.id];
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td style={td}>
                        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <TableAvatar src={row.avatar} name={row.name} />
                          {row.name}
                        </span>
                      </td>
                      <td style={td} className="numeric">{row.email}</td>
                      <td style={td}>
                        <Badge good={row.isActive}>{row.isActive ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td style={td}>{row.isAdmin ? <Badge good>Admin</Badge> : "User"}</td>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => toggleExpand(row)}
                          style={{
                            border: "none",
                            background: "none",
                            padding: 0,
                            fontFamily: fonts.numeric,
                            fontSize: 13,
                            color: colors.link,
                            cursor: "pointer",
                            textDecoration: "underline",
                          }}
                        >
                          {row.paymentCount} {isExpanded ? "▲" : "▼"}
                        </button>
                      </td>
                      <td style={td} className="numeric">{fmtDate(row.createdAt)}</td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            disabled={busy || (isSelf && row.isActive)}
                            onClick={() => handleToggleActive(row)}
                            title={isSelf && row.isActive ? "You can't revoke your own access" : undefined}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "none",
                              fontFamily: fonts.description,
                              fontSize: 12,
                              color: "#fff",
                              background: row.isActive ? colors.badNumber : colors.goodNumber,
                              cursor: busy || (isSelf && row.isActive) ? "not-allowed" : "pointer",
                              opacity: busy || (isSelf && row.isActive) ? 0.5 : 1,
                            }}
                          >
                            {row.isActive ? "Revoke" : "Restore"}
                          </button>
                          <button
                            type="button"
                            disabled={busy || (isSelf && row.isAdmin)}
                            onClick={() => handleToggleAdmin(row)}
                            title={isSelf && row.isAdmin ? "You can't remove your own admin access" : undefined}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: `1px solid ${colors.border}`,
                              fontFamily: fonts.description,
                              fontSize: 12,
                              color: colors.darkMenu,
                              background: colors.surface,
                              cursor: busy || (isSelf && row.isAdmin) ? "not-allowed" : "pointer",
                              opacity: busy || (isSelf && row.isAdmin) ? 0.5 : 1,
                            }}
                          >
                            {row.isAdmin ? "Remove admin" : "Make admin"}
                          </button>
                          <button
                            type="button"
                            disabled={busy || isSelf}
                            onClick={() => handleDelete(row)}
                            title={isSelf ? "You can't delete your own account here" : "Permanently delete this account"}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: `1px solid ${colors.badNumber}`,
                              fontFamily: fonts.description,
                              fontSize: 12,
                              color: colors.badNumber,
                              background: colors.surface,
                              cursor: busy || isSelf ? "not-allowed" : "pointer",
                              opacity: busy || isSelf ? 0.5 : 1,
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ ...td, background: colors.lightBackground }}>
                          <PaymentsPanel
                            payments={paymentsState?.payments}
                            loading={Boolean(paymentsState?.loading)}
                            error={paymentsState?.error}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filteredUsers.length === 0 && (
        <p style={{ fontFamily: fonts.description, color: colors.mutedText, fontSize: 13 }}>
          {(() => {
            const label = statusFilter === "all" ? "" : USER_FILTERS.find((f) => f.id === statusFilter)?.label.toLowerCase() + " ";
            return search.trim() ? `No ${label}users match "${search}".` : `No ${label}users.`;
          })()}
        </p>
      )}

      {/* Data management: reseeding the stock dataset lives here, away from the
          user-facing actions above, since it's an infrequent, heavy operation. */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${colors.border}` }}>
        <h2 style={{ fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 16, margin: "0 0 4px", color: colors.darkMenu }}>
          Data management
        </h2>
        <p style={{ fontFamily: fonts.description, fontSize: 13, color: colors.mutedText, margin: "0 0 14px" }}>
          Refresh the stock dataset from Yahoo Finance. Reseeding re-runs the full ingestion pipeline and can take a few
          minutes; clear the data cache afterwards to see the new numbers immediately.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <button
            type="button"
            onClick={handleReseed}
            disabled={reseedStatus?.running}
            title="Re-run the ingestion pipeline (ingestion/ingest.py) to pull fresh prices, market cap, dividends and financials from Yahoo Finance"
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              fontFamily: fonts.description,
              fontSize: 12,
              color: "#fff",
              background: colors.clickable,
              cursor: reseedStatus?.running ? "not-allowed" : "pointer",
              opacity: reseedStatus?.running ? 0.6 : 1,
            }}
          >
            {reseedStatus?.running ? "Reseeding..." : "Reseed live data"}
          </button>
          <button
            type="button"
            onClick={handleClearCache}
            disabled={cacheBusy}
            title="Force-refresh stock data (market cap, prices, financials) instead of waiting out the cache TTL"
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              fontFamily: fonts.description,
              fontSize: 12,
              color: colors.darkMenu,
              background: colors.surface,
              cursor: cacheBusy ? "not-allowed" : "pointer",
              opacity: cacheBusy ? 0.6 : 1,
            }}
          >
            {cacheBusy ? "Clearing..." : "Clear data cache"}
          </button>
        </div>

        <div style={{ fontFamily: fonts.description, fontSize: 12, color: colors.mutedText, marginTop: 10 }}>
          Last reseeded:{" "}
          <span style={{ color: colors.darkMenu, fontFamily: fonts.numeric }}>
            {schedule?.lastReseedAt ? fmtDateTime(schedule.lastReseedAt) : "Never"}
          </span>
        </div>

        {(cacheMsg || reseedStatus?.running || reseedMsg) && (
          <div style={{ fontFamily: fonts.description, fontSize: 11, color: colors.mutedText, marginTop: 4 }}>
            {reseedStatus?.running
              ? "Pulling fresh data from Yahoo Finance - this can take a few minutes..."
              : reseedMsg || cacheMsg}
          </div>
        )}

        {(reseedStatus?.running || (reseedStatus?.output?.length ?? 0) > 0) && (
          <pre
            style={{
              background: "var(--color-dark-menu)",
              color: "#d8dee9",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 11,
              lineHeight: 1.5,
              maxHeight: 160,
              overflowY: "auto",
              margin: "12px 0 0",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {reseedStatus.output.join("\n")}
          </pre>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            padding: "12px 16px",
            marginTop: 16,
          }}
        >
          <div style={{ minWidth: 200 }}>
            <div style={{ fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 12, color: colors.mutedText, marginBottom: 2 }}>
              Auto-reseed
            </div>
            <div style={{ fontFamily: fonts.description, fontSize: 13, color: colors.darkMenu }}>
              {schedule?.intervalHours
                ? `Every ${
                    schedule.intervalHours % 24 === 0
                      ? `${schedule.intervalHours / 24} day${schedule.intervalHours === 24 ? "" : "s"}`
                      : `${schedule.intervalHours} hour${schedule.intervalHours === 1 ? "" : "s"}`
                  } - next run ${fmtDateTime(schedule.nextRunAt)}`
                : "Off - data only refreshes when you click \"Reseed live data\""}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: fonts.description, fontSize: 12, color: colors.mutedText }}>Every</span>
            <input
              type="number"
              min="1"
              value={scheduleForm.amount}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, amount: Math.max(1, Number(e.target.value) || 1) }))}
              style={{
                width: 60,
                padding: "6px 8px",
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                fontFamily: fonts.description,
                fontSize: 12,
              }}
            />
            <select
              value={scheduleForm.unit}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, unit: e.target.value }))}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                fontFamily: fonts.description,
                fontSize: 12,
              }}
            >
              <option value="hours">hour(s)</option>
              <option value="days">day(s)</option>
            </select>
            <button
              type="button"
              onClick={handleSaveSchedule}
              disabled={scheduleBusy}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "none",
                fontFamily: fonts.description,
                fontSize: 12,
                color: "#fff",
                background: colors.clickable,
                cursor: scheduleBusy ? "not-allowed" : "pointer",
                opacity: scheduleBusy ? 0.6 : 1,
              }}
            >
              {schedule?.intervalHours ? "Update" : "Enable"}
            </button>
            {schedule?.intervalHours ? (
              <button
                type="button"
                onClick={handleDisableSchedule}
                disabled={scheduleBusy}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: `1px solid ${colors.border}`,
                  fontFamily: fonts.description,
                  fontSize: 12,
                  color: colors.darkMenu,
                  background: colors.surface,
                  cursor: scheduleBusy ? "not-allowed" : "pointer",
                  opacity: scheduleBusy ? 0.6 : 1,
                }}
              >
                Turn off
              </button>
            ) : null}
          </div>

          {scheduleMsg && (
            <div style={{ fontFamily: fonts.description, fontSize: 11, color: colors.mutedText, width: "100%" }}>
              {scheduleMsg}
            </div>
          )}
        </div>
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </section>
  );
}
