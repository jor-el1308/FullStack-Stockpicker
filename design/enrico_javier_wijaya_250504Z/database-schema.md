# Database Schema — Dashboard & Stock Report

**Owner:** Enrico (Person 4)

My features (Dashboard results table, Stock Report page) are **read-only** consumers — they display data, they don't write it. The tables themselves are created and populated by Person 2's data pipeline (`server/src/db/schema.sql`, `ingestion/`). This document details the tables my two features read from: their fields, types, keys, and relationships. Column names below are the raw SQL names; the API aliases them to camelCase (e.g. `stock_name` → `stockName`).

## Tables my features read

| Table | Read by | Purpose for my features |
|---|---|---|
| `exchange` | Ticker / labels | Exchange code → currency |
| `stock` | Dashboard + Report | Identity: exchange, code, name |
| `daily_price` | Report | Closing-price chart, current price, day change |
| `market_cap` | Report + screener values | Latest market cap |
| `dividend` | Report | Latest declared dividend |
| `financials` | Report + screener values | Revenue / PBT / PAT / EBITA per year |

---

### `stock` — stock identity / lookup

The core lookup behind every result row and the report header (exchange, code, name).

| Column | Type | Null | Key | Notes |
|---|---|---|---|---|
| `exchange_code` | VARCHAR(16) | No | PK, FK → `exchange` | e.g. `SGX`, `NASDAQ` |
| `stock_code` | VARCHAR(32) | No | PK | e.g. `D05`, `AAPL` |
| `stock_name` | VARCHAR(255) | No | INDEX | Displayed in the table and report header |
| `sector` | VARCHAR(128) | Yes | | Used by the screener's sector exclusions |
| `listed_date` | DATE | Yes | | Drives the company-age (<5yo) exclusion |
| `is_active` | TINYINT(1) | No | | `1` = tradable / shown |
| `created_at` | TIMESTAMP | No | | Row insert time |
| `updated_at` | TIMESTAMP | No | | Auto-updates on change |

- **Primary key:** (`exchange_code`, `stock_code`) — a stock is unique per exchange (handles dual listings).
- **Foreign key:** `exchange_code` → `exchange(exchange_code)` `ON DELETE CASCADE`.

### `exchange` — reference data

| Column | Type | Null | Key | Notes |
|---|---|---|---|---|
| `exchange_code` | VARCHAR(16) | No | PK | e.g. `SGX` |
| `exchange_name` | VARCHAR(128) | No | | Full name |
| `country` | VARCHAR(64) | Yes | | |
| `currency` | VARCHAR(8) | No | | Currency for prices shown on the report |

### `daily_price` — OHLC time series

Source of the closing-price chart and the current-price / day-change figures on the report.

| Column | Type | Null | Key | Notes |
|---|---|---|---|---|
| `exchange_code` | VARCHAR(16) | No | PK, FK → `stock` | |
| `stock_code` | VARCHAR(32) | No | PK, FK → `stock` | |
| `price_date` | DATE | No | PK, INDEX | One row per trading day |
| `open` / `high` / `low` / `close` | DECIMAL(18,4) | No | | Chart uses `close` |
| `volume` | BIGINT | Yes | | |

- **Primary key:** (`exchange_code`, `stock_code`, `price_date`).
- **Foreign key:** (`exchange_code`, `stock_code`) → `stock` `ON DELETE CASCADE`.
- **Index:** `price_date`.

### `market_cap` — market cap history

Kept as a history table, so "latest" is the row with the max `as_of_date`. The report's Market Cap card reads the latest.

| Column | Type | Null | Key | Notes |
|---|---|---|---|---|
| `exchange_code` | VARCHAR(16) | No | PK, FK → `stock` | |
| `stock_code` | VARCHAR(32) | No | PK, FK → `stock` | |
| `as_of_date` | DATE | No | PK | Latest = max of this |
| `market_cap` | DECIMAL(24,2) | No | | In the exchange's currency |

### `dividend` — dividend per year (cents)

The report's Dividend card reads the most recent year.

| Column | Type | Null | Key | Notes |
|---|---|---|---|---|
| `exchange_code` | VARCHAR(16) | No | PK, FK → `stock` | |
| `stock_code` | VARCHAR(32) | No | PK, FK → `stock` | |
| `year` | SMALLINT | No | PK | Fiscal year |
| `dividend_cents` | DECIMAL(12,2) | No | | Cents per share |

### `financials` — revenue / PBT / PAT / EBITA per year

The report's Revenue and Revenue-Growth-YoY cards use the two most recent years.

| Column | Type | Null | Key | Notes |
|---|---|---|---|---|
| `exchange_code` | VARCHAR(16) | No | PK, FK → `stock` | |
| `stock_code` | VARCHAR(32) | No | PK, FK → `stock` | |
| `year` | SMALLINT | No | PK | Fiscal year |
| `revenue` | DECIMAL(24,2) | Yes | | |
| `profit_before_tax` | DECIMAL(24,2) | Yes | | |
| `profit_after_tax` | DECIMAL(24,2) | Yes | | |
| `ebita` | DECIMAL(24,2) | Yes | | |

---

## Relationships

```
exchange (1) ──< stock (1) ──< daily_price
                       │
                       ├──< market_cap
                       ├──< dividend
                       └──< financials
```

`exchange` has many `stock`; each `stock` has many `daily_price`, `market_cap`, `dividend`, and `financials` rows. Every child references `stock` on the composite (`exchange_code`, `stock_code`) key with `ON DELETE CASCADE`, so removing a stock cleans up all of its time-series and financial rows.

## Ownership note

I do not own or write to any of these tables — they belong to Person 2's data pipeline. This document covers them from my features' **read** perspective (which columns the Dashboard and Stock Report depend on) so my part of the design is self-contained. The full, system-wide ER diagram is the group's shared artefact in `design/er-diagram.md`.