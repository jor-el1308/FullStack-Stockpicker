"""
Owner: Person 2 (Charles) - Data Collection & Database Design.

Loads DB connection settings and ingestion options from ingestion/.env
(copy ingestion/.env.example -> ingestion/.env and fill in your local
MySQL credentials - same values as server/.env).
"""
import os
from pathlib import Path

from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "stockpicker")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "stockpicker")

# yfinance history period string: "1y", "2y", "5y", "max", etc.
PRICE_HISTORY_PERIOD = os.getenv("PRICE_HISTORY_PERIOD", "2y")

# --- Dynamic universe discovery (ingestion/universe.py) ---
# Set to "true" to discover the stock list via yfinance EquityQuery/screen()
# instead of the fixed list in tickers.py.
USE_DYNAMIC_UNIVERSE = os.getenv("USE_DYNAMIC_UNIVERSE", "false").lower() == "true"

# Market cap floors used to filter the discovered universe (raw currency
# units, not millions/billions - e.g. 10_000_000_000 = $10B).
US_MARKET_CAP_FLOOR = int(os.getenv("US_MARKET_CAP_FLOOR", "10000000000"))
SGX_MARKET_CAP_FLOOR = int(os.getenv("SGX_MARKET_CAP_FLOOR", "500000000"))

# Cap on how many stocks to pull per exchange group (US, SGX) - keep this
# modest for a prototype; raising it increases both runtime and the risk
# of Yahoo throttling the unofficial API.
MAX_STOCKS_PER_EXCHANGE = int(os.getenv("MAX_STOCKS_PER_EXCHANGE", "50"))
