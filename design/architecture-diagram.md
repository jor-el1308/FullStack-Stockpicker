# System Architecture Diagram

System diagram for FullStack-Stockpicker. See
[architecture.md](architecture.md) for the narrative. Rendered copy:
`architecture-diagram.png`.

```mermaid
flowchart TB
    user([User / Browser])
    admin([Admin])

    subgraph client["Frontend — client/ (React + Vite)"]
        direction TB
        pages["Pages: Screener · Dashboard · StockDetail<br/>Watchlist · AiHistory · Activate · Settings · Admin"]
        apiwrap["api/client.js<br/>(fetch wrapper, sends session cookie)"]
        pages --> apiwrap
    end

    subgraph server["Backend — server/ (Node + Express)"]
        direction TB
        mw["Middleware<br/>requireAuth · requireActiveAccount · requireAdmin"]
        routes["Routes → Controllers (zod validation)"]
        services["Services (business logic)"]
        mw --> routes --> services
    end

    db[("MySQL<br/>schema.sql + migrations")]

    subgraph ingestion["Data Ingestion — ingestion/ (Python)"]
        ingest["ingest.py (yfinance)<br/>tickers.py / universe.py"]
    end

    subgraph external["External Services"]
        direction TB
        stripe["Stripe (test mode)"]
        yahoo["Yahoo Finance"]
        smtp["SMTP email"]
        ai["AI providers<br/>Gemini / OpenRouter"]
        notify["Twilio / Telegram"]
        oauth["Google / Microsoft OAuth"]
    end

    user -->|HTTPS| client
    admin -->|HTTPS| client
    apiwrap -->|"/api/* (Vite proxy in dev)"| mw

    services --> db
    services -->|checkout / portal| stripe
    stripe -->|webhooks| routes
    services -->|OTP / welcome mail| smtp
    services -->|analyze shortlist| ai
    services -->|alerts| notify
    services -->|sign-in| oauth

    services -->|"reseed (spawn)"| ingest
    ingest -->|fetch data| yahoo
    ingest -->|upsert| db
```

## Legend

- **Solid arrows** = calls / data flow in the direction shown.
- The **Vite dev server** proxies `/api/*` from the client to the Express API,
  so in development they share an origin (the session cookie flows
  transparently).
- The **Stripe webhook** is the one inbound external call — Stripe calls the API
  directly (`POST /api/subscription/webhook`), verified by signature, to keep
  `users.is_active` in sync on renewals/cancellations.
- **Ingestion** is normally run standalone, but an admin can trigger it via the
  API, which spawns `ingest.py` as a child process.
