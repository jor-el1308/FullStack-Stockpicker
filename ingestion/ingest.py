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
    and its caveats (not live-verified in this sandbox - Yahoo Finance is
    network-blocked here, so test this path yourself and watch the console
    output for the "[universe] example raw entry" debug line on first run).

Usage:
    cd ingestion
    python -m venv venv && source venv/bin/activate   # (or venv\\Scripts\\activate on Windows)
    pip install -r requirements.txt
    cp .env.example .env   # fill in DB credentials (same as server/.env)
    python ingest.py

This is intentionally a single flat script rather than a scheduled service -
good enough for a 2-week prototype. Each ticker is fetched and committed
independently so one bad/missing ticker doesn't roll back the rest of the
batch. Known limitations (worth calling out in the 7 May-style feedback
writeup):

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
"""
import sys
import time

import pandas as pd
import yfinance as yf

import config
import db
import universe
from tickers import EXCHANGES, TICKERS


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


def upsert_daily_prices(conn, t, history: pd.DataFrame):
    if history.empty:
        print(f"  [prices] no history returned for {t['yf_symbol']}")
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
    print(f"\n{t['exchange_code']}:{t['stock_code']} ({t['yf_symbol']})")
    yf_ticker = yf.Ticker(t["yf_symbol"])

    try:
        info = yf_ticker.info or {}
    except Exception as err:
        print(f"  could not fetch info: {err}")
        info = {}

    try:
        upsert_stock(conn, t, info)
    except Exception as err:
        print(f"  [stock] failed: {err}")
        conn.rollback()
        return  # nothing else can go in without the stock row existing (FK constraints)

    try:
        history = yf_ticker.history(period=config.PRICE_HISTORY_PERIOD)
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
    try:
        tickers, exchanges = get_ticker_list()
        upsert_exchanges(conn, exchanges)
        for t in tickers:
            ingest_one(conn, t)
            time.sleep(0.5)  # be polite to Yahoo's unofficial endpoints
    finally:
        conn.close()
    print("\nDone.")


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(f"Fatal error: {err}", file=sys.stderr)
        sys.exit(1)
