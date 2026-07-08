# FullStack-Stockpicker

Stock Screener Application — students input selection criteria (market cap,
dividends, revenue, PBT, PAT, EBITA, etc.) and the app scans the stock
database to return matching stocks. See the full requirement doc for detail;
this README covers the scaffold only.

## Stack

- **Frontend:** React (Vite) + JavaScript (JSX), React Router
- **Backend:** Node.js + Express + JavaScript (native ES modules)
- **Data ingestion:** standalone Python script (`yfinance`) that populates MySQL
- **Payments:** Stripe Checkout, TEST MODE only (real Stripe infra, fake test cards, nothing charged)
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

## Team ownership (current work split)

| Person | Area | Individual feature | Main folders |
|---|---|---|---|
| 1 — Yong Wee | Auth + AI Recommendation | After a user runs a screen, send the shortlisted stocks to an AI model for qualitative analysis (recent news, growth outlook, reasoning) | `server/src/{routes,controllers,services}/auth.*`, `client/src/pages/Login.jsx` |
| 2 — Charles | Data Pipeline + Subscription/Paywall + Admin Dashboard | Subscription/payment page - new users pay to activate their account before accessing anything else | `server/src/db/schema.sql`, `ingestion/` (yfinance pipeline), `server/src/{routes,controllers,services}/{subscription,admin}.*`, `client/src/pages/{Activate,Admin}.jsx` |
| 3 — Jorel | Stock Screener / Filter Engine | Range-based filtering across criteria (market cap, revenue, dividend yield, PAT, EBITA, etc.), default filter values, company-age exclusion, sector exclusions | `server/src/{routes,controllers,services}/screener.*`, `client/src/pages/Screener.jsx` |
| 4 — Enrico | Dashboard + Stock Report Page | Screener results table and per-stock detail page - closing price chart, 52-week high/low, key criteria values | `server/src/{routes,controllers}/dashboard.*`, `client/src/pages/{Dashboard,StockDetail}.jsx`, `client/src/components/ResultsTable.jsx` |
| 5 — Jayden | Notifications / Watchlist | Watchlist page (pass/fail status against saved criteria) plus Telegram/WhatsApp alerts when a stock drops out of criteria | `server/src/{routes,controllers,services}/notifications.*`, `client/src/pages/Watchlist.jsx` |

Auth (Person 1) and the data pipeline/schema (Person 2) are foundational -
everyone else's features depend on a logged-in user and real data existing,
so those two started first. Person 3's screener is the algorithmically
densest piece and the one Persons 4 and 5 build on top of, so a stubbed API
endpoint went out early for them to build against before the real filtering
logic landed.

**Paywall note:** every route except `/api/auth/*`, `/api/subscription/*`,
and `/api/admin/*` requires the logged-in user to have an active (paid)
account - see `server/src/middleware/subscription.middleware.js`. New
signups start inactive and get redirected to `/activate` until they pay
the one-time activation fee. Needs to stay in sync with Person 1's
signup -> login flow since that's what determines when a user first hits
the paywall.

**Admin note (done):** `users.is_admin` gates the `/admin` page and
`/api/admin/*` routes (view all users, revoke/restore access, promote/demote
admins, per-user payment history, summary stats) - see
`server/src/middleware/admin.middleware.js`. Nobody can self-promote to
admin; see `server/src/db/migrations/002_add_admin_flag.sql` for how to
bootstrap the first admin account.

**Ideas / not yet built:**
- Light/dark mode toggle (a settings dropdown - theme switch, logout, etc.)
- Left-side nav bar instead of the current top nav
- Login through identity providers (optional / stretch)

## Run with Docker (fastest way to get it running)

