"""
Owner: Person 2 (Charles) - Data Collection & Database Design.

Default prototype stock list: a small, fixed set of well-known names
spanning SGX and two US exchanges, so the prototype can demo dual-exchange
filtering (one of the open questions from the requirement doc) without
ingesting the whole market.

Each entry maps:
  - yf_symbol: the ticker string yfinance expects (SGX names need the
    ".SI" suffix; US names are just the plain ticker)
  - exchange_code / stock_code: how the stock is identified in our schema
    (server/src/db/schema.sql -> `stock` table primary key)
  - stock_name: fallback display name if yfinance doesn't return one
"""

EXCHANGES = [
    {"exchange_code": "SGX", "exchange_name": "Singapore Exchange", "country": "Singapore", "currency": "SGD"},
    {"exchange_code": "NASDAQ", "exchange_name": "Nasdaq Stock Market", "country": "United States", "currency": "USD"},
    {"exchange_code": "NYSE", "exchange_name": "New York Stock Exchange", "country": "United States", "currency": "USD"},
]

TICKERS = [
    # --- SGX ---
    {"yf_symbol": "D05.SI", "exchange_code": "SGX", "stock_code": "D05", "stock_name": "DBS Group Holdings Ltd"},
    {"yf_symbol": "O39.SI", "exchange_code": "SGX", "stock_code": "O39", "stock_name": "Oversea-Chinese Banking Corp"},
    {"yf_symbol": "U11.SI", "exchange_code": "SGX", "stock_code": "U11", "stock_name": "United Overseas Bank Ltd"},
    {"yf_symbol": "C6L.SI", "exchange_code": "SGX", "stock_code": "C6L", "stock_name": "Singapore Airlines Ltd"},
    {"yf_symbol": "Z74.SI", "exchange_code": "SGX", "stock_code": "Z74", "stock_name": "Singapore Telecommunications Ltd"},
    # --- NASDAQ ---
    {"yf_symbol": "AAPL", "exchange_code": "NASDAQ", "stock_code": "AAPL", "stock_name": "Apple Inc"},
    {"yf_symbol": "MSFT", "exchange_code": "NASDAQ", "stock_code": "MSFT", "stock_name": "Microsoft Corp"},
    {"yf_symbol": "GOOGL", "exchange_code": "NASDAQ", "stock_code": "GOOGL", "stock_name": "Alphabet Inc"},
    {"yf_symbol": "AMZN", "exchange_code": "NASDAQ", "stock_code": "AMZN", "stock_name": "Amazon.com Inc"},
    {"yf_symbol": "TSLA", "exchange_code": "NASDAQ", "stock_code": "TSLA", "stock_name": "Tesla Inc"},
    {"yf_symbol": "NVDA", "exchange_code": "NASDAQ", "stock_code": "NVDA", "stock_name": "NVIDIA Corp"},
    {"yf_symbol": "META", "exchange_code": "NASDAQ", "stock_code": "META", "stock_name": "Meta Platforms Inc"},
    # --- NYSE ---
    {"yf_symbol": "JPM", "exchange_code": "NYSE", "stock_code": "JPM", "stock_name": "JPMorgan Chase & Co"},
    {"yf_symbol": "KO", "exchange_code": "NYSE", "stock_code": "KO", "stock_name": "Coca-Cola Co"},
    {"yf_symbol": "DIS", "exchange_code": "NYSE", "stock_code": "DIS", "stock_name": "Walt Disney Co"},
]
