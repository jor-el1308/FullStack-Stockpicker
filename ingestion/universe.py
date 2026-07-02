"""
Owner: Person 2 (Charles) - Data Collection & Database Design.

Dynamic stock universe discovery using yfinance's EquityQuery/screen(),
which hits Yahoo Finance's own screener backend directly (the same one
behind finance.yahoo.com's screener page). This replaces hand-maintaining
tickers.py with a criteria-based universe - e.g. "every US stock on
NASDAQ/NYSE above a market cap floor" - so scaling coverage is a config
change instead of a hand-picked list.

IMPORTANT CAVEATS (not live-verified against real Yahoo data - this
sandbox's network blocks Yahoo Finance, so this was written against the
documented API shape only):
  - screen()'s exact response field names (e.g. whether a quote's display
    name comes back as "longName" or "longname") could not be confirmed
    live. _to_ticker_entry() below checks multiple common key variants
    defensively, and main() in ingest.py prints one raw quote dict so you
    can sanity-check the actual shape on first run.
  - screen() only returns current-snapshot data (market cap, sector, etc.),
    not historical price series - ingest.py still calls .history() per
    ticker for OHLC, so this doesn't remove that per-ticker cost, only the
    cost of *discovering* which tickers to bother with.
  - Yahoo caps results at 250 per call; discover_universe() paginates via
    `offset` up to MAX_STOCKS_PER_EXCHANGE (see config.py).
  - Same unofficial-API caveat as the rest of this pipeline applies here
    too - no SLA, could change without notice.
"""
import time

import yfinance as yf
from yfinance import EquityQuery

import config

# Yahoo's internal exchange codes (see EquityQuery valid_values['exchange'])
# mapped to our schema's exchange_code (server/src/db/schema.sql `exchange`
# table primary key). Exchanges not listed here are skipped by
# _to_ticker_entry() - extend this map if you want to cover more.
YAHOO_EXCHANGE_MAP = {
    "NMS": "NASDAQ",  # Nasdaq Global Select Market
    "NGM": "NASDAQ",  # Nasdaq Global Market
    "NCM": "NASDAQ",  # Nasdaq Capital Market
    "NYQ": "NYSE",
    "ASE": "NYSE",  # NYSE American - folded into NYSE for our schema
    "SES": "SGX",
}

YAHOO_TO_OUR_EXCHANGE_META = {
    "NASDAQ": {"exchange_name": "Nasdaq Stock Market", "country": "United States", "currency": "USD"},
    "NYSE": {"exchange_name": "New York Stock Exchange", "country": "United States", "currency": "USD"},
    "SGX": {"exchange_name": "Singapore Exchange", "country": "Singapore", "currency": "SGD"},
}

PAGE_SIZE_CAP = 250  # Yahoo's hard max per screen() call


def _run_screen(query, max_results):
    """Paginate a yf.screen() query up to max_results (Yahoo caps each page at 250)."""
    results = []
    offset = 0
    while len(results) < max_results:
        page_size = min(PAGE_SIZE_CAP, max_results - len(results))
        response = yf.screen(query, offset=offset, size=page_size, sortField="intradaymarketcap", sortAsc=False)
        quotes = response.get("quotes") or []
        if not quotes:
            break
        results.extend(quotes)
        offset += len(quotes)
        if len(quotes) < page_size:
            break  # fewer results than requested page = no more pages
        time.sleep(0.5)  # be polite between pages
    return results[:max_results]


def _first(d, *keys, default=None):
    for k in keys:
        if d.get(k) not in (None, ""):
            return d.get(k)
    return default


def _to_ticker_entry(quote):
    yahoo_exchange = _first(quote, "exchange", "fullExchangeName")
    exchange_code = YAHOO_EXCHANGE_MAP.get(yahoo_exchange)
    if not exchange_code:
        return None  # exchange we haven't mapped/don't support yet

    symbol = _first(quote, "symbol")
    if not symbol:
        return None

    stock_code = symbol.split(".")[0]  # strips ".SI" etc for exchange-suffixed tickers
    stock_name = _first(quote, "longName", "longname", "shortName", "shortname", default=stock_code)

    return {
        "yf_symbol": symbol,
        "exchange_code": exchange_code,
        "stock_code": stock_code,
        "stock_name": stock_name,
    }


def discover_us_universe():
    query = EquityQuery(
        "and",
        [
            EquityQuery("is-in", ["exchange", "NMS", "NYQ"]),
            EquityQuery("gte", ["intradaymarketcap", config.US_MARKET_CAP_FLOOR]),
        ],
    )
    quotes = _run_screen(query, config.MAX_STOCKS_PER_EXCHANGE)
    print(f"  [universe] US screen returned {len(quotes)} raw quotes (market cap >= {config.US_MARKET_CAP_FLOOR:,})")
    return [e for e in (_to_ticker_entry(q) for q in quotes) if e]


def discover_sgx_universe():
    query = EquityQuery(
        "and",
        [
            EquityQuery("eq", ["region", "sg"]),
            EquityQuery("gte", ["intradaymarketcap", config.SGX_MARKET_CAP_FLOOR]),
        ],
    )
    quotes = _run_screen(query, config.MAX_STOCKS_PER_EXCHANGE)
    print(f"  [universe] SGX screen returned {len(quotes)} raw quotes (market cap >= {config.SGX_MARKET_CAP_FLOOR:,})")
    return [e for e in (_to_ticker_entry(q) for q in quotes) if e]


def discover_exchanges(entries):
    """Build the `exchange` table rows needed for whatever exchanges discover_universe() actually returned."""
    codes = {e["exchange_code"] for e in entries}
    exchanges = []
    for code in codes:
        meta = YAHOO_TO_OUR_EXCHANGE_META.get(code)
        if meta:
            exchanges.append({"exchange_code": code, **meta})
    return exchanges


def discover_universe():
    """Combined SGX + US universe, deduplicated by (exchange_code, stock_code)."""
    entries = discover_sgx_universe() + discover_us_universe()
    seen = set()
    deduped = []
    for e in entries:
        key = (e["exchange_code"], e["stock_code"])
        if key not in seen:
            seen.add(key)
            deduped.append(e)
    return deduped
