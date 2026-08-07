# Deployment (Docker Compose)

This brings up the whole stock-screener stack — MySQL, the API server, and the
Vite client — in containers, with **no local processes** required beyond Docker
itself. Verified end-to-end on Docker Engine 29.x / Compose v5.

## Services

`docker-compose.yml` defines three services:

| Service  | Image / build            | Host port | Purpose                                                        |
|----------|--------------------------|-----------|---------------------------------------------------------------|
| `mysql`  | `mysql:8.0`              | `3307`    | Database. Data persists in the `mysql-data` named volume.     |
| `server` | `server/Dockerfile`      | `4000`    | Node/Express API. Waits for MySQL, migrates, seeds, then runs.|
| `client` | `client/Dockerfile`      | `5173`    | Vite dev server. Proxies `/api` to the `server` container.    |

On the internal Docker network the server reaches the database at `mysql:3306`
and the client reaches the server at `server:4000`. Host port `3307` is only for
connecting an external tool (e.g. MySQL Workbench) to the DB — the app never uses it.

## Prerequisites

- Docker Desktop (or Docker Engine) running, with the Compose v2 plugin
  (`docker compose`, not the legacy `docker-compose`).
- Ports **5173**, **4000**, and **3307** free on the host.

## Bring up the stack from a clean clone

```bash
git clone <repo-url>
cd FullStack-Stockpicker

# Build all images and start every service. The server container automatically:
#   waits for MySQL -> applies schema.sql + migrations -> seeds sample data -> starts the API.
docker compose up --build
```

That single command is all it takes. Add `-d` to run detached:

```bash
docker compose up --build -d
```

Then open:

- **Client (UI):**  http://localhost:5173
- **API health:**   http://localhost:4000/api/health

A clean clone has **no `.env` file** (it's gitignored), so the stack uses the
self-contained defaults baked into `docker-compose.yml`: the local `mysql`
container, database `stockpicker`, user `stockpicker` / password `changeme`.
No external services are needed.

## Verify it's healthy

```bash
# All three containers up; mysql reports (healthy).
docker compose ps

# Server reachable directly:
curl http://localhost:4000/api/health
# -> {"success":true,"data":{"status":"ok"}}

# Client -> server proxy working (same response, through the client's :5173):
curl http://localhost:5173/api/health
# -> {"success":true,"data":{"status":"ok"}}

# Server -> database working at request time (queries the users table;
# a structured auth error, not a 500, means the DB round-trip succeeded):
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com","password":"wrong"}'
# -> {"success":false,"error":{"message":"Invalid email or password"}}

# Confirm seed data landed in the DB:
docker compose exec mysql \
  mysql -ustockpicker -pchangeme stockpicker \
  -e "SELECT COUNT(*) AS stocks FROM stock;"
# -> 16
```

## Common operations

```bash
docker compose logs -f server     # tail server logs (2FA/login codes print here if SMTP is unset)
docker compose logs -f client     # tail client logs
docker compose restart server     # restart just the API
docker compose down               # stop and remove containers (DB data survives in the volume)
docker compose down -v            # stop and ALSO wipe the mysql-data volume (full reset)
docker compose up --build         # rebuild after dependency/Dockerfile changes
```

## Optional configuration (`.env`)

Everything above works with zero configuration. Create a root `.env` (copy
`.env.example`) only if you want to override a default. All keys already have
sane defaults in `docker-compose.yml`; the file is optional.

The most common reasons to add one:

- **`STRIPE_SECRET_KEY`** — a Stripe *test* key (`sk_test_...`) so the
  paywall/checkout flow works.
- **`SMTP_*`** — real SMTP creds so welcome emails and login 2FA codes are
  emailed instead of printed to `docker compose logs server`.

### Using an external database instead of the local `mysql` container (optional)

By default the stack is fully self-contained (local `mysql` container). If you
instead want to point the server at an external managed MySQL (e.g. a shared
team database), set these in the root `.env`:

```bash
DB_HOST=your-host.example.com
DB_PORT=3306
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
DB_SSL=true                 # most managed hosts require TLS
DB_SSL_CA=aiven-ca.pem      # optional: CA cert under server/, for cert verification
```

> **Note:** When `DB_HOST` is set in `.env`, the server uses that external
> database and the local `mysql` container is left unused (you can leave it in
> the compose file — it just won't be touched). To force the fully
> self-contained, in-compose database, leave `DB_HOST` unset (or remove `.env`).

## Fix applied to make this work

The client's `vite.config.js` defaults to port **5200** (a workaround for a
Windows-reserved port range that only affects running Vite directly on the host),
and expects `VITE_PORT=5173` to be set inside Docker. That variable was missing
from the `client` service, so the container listened on 5200 while the port
mapping forwarded `5173 -> 5173` to nothing, leaving the UI unreachable.
`docker-compose.yml` now sets `VITE_PORT: "5173"` on the `client` service so the
dev server binds the same port that's mapped to the host.
