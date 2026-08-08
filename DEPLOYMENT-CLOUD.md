# Cloud Deployment — Vercel + Render + Aiven

> This is the **corrected** version of the generic school deployment template.
> The template assumed **Postgres** and a `DATABASE_URL` string; this app is
> **MySQL** and reads discrete `DB_*` vars. It also assumed the frontend takes a
> `VITE_API_URL` env var — it does not. The three differences are called out
> inline below. For the local Docker setup, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Architecture

| Piece    | Host   | What it is                                             |
|----------|--------|--------------------------------------------------------|
| Frontend | Vercel | React + Vite static build (`client/`)                  |
| Backend  | Render | Node/Express API (`server/`), entry `src/index.js`     |
| Database | Aiven  | **MySQL** free tier (NOT Postgres)                     |

The frontend does **not** call the backend cross-domain. Instead
[`client/vercel.json`](./client/vercel.json) rewrites `/api/*` on the Vercel
domain to the Render backend, so the browser stays same-origin. This is what
makes the hardcoded `BASE_URL = "/api"`
([client/src/api/client.js](./client/src/api/client.js)) work in production, and
what keeps the `SameSite=Lax` auth cookie
([server/src/controllers/auth.controller.js](./server/src/controllers/auth.controller.js))
working — a cross-domain setup would silently drop that cookie and log users out.

---

## 1. Database — Aiven **MySQL** (free tier)

> **Difference #1 vs. the template:** create a **MySQL** service, not
> PostgreSQL. There is no `DATABASE_URL`.

1. Sign up at aiven.io (no card), create a **MySQL** service (free tier).
2. From the service **Overview → Connection information**, note: Host, Port,
   User (`avnadmin`), Password, Database (`defaultdb`).
3. These map to the server's env vars (see step 3). Aiven requires TLS, so
   `DB_SSL=true`. The repo already ships Aiven's CA at `server/aiven-ca.pem`;
   set `DB_SSL_CA=aiven-ca.pem` to verify the server cert.
4. **Free-tier Aiven powers OFF after inactivity** (you get a warning email). If
   the app can't reach the DB, power it back on from the Aiven console.

---

## 2. Backend — Render

1. New **Web Service** → connect GitHub → **Root Directory: `server`**.
   - Build Command: `npm install`
   - Start Command: `node src/index.js`
   - (The `shared/` workspace is only referenced in JSDoc type comments, never
     at runtime, so deploying just `server/` is fine.)
2. Add environment variables — see
   [`server/.env.production.example`](./server/.env.production.example) for the
   full annotated list. The essentials:

   ```
   NODE_ENV=production
   DB_HOST=...   DB_PORT=...   DB_USER=avnadmin
   DB_PASSWORD=...   DB_NAME=defaultdb
   DB_SSL=true   DB_SSL_CA=aiven-ca.pem
   JWT_SECRET=<long random string>
   CLIENT_ORIGIN=https://your-frontend.vercel.app   # NOT "FRONTEND_URL"
   AUTO_SEED=false                                   # don't re-seed every restart
   ```

   > **Difference #2 vs. the template:** the DB is configured with `DB_*` vars,
   > the frontend origin var is **`CLIENT_ORIGIN`** (not `FRONTEND_URL`), and set
   > **`AUTO_SEED=false`** so production data isn't wiped/reseeded on each boot.

3. Deploy. Copy the live URL, e.g. `https://your-app.onrender.com`.
4. Render free tier spins down after ~15 min idle → ~30s cold start on the next
   request. Combined with Aiven's idle power-off, warn anyone before a live demo.

---

## 3. Frontend — Vercel

> **Difference #3 vs. the template:** do **not** set `VITE_API_URL` — the client
> ignores it. Routing to the backend is done by the `vercel.json` rewrite.

1. New **Project** → connect GitHub → **Root Directory: `client`**.
   Vercel auto-detects Vite (build `vite build`, output `dist`).
2. Open [`client/vercel.json`](./client/vercel.json) and replace
   `https://YOUR-BACKEND.onrender.com` with the real Render URL from step 2.
   Commit and push.
3. Deploy. Copy the Vercel URL, e.g. `https://your-frontend.vercel.app`.

---

## 4. Wire up + test

1. Put the Vercel URL into Render's **`CLIENT_ORIGIN`** env var → redeploy backend.
2. Confirm `client/vercel.json`'s `destination` points at the real Render URL.
3. End-to-end smoke test on the live Vercel URL:
   - Register + log in (confirm you **stay** logged in after refresh — this
     verifies the cookie/rewrite path).
   - Run a screener filter, add to watchlist.
   - `https://your-frontend.vercel.app/api/health` should return
     `{"success":true,...}` (proves the rewrite reaches Render).

## Deploy order (important)

Backend first (frontend's `vercel.json` needs its URL) → frontend →
then set `CLIENT_ORIGIN` on the backend and redeploy it.

## Never commit

Real `.env` files or filled-in secrets. Only the `*.example` templates are
tracked; `.gitignore` already excludes the rest.
