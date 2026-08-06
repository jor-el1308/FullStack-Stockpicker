# Database Schema — Watchlist & Notifications

**Owner:** Person 5

The tables my features own — `watchlist` and `watchlist_alert_log` — plus the tables they reference. Column names are the raw SQL names.

## Tables I own

### `watchlist` — a user's tracked stocks

One row per stock a user is tracking, optionally tied to a saved criteria set and an alert channel.

| Column | Type | Null | Key | Notes |
|---|---|---|---|---|
| `id` | CHAR(36) | No | PK | UUID (defaults to `UUID()`) |
| `user_id` | CHAR(36) | No | FK → `users(id)` | Owner; cascade delete |
| `exchange_code` | VARCHAR(16) | No | FK → `stock` | Part of the stock identity |
| `stock_code` | VARCHAR(32) | No | FK → `stock` | Part of the stock identity |
| `saved_criteria_set_id` | CHAR(36) | Yes | FK → `saved_criteria_set(id)` | Which saved screen to evaluate pass/fail against; nullable |
| `channel` | ENUM('whatsapp','telegram','email') | No | | Alert channel; defaults to `email` |
| `created_at` | TIMESTAMP | No | | Insert time |

- **Primary key:** `id`.
- **Foreign keys:**
  - `user_id` → `users(id)` `ON DELETE CASCADE` (delete a user → their watchlist goes).
  - (`exchange_code`, `stock_code`) → `stock(exchange_code, stock_code)` `ON DELETE CASCADE` (delist a stock → it's removed from all watchlists).
  - `saved_criteria_set_id` → `saved_criteria_set(id)` `ON DELETE SET NULL` (delete a saved screen → the watchlist row stays but loses its criteria).

### `watchlist_alert_log` — record of alerts sent

An audit trail of alerts fired for a watchlist item (so the same drop-out isn't re-notified endlessly and there's a history).

| Column | Type | Null | Key | Notes |
|---|---|---|---|---|
| `id` | CHAR(36) | No | PK | UUID |
| `watchlist_id` | CHAR(36) | No | FK → `watchlist(id)` | Which watchlist item triggered it; cascade delete |
| `triggered_at` | TIMESTAMP | No | | When the alert fired |
| `message` | TEXT | Yes | | The alert body that was sent |

- **Primary key:** `id`.
- **Foreign key:** `watchlist_id` → `watchlist(id)` `ON DELETE CASCADE`.

## Referenced tables (owned by teammates)

- `users(id)` — the account (Person 1).
- `stock(exchange_code, stock_code)` — the stock identity, composite PK (Person 2).
- `saved_criteria_set(id)` — a named saved screen (Person 1/3); its filters live in `saved_criteria_item`.

## Relationships

```
users (1) ──< watchlist >── (1) stock
                  │  \
                  │   └──(0..1) saved_criteria_set   (SET NULL on delete)
                  │
                  └──< watchlist_alert_log
```

- A user has many watchlist rows; each row points at exactly one stock and, optionally, one saved criteria set.
- Each watchlist row has many alert-log entries.
- Normalisation: the watchlist references the stock and criteria set by key rather than duplicating their data, so stock names/criteria live in one place; the alert log is separated from the watchlist row so a single watched stock can accumulate many alerts over time (1-to-many) without widening the watchlist table.