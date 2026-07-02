# FullStack-Stockpicker

Stock Screener Application — students input selection criteria (market cap,
dividends, revenue, PBT, PAT, EBITA, etc.) and the app scans the stock
database to return matching stocks. See the full requirement doc for detail;
this README covers the scaffold only.

## Stack

- **Frontend:** React (Vite) + JavaScript (JSX), React Router
- **Backend:** Node.js + Express + JavaScript (native ES modules)
- **Data ingestion:** standalone Python script (`yfinance`) that populates MySQL
- **Database:** MySQL
- **Shared:** a `shared/` package of JSDoc type definitions used by both
  sides so the API contract stays documented while each workstream builds
  in parallel.

## Folder layout

```
client/     React app (Vite + JS/JSX)
server/     Express API (JS) + MySQL schema/migrations - reads from MySQL
ingestion/  Python script (yfinance) that writes stock data into MySQL
shared/     Shared JSDoc typedefs (ScreenerRequest, StockDetail, etc.)
```

## Team ownership (from the requirement doc)

| Person | Area | Main folders |
|---|---|---|
| 1 — Yong Wee | Auth & User Management | `server/src/{routes,controllers,services}/auth.*`, `client/src/pages/Login.jsx` |
| 2 — Charles | Data Collection & Database Design | `server/src/db/schema.sql`, `ingestion/` (yfinance pipeline), `server/src/routes/stocks.routes.js` |
| 3 — Jorel | Screener / Filter Engine | `server/src/{routes,controllers,services}/screener.*`, `client/src/pages/Screener.jsx` |
| 4 — Enrico | Dashboard & Stock Report Page | `server/src/{routes,controllers}/dashboard.*`, `client/src/pages/{Dashboard,StockDetail}.jsx`, `client/src/components/ResultsTable.jsx` |
| 5 — Jayden | Notifications & Optional AI Step | `server/src/{routes,controllers,services}/notifications.*`, `client/src/pages/Watchlist.jsx` |

Person 2's work is foundational — the schema and stock lookup endpoints are
filled in with working queries (not just stubs) so everyone else can build
against real data early. Every other route/controller file currently returns
`501 Not Implemented` as a placeholder — replace with real logic in your
workstream's files.

## Getting started

1. **Install Node dependencies** (from repo root):
   ```
   npm install
   ```

2. **Create the MySQL user and database**, then apply the schema. You need
   a MySQL server running locally first (MySQL Community Server or similar).
   Log in as root/admin and run:
   ```sql
   CREATE USER IF NOT EXISTS 'stockpicker'@'localhost' IDENTIFIED BY 'changeme';
   CREATE DATABASE IF NOT EXISTS stockpicker;
   GRANT ALL PRIVILEGES ON stockpicker.* TO 'stockpicker'@'localhost';
   FLUSH PRIVILEGES;
   ```
   (Feel free to use your own username/password instead of `stockpicker`/`changeme` -
   just make sure `server/.env` matches whatever you pick.)

   Then:
   ```
   cp server/.env.example server/.env
   # edit server/.env if you used different DB credentials above
   npm run db:migrate --workspace=server   # applies server/src/db/schema.sql
   ```
   If this fails with "Access denied for user ... (using password: NO)",
   it almost always means `server/.env` doesn't exist yet (so it fell back
   to an empty password) - double check step 2's `cp` ran.

3. **Load real data** (replaces the old `db:seed` sample rows):
   ```
   cd ingestion
   python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env   # same DB credentials as server/.env
   python ingest.py
   ```
   See `ingestion/README.md` for the default stock list and known data
   limitations (Yahoo Finance is unofficial, EBITDA used as an EBITA proxy,
   etc). `npm run db:seed --workspace=server` still works if you just want
   the old 4-row placeholder data instead.

4. **Run the app:**
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

- Data provider: using Yahoo Finance (`yfinance`) for the prototype since
  it's free and covers both SGX and US tickers — see `ingestion/README.md`
  for the tradeoffs (unofficial API, no SLA) versus a paid provider later.
- How to handle dual-listed stocks so they aren't double-counted.
- Whether the screener stays SG-only or expands to SG+US (affects schema
  scale and the data pipeline's rate-limit strategy).
- EBITA vs EBITDA, missing listed/IPO dates, and cross-currency dividend
  comparison — see `ingestion/README.md` "Known limitations" for detail.
