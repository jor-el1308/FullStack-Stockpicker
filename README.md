# FullStack-Stockpicker

Stock Screener Application — students input selection criteria (market cap,
dividends, revenue, PBT, PAT, EBITA, etc.) and the app scans the stock
database to return matching stocks. See the full requirement doc for detail;
this README covers the scaffold only.

## Stack

- **Frontend:** React (Vite) + JavaScript (JSX), React Router
- **Backend:** Node.js + Express + JavaScript (native ES modules)
- **Database:** MySQL
- **Shared:** a `shared/` package of JSDoc type definitions used by both
  sides so the API contract stays documented while each workstream builds
  in parallel.

## Folder layout

```
client/     React app (Vite + JS/JSX)
server/     Express API (JS) + MySQL schema/migrations
shared/     Shared JSDoc typedefs (ScreenerRequest, StockDetail, etc.)
```

## Team ownership (from the requirement doc)

| Person | Area | Main folders |
|---|---|---|
| 1 — Yong Wee | Auth & User Management | `server/src/{routes,controllers,services}/auth.*`, `client/src/pages/Login.jsx` |
| 2 — Charles | Data Collection & Database Design | `server/src/db/schema.sql`, `server/src/services/{dataIngestion,stockLookup}.service.js`, `server/src/routes/stocks.routes.js` |
| 3 — Jorel | Screener / Filter Engine | `server/src/{routes,controllers,services}/screener.*`, `client/src/pages/Screener.jsx` |
| 4 — Enrico | Dashboard & Stock Report Page | `server/src/{routes,controllers}/dashboard.*`, `client/src/pages/{Dashboard,StockDetail}.jsx`, `client/src/components/ResultsTable.jsx` |
| 5 — Jayden | Notifications & Optional AI Step | `server/src/{routes,controllers,services}/notifications.*`, `client/src/pages/Watchlist.jsx` |

Person 2's work is foundational — the schema and stock lookup endpoints are
filled in with working queries (not just stubs) so everyone else can build
against real data early. Every other route/controller file currently returns
`501 Not Implemented` as a placeholder — replace with real logic in your
workstream's files.

## Getting started

1. **Install dependencies** (from repo root):
   ```
   npm install
   ```

2. **Set up MySQL:**
   ```
   cp server/.env.example server/.env
   # edit server/.env with your local MySQL credentials
   npm run db:migrate   # applies server/src/db/schema.sql
   npm run db:seed      # loads a few sample rows (AAPL, DBS, etc.)
   ```

3. **Run the app:**
   ```
   npm run dev:server   # http://localhost:4000
   npm run dev:client   # http://localhost:5173 (proxies /api to the server)
   ```

## Design tokens

Colors and fonts from the company style guide are centralized in
`client/src/theme.js` and `client/src/index.css` — use these instead of
hardcoding values:

- Dark areas (menus): `#0A1628`
- Light backgrounds: `#F4F7FC`
- Clickable elements: `#1A5C9E`
- Good numbers: `#00A86B` / Bad numbers: `#D16B6B`
- Special features: `#C9A84C`
- Titles/labels: Inter Semi-bold · Body/filters: Inter Regular · All numbers: Roboto Mono

## Note on JavaScript vs TypeScript

This scaffold is plain JavaScript (no build-time type checking). The
`shared/types/index.js` file documents the API contract via JSDoc
`@typedef` comments — editors like VS Code will still show autocomplete
hints from these even without TypeScript. If the team wants compile-time
type safety back later, re-introducing TypeScript is mostly a matter of
renaming files back to `.ts`/`.tsx` and adding `tsconfig.json` files, since
the code was written without relying on any JS-only syntax.

## Known open questions (for the 7 May feedback per the requirement doc)

- Which data provider (Alpha Vantage / FMP / Yahoo Finance) covers both SGX
  and the target US exchanges within free-tier rate limits — see
  `server/src/services/dataIngestion.service.js` for notes.
- How to handle dual-listed stocks so they aren't double-counted.
- Whether the screener stays SG-only or expands to SG+US (affects schema
  scale and the data pipeline's rate-limit strategy).
