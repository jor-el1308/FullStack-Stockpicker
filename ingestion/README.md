# Data ingestion (Person 2 - Charles)

Standalone Python pipeline that pulls stock data from Yahoo Finance (via the
`yfinance` package) and loads it into the MySQL schema used by the rest of
the app (`server/src/db/schema.sql`). This runs separately from the Node
API - the API only *reads* from MySQL; this script is what *writes* to it.

## Setup

```bash
cd ingestion
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env - same DB_HOST/DB_USER/DB_PASSWORD/DB_NAME as server/.env
```

Make sure the schema has already been migrated first:

```bash
npm run db:migrate --workspace=server
```

## Run

```bash
python ingest.py
```

This fetches data for the fixed 15-stock list in `tickers.py` (5 SGX + 10
US, spanning NASDAQ and NYSE) and upserts into `exchange`, `stock`,
`daily_price`, `market_cap`, `dividend`, and `financials`. It's safe to
re-run - every insert is `ON DUPLICATE KEY UPDATE`, so running it daily
just refreshes the data.

To prototype with a different set of stocks, edit `TICKERS` in
`tickers.py`. The `yf_symbol` needs to be whatever Yahoo Finance expects
(SGX tickers need a `.SI` suffix, e.g. `D05.SI`); `exchange_code` /
`stock_code` are how that same stock is identified in our schema.

## Known limitations (for the data-collection feedback writeup)

- **Yahoo Finance is unofficial** - no SLA, no official support, and the
  `yfinance` library's scraping target changes occasionally. Fine for a
  prototype; would need a paid provider (Alpha Vantage/FMP) for anything
  production-facing.
- **EBITA vs EBITDA** - yfinance exposes EBITDA, not EBITA. We store
  EBITDA as the closest available proxy. Worth deciding as a team whether
  that's good enough or whether EBITA needs to be computed separately
  (EBITDA minus depreciation).
- **No listed/IPO date** - `listed_date` is left NULL, so Person 3's
  company-age (<5yo) exclusion can't be evaluated from this data alone yet.
- **Dividend currency** - dividends are summed per year and converted to
  cents by multiplying by 100, but SGX dividends are in SGD and US
  dividends are in USD - the "cents" aren't directly comparable across
  exchanges without an FX conversion step.
- **Rate limits** - fine for 15 tickers; if the stock list grows
  significantly, add longer delays between requests or batch overnight.
