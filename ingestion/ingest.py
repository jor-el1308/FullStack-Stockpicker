"""
Owner: Person 2 (Charles) - Data Collection & Database Design.

Prototype data-ingestion pipeline: pulls OHLC, market cap, dividends, and
yearly financials from Yahoo Finance (via the `yfinance` package) and
upserts everything into the MySQL schema defined in server/src/db/schema.sql.

The stock list comes from one of two places:
  - tickers.py's fixed 15-stock list (default), or
  - a dynamic, criteria-based universe via yfinance EquityQuery/screen()
    (see universe.py) when USE_DYNAMIC_UNIVERSE=true in ingestion/.env -
    e.g. "every US stock on NASDAQ/NYSE above a market cap floor" instead
    of a hand-picked list. See universe.py's docstring for how that works
    and its caveats.

Usage:
    cd ingestion
    python -m venv venv && source venv/bin/activate   # (or venv\\Scripts\\activate on Windows)
    pip install -r requirements.txt
    cp .env.example .env   # fill in DB credentials (same as server/.env)
    python ingest.py

This is intentionally a single flat script rather than a scheduled service -
good enough for a 2-week prototype. Each ticker is fetched and committed
independently (5 small commits per ticker rather than 1 big one) so one
bad/missing data category doesn't throw away everything else already
fetched for that stock - deliberate given how often the free API is
missing individual fields. Known limitations (worth calling out in the
7 May-style feedback writeup):

  - Yahoo Finance is an unofficial/free API with no SLA - fine for a
    prototype, not something to rely on in production.
  - yfinance exposes EBITDA, not EBITA. We store EBITDA into the `ebita`
    column as the closest available proxy - flag this as an open question
    for the team (do we want a true EBITA calculation later?).
  - yfinance doesn't reliably expose IPO/listing date, so `listed_date`
    is left NULL. The company-age (<5yo) exclusion Person 3 needs will
    require sourcing this separately (or hardcoding for the prototype set).
  - Dividends are summed per calendar year in the stock's local currency
    and converted to cents by multiplying by 100 - for SGX stocks that's
    Singapore cents, for US stocks that's US cents. Not a true apples-to-
    apples comparison across currencies; flagged as an open question too.

PERFORMANCE NOTE: daily price fetching is incremental - see
get_latest_price_date() below. On the first run for a stock we pull the
full PRICE_HISTORY_PERIOD backfill; on every re-run after that we only
fetch days newer than what's already stored, instead of re-pulling and
re-upserting the full window every time. This matters for running this
daily without wasting API calls against Yahoo's rate limits or redoing
DB writes for data that hasn't changed.
"""
import sys
import time
from datetime import timedelta

import pandas as pd
import yfinance as yf

import config
import db
import universe
from tickers import EXCHANGES, TICKERS


def fetch_with_retry(fn, *, what, retries=3, backoff_seconds=2.0):
    """Runs `fn()`, retrying on failure with exponential backoff. Yahoo's
    unofficial API occasionally throttles/blips - without this, a single
    transient network error or 429 was treated the same as a permanent
    failure and the data for that call was just dropped.
    """
    for attempt in range(1, retries + 1):
        try:
            return fn()
        except Exception as err:
            if attempt == retries:
                raise
            wait = backoff_seconds * (2 ** (attempt - 1))
            print(f"  [retry] {what} failed (attempt {attempt}/{retries}): {err} - retrying in {wait:.0f}s")
            time.sleep(wait)


def upsert_exchanges(conn, exchanges=None):
    with conn.cursor() as cur:
        for ex in (exchanges if exchanges is not None else EXCHANGES):
            cur.execute(
                """
                INSERT INTO exchange (exchange_code, exchange_name, country, currency)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    exchange_name = VALUES(exchange_name),
                    country = VALUES(country),
                    currency = VALUES(currency)
                """,
                (ex["exchange_code"], ex["exchange_name"], ex["country"], ex["currency"]),
            )
    conn.commit()


def upsert_stock(conn, t, info):
    stock_name = info.get("longName") or info.get("shortName") or t["stock_name"]
    sector = info.get("sector")
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO stock (exchange_code, stock_code, stock_name, sector, is_active)
            VALUES (%s, %s, %s, %s, 1)
            ON DUPLICATE KEY UPDATE
                stock_name = VALUES(stock_name),
                sector = VALUES(sector),
                is_active = 1
            """,
            (t["exchange_code"], t["stock_code"], stock_name, sector),
        )
    conn.commit()


def get_latest_price_date(conn, t):
    """Returns the most recent price_date already stored for this stock (a
    datetime.date), or None if we've never fetched prices for it. Used to
    make daily_price fetching incremental instead of re-pulling the full
    lookback window on every run."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT MAX(price_date) FROM daily_price WHERE exchange_code = %s AND stock_code = %s",
            (t["exchange_code"], t["stock_code"]),
        )
        (latest,) = cur.fetchone()
    return latest


