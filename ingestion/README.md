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

By default this fetches data for the fixed 15-stock list in `tickers.py`
(5 SGX + 10 US, spanning NASDAQ and NYSE) and upserts into `exchange`,
`stock`, `daily_price`, `market_cap`, `dividend`, and `financials`. It's
safe to re-run - every insert is `ON DUPLICATE KEY UPDATE`, so running it
daily just refreshes the data.

To prototype with a different fixed set of stocks, edit `TICKERS` in
`tickers.py`. The `yf_symbol` needs to be whatever Yahoo Finance expects
(SGX tickers need a `.SI` suffix, e.g. `D05.SI`); `exchange_code` /
`stock_code` are how that same stock is identified in our schema.

## Dynamic universe (optional, replaces the fixed ticker list)

Set `USE_DYNAMIC_UNIVERSE=true` in `ingestion/.env` to discover the stock
list via yfinance's `EquityQuery`/`screen()` instead - this hits Yahoo's
own screener backend directly (the same one behind finance.yahoo.com's
screener page), so you can say "every US stock on NASDAQ/NYSE above a
market cap floor" instead of hand-picking tickers. See `universe.py` for
the implementation.

Relevant `.env` settings:

```
USE_DYNAMIC_UNIVERSE=true
US_MARKET_CAP_FLOOR=10000000000     # $10B - large caps only, keeps result count sane
SGX_MARKET_CAP_FLOOR=500000000      # SGD 500M
MAX_STOCKS_PER_EXCHANGE=50          # cap per exchange group (US, SGX)
```

**This path has not been live-tested** - the sandbox this was built in
blocks network access to Yahoo Finance, so `universe.py` was written
directly against the documented API shape, not verified against a real
response. When you run it, watch the console for a
`[universe] example raw entry: {...}` debug line on first run - if the
discovered stocks come back with missing names or get skipped entirely,
that's the first place to look (Yahoo's response field names may differ
slightly from what `_to_ticker_entry()` in `universe.py` expects).

What it does and doesn't solve for going beyond ~15 stocks:
- **Helps**: one `screen()` call returns up to 250 matching tickers with
  current snapshot data, versus one-by-one `.info` calls - much cheaper
  than fetching everything just to filter it yourself.
- **Doesn't help**: `screen()` only returns current-snapshot fields, not
  historical price series - `ingest.py` still calls `.history()` once per
  discovered ticker for OHLC, so total runtime still scales with however
  many stocks the screen returns. Keep `MAX_STOCKS_PER_EXCHANGE` modest.
- **No EBITA/EBIT/PBT field or listing-date field** in the screener
  either - same gaps as the per-ticker approach below.

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
- **Rate limits** - fine for 15 tickers; scaling up (via the dynamic
  universe above or a longer `tickers.py`) increases both runtime and the
  risk of Yahoo throttling the unofficial API - add longer delays or batch
  overnight if you go much beyond ~50-100 stocks.