If you have [Docker Desktop](https://www.docker.com/products/docker-desktop/)
installed, this replaces basically all of "Getting started" below with one
command. No local MySQL, no manual migrations, no Node/Python version
juggling — good for a friend testing the app, or for the teacher to run it
without setting anything up themselves.

```
docker-compose up --build
```

That single command builds the client and server images, starts a MySQL
container, waits for it to be healthy, then automatically:
applies `schema.sql` and every file in `server/src/db/migrations/` (safe to
re-run — they're idempotent), loads sample seed data, and starts both the
API and the frontend dev server.

- Frontend: http://localhost:5173
- API: http://localhost:4000
- MySQL: localhost:3306 (user `stockpicker` / password `changeme` by default)

Code changes on your machine are picked up live (both containers bind-mount
the source and hot-reload), so this works for active development too, not
just a one-off demo.

**Optional config:** copy `.env.example` to `.env` at the repo root to set a
real Stripe test key (`STRIPE_SECRET_KEY=sk_test_...`) so the paywall/checkout
flow works, or to change the default DB credentials. Everything else already
has working defaults.

**Useful commands:**
```
docker-compose up --build        # start everything (rebuilds if files changed)
docker-compose up -d             # start in the background
docker-compose down              # stop everything
docker-compose down -v           # stop AND wipe the MySQL data volume (fresh DB next time)
docker-compose logs -f server    # tail one service's logs
```

To become an admin, sign up through the running app, then connect to the
`mysql` container and run the same bootstrap `UPDATE` shown in step 2 below
(e.g. `docker-compose exec mysql mysql -u stockpicker -p stockpicker`).

This doesn't change anything about the schema, the code, or how the app
works — it's purely a setup wrapper. Everything in "Getting started" below
still works if you'd rather run things natively without Docker.

## Getting started (without Docker)

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

   `npm run db:migrate` now also applies every file in
   `server/src/db/migrations/` automatically (in order, after `schema.sql`),
   so a fresh database and a database you've had since before the
   subscription/paywall or admin features existed both end up on the same
   schema — no separate manual step needed. If you ever do need to run one
   by hand (e.g. `mysql` isn't on your PATH so you're pasting into MySQL
   Workbench instead), the files are numbered and safe to re-run.

   **To make your own account an admin**, sign up through the app first,
   then run:
   ```sql
   UPDATE users SET is_admin = 1 WHERE email = 'you@example.com';
   ```

3. **Set up Stripe (test mode)** for the activation-fee paywall:
   - Sign up free at https://dashboard.stripe.com/register - no business
     verification needed to use test mode.
   - Make sure the "Test mode" toggle in the dashboard is switched on.
   - Go to Developers -> API keys, copy the **Secret key** (starts `sk_test_`).
   - Add it to `server/.env`: `STRIPE_SECRET_KEY=sk_test_...`
   - When paying in the app, use Stripe's test card `4242 4242 4242 4242`,
     any future expiry date, any 3-digit CVC.
   - Never put a real (`sk_live_`) key here - test keys can't move real money.

4. **Set up welcome emails** (optional) - sent automatically once a new
   account's activation payment goes through:
   - Easiest for local testing: sign up free at https://ethereal.email,
     which hands you a fake SMTP inbox (nothing is actually delivered, you
     just see the rendered email on their site).
   - Add its generated credentials to `server/.env`:
     `SMTP_HOST=`, `SMTP_USER=`, `SMTP_PASSWORD=` (`SMTP_PORT` defaults to
     `587`).
   - Leave these blank to skip email sending entirely - activation still
     works either way, it just logs a warning instead of sending.

5. **Load real data** (replaces the old `db:seed` sample rows):
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

6. **Run the app:**
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


## Known open questions

- Data provider: using Yahoo Finance (`yfinance`) for the prototype since
  it's free and covers both SGX and US tickers — see `ingestion/README.md`
  for the tradeoffs (unofficial API, no SLA) versus a paid provider later.
- How to handle dual-listed stocks so they aren't double-counted.
- Whether the screener stays SG-only or expands to SG+US (affects schema
  scale and the data pipeline's rate-limit strategy).
- EBITA vs EBITDA, missing listed/IPO dates, and cross-currency dividend
  comparison — see `ingestion/README.md` "Known limitations" for detail.
- Payments are Stripe **test mode** only (one-time activation fee, no
  recurring billing) - a real launch would need live keys, webhook
  handling for reliability, and a decision on recurring vs one-time billing.
- Admin dashboard has no hard-delete for user accounts (revoke/restore
  access only) - deliberate for now, since deleting a user's data is
  irreversible and wasn't asked for; easy to add if the team wants it.