def fetch_price_history(t, yf_ticker, latest_date):
    """Full backfill on first run, incremental fetch (only new days) after that."""
    if latest_date is None:
        print(f"  [prices] no existing data - full backfill ({config.PRICE_HISTORY_PERIOD})")
        return yf_ticker.history(period=config.PRICE_HISTORY_PERIOD)

    start = latest_date + timedelta(days=1)
    print(f"  [prices] incremental fetch from {start} (already have through {latest_date})")
    return yf_ticker.history(start=start.strftime("%Y-%m-%d"))


def upsert_daily_prices(conn, t, history: pd.DataFrame):
    if history.empty:
        print(f"  [prices] no new rows for {t['yf_symbol']}")
        return
    rows = []
    for ts, row in history.iterrows():
        if any(pd.isna(row.get(col)) for col in ("Open", "High", "Low", "Close")):
            continue
        rows.append(
            (
                t["exchange_code"],
                t["stock_code"],
                ts.strftime("%Y-%m-%d"),
                float(row["Open"]),
                float(row["High"]),
                float(row["Low"]),
                float(row["Close"]),
                int(row["Volume"]) if not pd.isna(row.get("Volume")) else None,
            )
        )
    if not rows:
        return
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO daily_price (exchange_code, stock_code, price_date, open, high, low, close, volume)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                open = VALUES(open), high = VALUES(high), low = VALUES(low),
                close = VALUES(close), volume = VALUES(volume)
            """,
            rows,
        )
    conn.commit()
    print(f"  [prices] upserted {len(rows)} rows")


def upsert_market_cap(conn, t, info):
    market_cap = info.get("marketCap")
    if not market_cap:
        print(f"  [market_cap] no marketCap in info for {t['yf_symbol']}")
        return
    today = time.strftime("%Y-%m-%d")
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO market_cap (exchange_code, stock_code, as_of_date, market_cap)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE market_cap = VALUES(market_cap)
            """,
            (t["exchange_code"], t["stock_code"], today, market_cap),
        )
    conn.commit()
    print(f"  [market_cap] {market_cap:,}")


def upsert_dividends(conn, t, dividends: pd.Series):
    if dividends is None or dividends.empty:
        print(f"  [dividends] none for {t['yf_symbol']}")
        return
    by_year = dividends.groupby(dividends.index.year).sum()
    rows = [(t["exchange_code"], t["stock_code"], int(year), float(total) * 100) for year, total in by_year.items()]
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO dividend (exchange_code, stock_code, year, dividend_cents)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE dividend_cents = VALUES(dividend_cents)
            """,
            rows,
        )
    conn.commit()
    print(f"  [dividends] upserted {len(rows)} years")


def _get_row(stmt: pd.DataFrame, *labels):
    """Return the first matching row label found in the statement, else None."""
    for label in labels:
        if stmt is not None and label in stmt.index:
            return stmt.loc[label]
    return None


def upsert_financials(conn, t, yf_ticker: yf.Ticker):
    try:
        stmt = yf_ticker.income_stmt
    except Exception as err:  # yfinance's financials API changes fairly often
        print(f"  [financials] could not fetch income_stmt for {t['yf_symbol']}: {err}")
        return

    if stmt is None or stmt.empty:
        print(f"  [financials] no income statement for {t['yf_symbol']}")
        return

    revenue_row = _get_row(stmt, "Total Revenue")
    pbt_row = _get_row(stmt, "Pretax Income")
    pat_row = _get_row(stmt, "Net Income")
    # yfinance exposes EBITDA, not EBITA - used as the closest proxy (see module docstring).
    ebitda_row = _get_row(stmt, "EBITDA", "Normalized EBITDA")

    rows = []
    for col in stmt.columns:
        year = col.year
        revenue = revenue_row.get(col) if revenue_row is not None else None
        pbt = pbt_row.get(col) if pbt_row is not None else None
        pat = pat_row.get(col) if pat_row is not None else None
        ebita = ebitda_row.get(col) if ebitda_row is not None else None

        if all(v is None or pd.isna(v) for v in (revenue, pbt, pat, ebita)):
            continue

        rows.append(
            (
                t["exchange_code"],
                t["stock_code"],
                int(year),
                None if revenue is None or pd.isna(revenue) else float(revenue),
                None if pbt is None or pd.isna(pbt) else float(pbt),
                None if pat is None or pd.isna(pat) else float(pat),
                None if ebita is None or pd.isna(ebita) else float(ebita),
            )
        )

    if not rows:
        print(f"  [financials] no usable rows for {t['yf_symbol']}")
        return

    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO financials (exchange_code, stock_code, year, revenue, profit_before_tax, profit_after_tax, ebita)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                revenue = VALUES(revenue),
                profit_before_tax = VALUES(profit_before_tax),
                profit_after_tax = VALUES(profit_after_tax),
                ebita = VALUES(ebita)
            """,
            rows,
        )
    conn.commit()
    print(f"  [financials] upserted {len(rows)} years")


