# System Architecture

FullStack-Stockpicker is a monorepo with four cooperating parts plus a set of
external services. The diagram lives in
[architecture-diagram.md](architecture-diagram.md) (Mermaid) /
`architecture-diagram.png`; this document explains it.

## Components

| Component | Folder | Tech | Responsibility |
|---|---|---|---|
| **Frontend (client)** | `client/` | React 18 + Vite, React Router, plain JS/JSX | Single-page app: screener UI, dashboard, stock report, watchlist, AI history, activation/billing, admin dashboard. |
| **Backend API (server)** | `server/` | Node.js + Express (ES modules) | REST API over MySQL: auth, paywall, screening, stock data, AI analysis, notifications, admin. |
| **Data ingestion** | `ingestion/` | Python + `yfinance` | Standalone pipeline that pulls prices/market-cap/dividends/financials from Yahoo Finance and upserts them into MySQL. |
| **Database** | (MySQL) | MySQL 8 (InnoDB) | Single source of truth. Schema in `server/src/db/schema.sql` + `server/src/db/migrations/`. |

> **Naming note:** the assignment brief refers to `frontend/` and `backend/`;
> this repo implements them as `client/` and `server/` (with `ingestion/` and a
> shared `shared/` typedef package alongside).

## How a request flows

1. The browser loads the React app. In development the **Vite dev server**
   (`http://localhost:5173`, or 5200 locally) serves the client and **proxies
   `/api/*` to the Express server** (`http://localhost:4000`), so the frontend
   and API share an origin and the session cookie "just works".
2. Every API call goes through one thin fetch wrapper, `client/src/api/client.js`,
   which sends `credentials: "include"` (the httpOnly session cookie) and
   unwraps the standard `{ success, data|error }` envelope.
3. On the server, each request passes through **middleware → route → controller
   → service → MySQL**:
   - **Middleware:** `requireAuth` (valid session/JWT cookie), then feature
     gates — `requireActiveAccount` (paywall) or `requireAdmin`.
   - **Routes** (`server/src/routes/*`) map URLs to controllers.
   - **Controllers** (`server/src/controllers/*`) validate input (zod) and shape
     the response envelope.
   - **Services** (`server/src/services/*`) hold the business logic and are the
     only layer that talks to MySQL (via the shared `mysql2` pool in
     `server/src/config/db.js`) or to external APIs.

## API surface (route ownership)

Mounted in `server/src/app.js`; ownership follows the team split in the README.

| Base path | Owner | Auth gate |
|---|---|---|
| `/api/auth/*` | Person 1 | public (it's the way *in*) |
| `/api/subscription/*` | Person 2 | `requireAuth` only (must subscribe before active) |
| `/api/admin/*` | Person 2 | `requireAuth` + `requireAdmin` |
| `/api/stocks/*` | Person 2 | `requireAuth` + `requireActiveAccount` |
| `/api/screener/*` | Person 3 | `requireAuth` + `requireActiveAccount` |
| `/api/dashboard/*` | Person 4 | `requireAuth` + `requireActiveAccount` |
| `/api/notifications/*` | Person 5 | `requireAuth` + `requireActiveAccount` |
| `/api/ai/*` | Person 1 | `requireAuth` + `requireActiveAccount` |
| `/api/subscription/webhook` | Person 2 | **no cookie** — verified by Stripe signature (mounted with the raw body *before* `express.json()`) |

## Authentication & the paywall

- **Sessions** are an httpOnly cookie (JWT) set by the auth controller; the
  client never reads the token directly.
- **Login is two-step:** password, then a 6-digit code emailed to the user
  (`login_otp` table). Social sign-in (Google / Microsoft OAuth) is an alternate
  entry point.
- **The paywall** is the `users.is_active` flag, checked by
  `requireActiveAccount`. New accounts start inactive and are redirected to
  `/activate`. Access is kept in sync with the live Stripe subscription by
  webhooks (activation, renewals, failed renewals, cancellations) — not just the
  first payment. Admins bypass the paywall so they can never lock themselves out.

## Data ingestion & refresh

- `ingestion/ingest.py` runs independently (or in Docker) and writes directly to
  MySQL. Its stock universe is either a fixed ticker list (`tickers.py`) or a
  dynamic, criteria-based universe (`universe.py`).
- An admin can trigger a refresh from the dashboard: `POST /api/admin/reseed`
  spawns the pipeline server-side (`server/src/services/ingestion.service.js`),
  with progress polled via `/api/admin/reseed/status`. An auto-reseed **schedule**
  (`reseed_schedule` table) can re-run it on a fixed interval; the scheduler is
  resumed at server startup (`initReseedScheduler`).
- An in-memory cache (`server/src/utils/cache.js`) fronts hot stock reads and can
  be cleared via `POST /api/admin/cache/clear` after a reseed.

## External services

| Service | Used for | Where |
|---|---|---|
| **Stripe** (test mode) | Checkout, billing portal, subscription webhooks | `subscription.service.js` |
| **Yahoo Finance** (`yfinance`) | Source of all stock data | `ingestion/` |
| **SMTP email** (`nodemailer`) | Login OTP, welcome email, email-change codes | `utils/mailer.js` |
| **AI providers** (Gemini / OpenRouter) | Qualitative stock analysis | `ai.service.js` |
| **Twilio / Telegram** | Watchlist alerts (WhatsApp / Telegram / email) | `notifications.service.js`, `whatsapp.service.js` |
| **Google / Microsoft OAuth** | Social sign-in | `googleOAuth.service.js`, `microsoftOAuth.service.js` |
| **PDFKit** | Admin summary/report export | `admin.controller.js` |

All external integrations degrade gracefully when unconfigured (e.g. missing
SMTP logs the OTP to the console; missing Stripe key returns a clear setup
error) so local development works without every key set.

## Deployment / running

- **Local, one command:** `docker-compose up --build` builds the client and
  server images, starts MySQL, waits for it to be healthy, applies
  `schema.sql` + every migration, seeds sample data, and starts both dev
  servers (client on 5173, API on 4000, MySQL on host port 3307). Source is
  bind-mounted for hot reload.
- **Native:** `npm install`, create the MySQL DB, `npm run db:migrate`, then
  `npm run dev:server` and `npm run dev:client`.
- **Shared DB (optional):** the whole team can point at one free Aiven MySQL
  instance via `DB_*` + `DB_SSL*` env vars (see README).
- Secrets live in `.env` files (never committed — see `.gitignore`); each
  component ships a `.env.example`.

## Cross-cutting conventions

- **Response envelope:** every JSON endpoint returns `{ success: true, data }`
  or `{ success: false, error: { message, code?, details? } }`.
- **Validation:** request bodies are validated with **zod** in the controllers.
- **Shared contract:** `shared/` holds JSDoc typedefs (ScreenerRequest,
  StockDetail, etc.) so client and server agree on shapes.
- **Security:** `helmet`, `cors` with credentials, httpOnly cookies, bcrypt
  password/OTP hashing, and JWT signing that fails fast if the secret is unset.
