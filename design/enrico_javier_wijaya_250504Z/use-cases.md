# Use Cases — Dashboard & Stock Report

**Owner:** Enrico (Person 4) · **Features:** Dashboard (`/dashboard`) and Stock Report page (`/stock/:exchangeCode/:stockCode`)

These are the use cases for the two front-end features I'm responsible for: the screener **results table** on the Dashboard, and the per-stock **detail/report page** with its closing-price chart and 52-week high/low. Both consume data produced by Person 2 (stock/price data) and Person 3 (screener engine).

## Actors

Access to both pages is gated by authentication (`requireAuth`) and an active subscription (`requireActiveAccount` / `RequireActive`).

| Actor | State | Access |
|---|---|---|
| **Visitor** | Not logged in | Blocked — API `401`, redirected to `/login` |
| **Inactive user** | Logged in, unpaid (`is_active = 0`) | Blocked — API `402 ACCOUNT_INACTIVE`, redirected to `/activate` |
| **Subscriber** | Logged in, active | Full access — primary actor below |
| **Admin** | Logged in, active, admin | Same page access as Subscriber |

---

## UC-01 — View screener results on the Dashboard

- **Actor:** Subscriber
- **Trigger:** User opens `/dashboard`.
- **Preconditions:** Authenticated and active.
- **Main flow:**
  1. The Dashboard requests the default screen (`POST /api/screener/run` with an empty body).
  2. A *"Loading results…"* message shows while the request is in flight.
  3. On success, the returned rows render in the results table: Exchange, Stock Code, Stock Name, one column per criterion value, and a Score column when present.
- **Postcondition:** A ranked results table is visible.
- **Alternate / edge flows:**
  - *E1 — No results:* the request succeeds but returns an empty list → the table shows *"No results yet. Run the screener above."*
  - *E2 — Request fails:* an inline error message shows in the "bad number" colour, preserving the reason returned by the API.
  - *E3 — Not authenticated / inactive:* handled before the page renders (see Actors).

## UC-02 — Page through results

- **Actor:** Subscriber
- **Trigger:** User clicks **Next** / **Previous** in the results table.
- **Preconditions:** UC-01 returned more than one page of rows (15 per page by default).
- **Main flow:** The table slices the already-loaded rows in memory (no extra request) and updates the "Showing X–Y of N" counter.
- **Alternate / edge flows:**
  - *E1 — First / last page:* the corresponding button is disabled.
  - *E2 — New screen run:* when the row set changes, pagination resets to page 1.

## UC-03 — Open a stock's report from a result row

- **Actor:** Subscriber
- **Trigger:** User clicks a row in the results table.
- **Preconditions:** UC-01 has rendered rows.
- **Main flow:** The app navigates to `/stock/:exchangeCode/:stockCode`, using the clicked row's identity as the route parameters.
- **Postcondition:** The Stock Report page begins loading (UC-04).

## UC-04 — Read a stock's report

- **Actor:** Subscriber
- **Trigger:** The Stock Report page mounts for a given stock.
- **Preconditions:** A valid `exchangeCode` / `stockCode`.
- **Main flow:**
  1. The page fires two requests in parallel — stock detail (`GET /api/stocks/:exchangeCode/:stockCode`) and price history (`GET /api/stocks/:exchangeCode/:stockCode/prices`).
  2. A request-sequence guard ensures that if the user quickly opens a second stock, a slow first response cannot overwrite the newer stock's data.
  3. On success the page shows: current price and day change, the **closing-price line chart**, and stat cards for **52-week high**, **52-week low**, **market cap**, **latest revenue**, **revenue growth YoY**, and **latest dividend**.
- **Postcondition:** The full report is visible.
- **Alternate / edge flows:**
  - *E1 — Stock not found:* the detail request returns `404` → an inline "Couldn't load…" message with a **Back to results** action.
  - *E2 — No / single price point:* the chart area shows *"No price history available yet."*; price-derived figures are omitted (a day change needs at least two points).
  - *E3 — Missing financials / dividends:* the affected stat cards fall back to `—`.
  - *E4 — Network / server error:* an inline error message with a back action.

## UC-05 — Return to the results

- **Actor:** Subscriber
- **Trigger:** User clicks **Back to results** (or the error-state back action).
- **Preconditions:** The Stock Report page is open.
- **Main flow:** The page navigates back exactly one step in history, returning to whichever page linked here — Screener *or* Dashboard.
- **Alternate / edge flows:**
  - *E1 — Deep link:* if the report was the first page loaded in the tab (a bookmarked/shared `/stock/...` URL, so there is no in-app history), it falls back to `/dashboard` instead.

---

## Edge-case coverage summary

| Condition | Handled in | Result |
|---|---|---|
| Empty result set | Results table | "No results yet…" empty state |
| Screener request error | Dashboard | Inline error, reason preserved |
| Unauthenticated | Route guard + API `401` | Redirect to `/login` |
| Inactive / unpaid account | Route guard + API `402` | Redirect to `/activate` |
| Stock not found | Stock Report + API `404` | Inline error, back action |
| No / single price point | Stock Report | Chart placeholder, figures omitted |
| Missing financials / dividends | Stock Report | Stat cards show `—` |
| Rapid navigation between stocks | Request-sequence guard | Latest stock's data always wins |