def ingest_one(conn, t):
    """Returns True if the stock's core row was written (the minimum needed
    for this ticker to count as "processed"), False otherwise. Each
    sub-category below (prices/market_cap/dividends/financials) is still
    best-effort past that point - a stock with a written row but a failed
    sub-category is still True here (partial data beats none for a free,
    field-flaky API), but nothing gets counted as a "success" without at
    least its core stock row existing."""
    print(f"\n{t['exchange_code']}:{t['stock_code']} ({t['yf_symbol']})")
    yf_ticker = yf.Ticker(t["yf_symbol"])

    try:
        info = fetch_with_retry(lambda: yf_ticker.info or {}, what=f"info fetch for {t['yf_symbol']}")
    except Exception as err:
        print(f"  could not fetch info: {err}")
        info = {}

    try:
        upsert_stock(conn, t, info)
    except Exception as err:
        print(f"  [stock] failed: {err}")
        conn.rollback()
        return False  # nothing else can go in without the stock row existing (FK constraints)

    try:
        latest_date = get_latest_price_date(conn, t)
        history = fetch_with_retry(
            lambda: fetch_price_history(t, yf_ticker, latest_date), what=f"price history for {t['yf_symbol']}"
        )
        upsert_daily_prices(conn, t, history)
    except Exception as err:
        print(f"  [prices] failed: {err}")
        conn.rollback()

    try:
        upsert_market_cap(conn, t, info)
    except Exception as err:
        print(f"  [market_cap] failed: {err}")
        conn.rollback()

    try:
        upsert_dividends(conn, t, yf_ticker.dividends)
    except Exception as err:
        print(f"  [dividends] failed: {err}")
        conn.rollback()

    try:
        upsert_financials(conn, t, yf_ticker)
    except Exception as err:
        print(f"  [financials] failed: {err}")
        conn.rollback()

    return True


def get_ticker_list():
    """Returns (ticker_entries, exchange_rows). Falls back to the static
    tickers.py list if dynamic discovery is off or comes back empty."""
    if not config.USE_DYNAMIC_UNIVERSE:
        return TICKERS, EXCHANGES

    print("USE_DYNAMIC_UNIVERSE=true - discovering stock list via yfinance EquityQuery/screen() ...")
    try:
        discovered = universe.discover_universe()
    except Exception as err:
        print(f"  [universe] discovery failed ({err}); falling back to static tickers.py list")
        return TICKERS, EXCHANGES

    if not discovered:
        print("  [universe] discovery returned 0 stocks; falling back to static tickers.py list")
        return TICKERS, EXCHANGES

    print(f"  [universe] discovered {len(discovered)} stocks total")
    print(f"  [universe] example raw entry: {discovered[0]}")
    return discovered, universe.discover_exchanges(discovered)


def main():
    conn = db.get_connection()
    succeeded = 0
    failed = 0
    try:
        tickers, exchanges = get_ticker_list()
        upsert_exchanges(conn, exchanges)
        for t in tickers:
            try:
                # Keep-alive/reconnect: this loop can run long enough (dozens
                # to hundreds of tickers) that a MySQL wait_timeout or a
                # transient network blip would otherwise kill the whole
                # remaining run with an unhandled exception. ping(reconnect=True)
                # transparently reconnects if the connection dropped.
                conn.ping(reconnect=True)
                ok = ingest_one(conn, t)
                if ok:
                    succeeded += 1
                else:
                    failed += 1
            except Exception as err:
                failed += 1
                print(f"  [ticker] unexpected failure for {t['yf_symbol']}: {err}")
            time.sleep(0.5)  # be polite to Yahoo's unofficial endpoints
    finally:
        conn.close()
    print(f"\nDone. {succeeded} stocks processed, {failed} failed outright.")


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(f"Fatal error: {err}", file=sys.stderr)
        sys.exit(1)
