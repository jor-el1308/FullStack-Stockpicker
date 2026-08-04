# Frontend Test Cases — Dashboard & Stock Report

**Owner:** Enrico (Person 4) · **Framework:** Vitest + React Testing Library (jsdom)

Unit tests for the three components I own: `ResultsTable`, `Dashboard`, and `StockDetail`. All 18 tests pass.

## How to run

From `client/`:

```
npm install      # first time — installs vitest + testing-library
npm test         # runs all tests once
npm run test:watch   # re-runs on change
```

Test files live in `client/tests/enrico_javier_wijaya_250504Z/`. Config is the `test` block in `client/vite.config.js`; `client/tests/setup.js` loads the jest-dom matchers.

---

## ResultsTable (`ResultsTable.test.jsx`) — 8 cases

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | renders rows with identity + formatted criteria | Each row shows exchange, code, name, and criteria columns formatted via `criteria.js` | Both stocks render; headers "Market Cap"/"P/E Ratio"; values show as `$95.0B`, `9.8×` |
| 2 | Score column only when scored | Score column appears when rows carry a `score` | "Score" header and the value `87` are shown |
| 3 | empty state | Passing `rows={[]}` shows the empty message and no table | Custom empty message shown; no `<table>` rendered |
| 4 | row click | Clicking a row calls `onRowClick` with that row | `onRowClick` called once with the correct row object |
| 5 | keyboard accessibility | Clickable rows are focusable and respond to Enter/Space | Row has `tabindex="0"`; Enter and Space each fire `onRowClick` (2 calls) |
| 6 | non-clickable rows aren't buttons | Without `onRowClick`, rows aren't exposed as buttons | No element has role `button` |
| 7 | pagination | With `pageSize=1`, paging shows one stock per page and disables the pager at the ends | Page 1 shows first stock + Previous disabled; clicking Next shows second stock + Next disabled |
| 8 | selection checkboxes | With `selectable`, checkboxes render, reflect `selectedKeys`, and toggling reports the row | Two checkboxes; pre-selected row checked; clicking the other calls `onToggleRow` with that row |

## Dashboard (`Dashboard.test.jsx`) — 4 cases

The screener API (`getStocks`) is mocked so each state is deterministic.

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | loading state | Before the request resolves, a loading message shows | "Loading results…" is visible |
| 2 | success | On a successful response, the results table renders and the API is called once | Stock name renders; `getStocks` called once; loading message gone |
| 3 | error state | A rejected request surfaces an error, preserving the message | "Couldn't load screener results" plus the error text shown |
| 4 | empty state | An empty result set shows the table's empty message | "No results yet…" is shown |

## StockDetail (`StockDetail.test.jsx`) — 6 cases

`getStockDetail` / `getStockPrices` are mocked; Recharts is stubbed (it can't measure size in jsdom).

| # | Test | What it checks | Expected outcome |
|---|---|---|---|
| 1 | loading state | Before data arrives, a loading message shows | "Loading stock…" is visible |
| 2 | loaded identity | Name and `EXCHANGE:CODE` render; APIs called with the route params | "DBS Group Holdings" and "SGX:D05" shown; both APIs called with `("SGX","D05")` |
| 3 | **price ordering (regression)** | When prices arrive **newest-first**, the *most recent* close is used as the current price — not the last array element | Current price `34.50` (latest date) shown, day change `+1.30`; oldest close `32.00` is **not** shown as current price |
| 4 | 52-week high/low | Both values from the detail payload render | `38.20` and `30.15` shown |
| 5 | no price history | An empty prices array shows a placeholder instead of a chart | "No price history available yet" shown |
| 6 | error state | A failed detail request shows an error and a back action | "Couldn't load…" message plus a "Back to results" button |

---

## Notes

- **Case StockDetail #3 is the important one.** The `/prices` endpoint currently returns rows newest-first, while the chart and current-price logic assume oldest-first. `StockDetail` sorts prices ascending on load to stay correct regardless of API order; this test locks that behaviour in so a future change can't silently reverse the chart.
- Tests use mocked API modules, so no server or database is needed to run them.