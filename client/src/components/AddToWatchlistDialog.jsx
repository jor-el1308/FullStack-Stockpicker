/**
 * Owner: Person 5 (Jayden) - Notifications.
 * Small modal used to put a stock on the watchlist from wherever it was found
 * (currently the Screener results table) instead of making the user retype the
 * exchange + stock code on the Watchlist page.
 *
 * The stock itself is fixed - it comes from the row that was clicked - so the
 * only things to fill in are the alert settings: which saved screen decides
 * pass/fail, and where the alert should go.
 *
 * @param {{
 *   stock: { exchangeCode: string, stockCode: string, stockName?: string },
 *   savedScreens?: { id: string, name: string }[],
 *   defaults?: { savedCriteriaSetId?: string, channel?: string, recipientNumber?: string },
 *   submitting?: boolean,
 *   error?: string | null,
 *   onSubmit: (values: { savedCriteriaSetId: string, channel: string, recipientNumber: string }) => void,
 *   onClose: () => void,
 * }} props
 */
import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";

export const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "email", label: "Email" },
];

// The alert channel + recipient are the same for nearly every stock a user
// adds, so the last ones used are remembered and pre-filled instead of being
// asked for again on every row. Shared by every page that opens this dialog.
export const WATCHLIST_DEFAULTS_KEY = "watchlistAlertDefaults";

export function readWatchlistDefaults() {
  try {
    const stored = JSON.parse(localStorage.getItem(WATCHLIST_DEFAULTS_KEY) ?? "{}");
    return {
      savedCriteriaSetId: stored.savedCriteriaSetId ?? "",
      channel: stored.channel ?? "whatsapp",
      recipientNumber: stored.recipientNumber ?? "",
    };
  } catch {
    return { savedCriteriaSetId: "", channel: "whatsapp", recipientNumber: "" };
  }
}

export function rememberWatchlistDefaults(values) {
  try {
    localStorage.setItem(WATCHLIST_DEFAULTS_KEY, JSON.stringify(values));
  } catch {
    // Private-mode / storage-full: remembering the defaults is a nicety.
  }
}

export default function AddToWatchlistDialog({
  stock,
  savedScreens = [],
  defaults = {},
  submitting = false,
  error = null,
  onSubmit,
  onClose,
}) {
  const [savedCriteriaSetId, setSavedCriteriaSetId] = useState(defaults.savedCriteriaSetId ?? "");
  const [channel, setChannel] = useState(defaults.channel ?? "whatsapp");
  const [recipientNumber, setRecipientNumber] = useState(defaults.recipientNumber ?? "");
  const closeRef = useRef(null);

  // Escape closes, and focus starts inside the dialog so keyboard users aren't
  // left tabbing through the page behind it.
  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ savedCriteriaSetId, channel, recipientNumber: recipientNumber.trim() });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="watchlist-dialog-title">
        <div className="modal-head">
          <span id="watchlist-dialog-title" className="modal-title">
            <Bell size={15} color="var(--color-clickable)" />
            Add to watchlist
          </span>
          <button
            ref={closeRef}
            type="button"
            className="btn btn-secondary"
            style={{ padding: "4px 8px" }}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="modal-body">
          <p className="page-subtitle" style={{ margin: "0 0 14px" }}>
            {stock.stockName ? `${stock.stockName} — ` : ""}
            <span className="numeric">
              {stock.exchangeCode}:{stock.stockCode}
            </span>
          </p>

          <form onSubmit={handleSubmit} className="watchlist-form-grid" style={{ marginTop: 4 }}>
            <label className="watchlist-field">
              <span>Saved criteria</span>
              <select value={savedCriteriaSetId} onChange={(e) => setSavedCriteriaSetId(e.target.value)}>
                <option value="">None selected</option>
                {savedScreens.map((screen) => (
                  <option key={screen.id} value={screen.id}>
                    {screen.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="watchlist-field">
              <span>Alert channel</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {channel === "whatsapp" && (
              <label className="watchlist-field">
                <span>WhatsApp number</span>
                <input
                  value={recipientNumber}
                  onChange={(e) => setRecipientNumber(e.target.value)}
                  placeholder="+6591234567"
                />
              </label>
            )}

            {error ? <div className="notice notice-error">{error}</div> : null}

            <div className="watchlist-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                <Bell size={13} />
                {submitting ? "Adding…" : "Add to watchlist"}
              </button>
              <span className="page-subtitle">
                {savedScreens.length > 0
                  ? "Pick a saved screen to get pass/fail status on the Watchlist page."
                  : "Save a screen first to enable pass/fail evaluation."}
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
