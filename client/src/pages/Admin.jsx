/**
 * Owner: Person 2 (Charles) - Admin Dashboard.
 * View every user, revoke/restore their (paywall) access, and
 * promote/demote other admins. Gated to admins only - see App.jsx's
 * RequireAdmin guard and server/src/middleware/admin.middleware.js for
 * the real (server-side) enforcement.
 *
 * No hard-delete here on purpose - see server/src/services/admin.service.js.
 *
 * Quick-win additions: summary stat cards, a search box, and per-user
 * payment history (expand a row to fetch it on demand).
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { listUsers, revokeUser, restoreUser, setAdmin, getStats, getUserPayments } from "../api/admin";
import { colors, fonts, fontWeights } from "../theme";

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtMoney(cents, currency = "USD") {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency });
}

const th = { textAlign: "left", padding: "10px 12px", fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 12, color: colors.mutedText, borderBottom: `1px solid ${colors.border}` };
const td = { padding: "10px 12px", fontFamily: fonts.description, fontSize: 13, color: colors.darkMenu, borderBottom: `1px solid ${colors.border}` };

const statCard = {
  flex: 1,
  minWidth: 150,
  background: "#fff",
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: "14px 16px",
};
const statLabel = { fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 12, color: colors.mutedText, marginBottom: 4 };
const statValue = { fontFamily: fonts.numeric, fontWeight: fontWeights.numeric, fontSize: 22, color: colors.darkMenu };

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

export default function Admin() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [paymentsByUser, setPaymentsByUser] = useState({});

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

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  async function handleToggleActive(row) {
    setBusyId(row.id);
    setError("");
    try {
      const updated = row.isActive ? await revokeUser(row.id) : await restoreUser(row.id);
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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleAdmin(row) {
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

  return (
    <section style={{ padding: 28 }}>
      <h1 style={{ fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 20, margin: "0 0 4px", color: colors.darkMenu }}>
        Admin - Users
      </h1>
      <p style={{ fontFamily: fonts.description, fontSize: 13, color: colors.mutedText, margin: "0 0 18px" }}>
        Revoking access flips the same flag the paywall checks - it doesn't delete anything.
      </p>

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
          marginBottom: 16,
          borderRadius: 8,
          border: `1px solid ${colors.border}`,
          fontFamily: fonts.description,
          fontSize: 13,
        }}
      />

      {loading && <p style={{ fontFamily: fonts.description, color: colors.mutedText }}>Loading users...</p>}

      {error && (
        <p style={{ fontFamily: fonts.description, color: colors.badNumber, fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}

      {!loading && filteredUsers.length > 0 && (
        <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Status</th>
                <th style={th}>Role</th>
                <th style={th}>Payments</th>
                <th style={th}>Joined</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((row) => {
                const isSelf = row.id === currentUser?.id;
                const busy = busyId === row.id;
                const isExpanded = expandedId === row.id;
                const paymentsState = paymentsByUser[row.id];
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td style={td}>{row.name}</td>
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
                            color: colors.clickable,
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
                              background: "#fff",
                              cursor: busy || (isSelf && row.isAdmin) ? "not-allowed" : "pointer",
                              opacity: busy || (isSelf && row.isAdmin) ? 0.5 : 1,
                            }}
                          >
                            {row.isAdmin ? "Remove admin" : "Make admin"}
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
          No users match "{search}".
        </p>
      )}
    </section>
  );
}
