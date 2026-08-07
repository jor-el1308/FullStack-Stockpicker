# Problem Statement

**Project:** FullStack-Stockpicker — a Stock Screener Application
**Type:** Group full-stack project

## The problem

Retail and student investors who want to pick stocks on **fundamentals** (not
hype) face a practical barrier: the raw data they need — market cap, P/E,
dividends, revenue, profit before/after tax, EBITA, 52-week range, closing
prices — is scattered across sources, formatted inconsistently, and tedious to
compare across many companies at once. Spreadsheets don't scale past a handful
of tickers, and most free tools either lock fundamental screening behind a
paywall or don't let the user express the multi-criteria, range-based filters
they actually reason with ("market cap over S$1B **and** P/E under 35 **and** a
dividend, excluding anything under 5 years old or in a sector I avoid").

## What we are building

A web application where a user defines selection criteria and the app scans a
stock database to return every matching stock, ranked, with per-stock detail.
Concretely, the system must let a user:

- **Filter by range across fundamental criteria** — market cap, P/E, dividend,
  revenue, profit before tax (PBT), profit after tax (PAT), EBITA, etc. — with
  sensible default values, a minimum company-age exclusion (e.g. exclude
  companies younger than 5 years), and sector exclusions (e.g. gambling,
  tobacco). Criteria can be weighted to rank results, not just filter them.
- **Browse results and drill into a stock** — a results table plus a per-stock
  report page showing the closing-price chart, 52-week high/low, and the key
  criteria values.
- **Get a qualitative AI take** — after screening, shortlist stocks and send
  them to an AI model for a qualitative analysis (recent context, growth
  outlook, reasoning) to complement the quantitative filter.
- **Track stocks over time** — a watchlist that shows pass/fail status against
  saved criteria, with alerts (Telegram / WhatsApp / email) when a stock drops
  out of criteria.
- **Manage access and accounts** — authentication (including social sign-in and
  a two-step email code at login), a subscription paywall so only paid,
  active accounts can use the screener, and an admin dashboard to manage users,
  view revenue, and refresh the underlying stock data.

The stock data itself is populated by a standalone ingestion pipeline that
pulls prices, market cap, dividends, and yearly financials from Yahoo Finance
into the database, and can be re-run on demand or on a schedule.

## Scope and constraints

- **Prototype scope.** Built as a two-week class prototype: correctness and a
  complete end-to-end flow over production hardening.
- **Data source.** Yahoo Finance (`yfinance`) — free and covers SGX + US
  tickers, but unofficial with no SLA. Known data caveats: EBITDA is used as a
  proxy for EBITA, IPO/listing dates are often unavailable (so the company-age
  exclusion is best-effort), and dividends are compared in local-currency cents
  rather than a single normalized currency.
- **Payments.** Stripe in **test mode only** — real Stripe infrastructure and
  real test cards, but nothing is actually charged. A monthly recurring
  subscription (S$9.99/month) gates access.
- **Not in scope.** Real-money payments, guaranteed data accuracy/SLA,
  dual-listed-stock de-duplication, and true cross-currency normalization are
  acknowledged open questions rather than delivered guarantees.

## Success criteria

A user can sign up, subscribe (test mode), define range-based criteria, run a
screen against real ingested data, open a stock's report, shortlist stocks for
an AI analysis, add stocks to a watchlist, and receive an alert — while an
admin can manage accounts and refresh the data — all running locally via a
single `docker-compose up`.
