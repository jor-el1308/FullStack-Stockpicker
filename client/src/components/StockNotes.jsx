/**
 * Owner: Person 4 (Enrico) — Dashboard & Stock Report.
 * Private notes panel on the stock report page. Full CRUD:
 *   create → add a note, read → list this stock's notes,
 *   update → edit a note inline, delete → remove a note.
 * Backed by /api/dashboard/notes/* (user-scoped on the server).
 */
import { useEffect, useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { colors, fonts, fontWeights } from "../theme";
import { listNotes, createNote, updateNote, deleteNote } from "../api/personal";

const box = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: 16,
  marginTop: 16,
};
const label = { fontFamily: fonts.titleLabel, fontWeight: fontWeights.titleLabel, fontSize: 12, color: colors.mutedText, marginBottom: 10 };
const textarea = {
  width: "100%",
  minHeight: 64,
  resize: "vertical",
  fontFamily: fonts.description,
  fontSize: 13,
  padding: "8px 10px",
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: colors.lightBackground,
  color: colors.darkMenu,
  boxSizing: "border-box",
};
const primaryBtn = {
  fontFamily: fonts.titleLabel,
  fontWeight: fontWeights.titleLabel,
  fontSize: 13,
  color: "#fff",
  background: colors.clickable,
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
};
const iconBtn = { background: "none", border: "none", cursor: "pointer", color: colors.mutedText, display: "flex", padding: 4 };

export default function StockNotes({ exchangeCode, stockCode }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listNotes(exchangeCode, stockCode)
      .then((data) => {
        if (!cancelled) setNotes(data ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [exchangeCode, stockCode]);

  async function handleAdd() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createNote(exchangeCode, stockCode, body);
      setNotes((list) => [created, ...list]);
      setDraft("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditingBody(note.body);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditingBody("");
  }
  async function saveEdit(id) {
    const body = editingBody.trim();
    if (!body) return;
    try {
      await updateNote(id, body);
      setNotes((list) => list.map((n) => (n.id === id ? { ...n, body } : n)));
      cancelEdit();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    const prev = notes;
    setNotes((list) => list.filter((n) => n.id !== id));
    try {
      await deleteNote(id);
    } catch (err) {
      setNotes(prev); // roll back
      setError(err.message);
    }
  }

  return (
    <div style={box}>
      <div style={label}>MY NOTES</div>

      {/* Create */}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a private note about this stock…"
        style={textarea}
        maxLength={2000}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button onClick={handleAdd} disabled={!draft.trim() || saving} style={{ ...primaryBtn, opacity: !draft.trim() || saving ? 0.5 : 1 }}>
          {saving ? "Adding…" : "Add note"}
        </button>
      </div>

      {error && <p style={{ fontFamily: fonts.description, fontSize: 13, color: colors.badNumber, marginTop: 8 }}>{error}</p>}

      {/* Read / update / delete */}
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && <p style={{ fontFamily: fonts.description, fontSize: 13, color: colors.mutedText }}>Loading notes…</p>}
        {!loading && notes.length === 0 && (
          <p style={{ fontFamily: fonts.description, fontSize: 13, color: colors.mutedText }}>No notes yet.</p>
        )}

        {notes.map((note) => (
          <div key={note.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: "10px 12px" }}>
            {editingId === note.id ? (
              <>
                <textarea value={editingBody} onChange={(e) => setEditingBody(e.target.value)} style={textarea} maxLength={2000} />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 6 }}>
                  <button onClick={() => saveEdit(note.id)} aria-label="Save note" title="Save" style={{ ...iconBtn, color: colors.goodNumber }}>
                    <Check size={16} />
                  </button>
                  <button onClick={cancelEdit} aria-label="Cancel edit" title="Cancel" style={iconBtn}>
                    <X size={16} />
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, fontFamily: fonts.description, fontSize: 13, color: colors.darkMenu, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {note.body}
                </div>
                <button onClick={() => startEdit(note)} aria-label="Edit note" title="Edit" style={iconBtn}>
                  <Pencil size={15} />
                </button>
                <button onClick={() => handleDelete(note.id)} aria-label="Delete note" title="Delete" style={{ ...iconBtn, color: colors.badNumber }}>
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}