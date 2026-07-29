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
# override=True: ingestion/.env must win over any same-named var already in
# the process environment. Without this, load_dotenv() leaves an existing
# os.environ value alone - and server/.env defines its own DB_HOST/DB_SSL_CA/
# etc. with different meanings (e.g. DB_SSL_CA is relative to a different
# directory). When ingest.py runs as a child process of the Node server
# (see server/src/services/ingestion.service.js's "Reseed live data"), Node's
# spawn() inherits the parent's environment, so the server's DB_SSL_CA was
# silently shadowing ingestion/.env's own value and pointing at a file that
# doesn't exist relative to ingestion/.
load_dotenv(ENV_PATH, override=True)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "stockpicker")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "stockpicker")

# Shared team database (optional) - same DB_SSL/DB_SSL_CA pattern as
# server/.env, for external managed hosts like Aiven that require TLS.
DB_SSL = os.getenv("DB_SSL", "false").lower() == "true"
DB_SSL_CA = os.getenv("DB_SSL_CA", "")
# DB_SSL_CA in .env is written relative to this ingestion/ directory (e.g.
# "../server/aiven-ca.pem") - resolve it against ENV_PATH's parent instead
# of leaving it relative to the process's current working directory. A
# relative path here used to break depending on *how* ingest.py was
# launched (bare `python ingest.py` from ingestion/ worked, but launching
# it as a child process from elsewhere - e.g. the admin dashboard's
# "Reseed live data" button - could resolve it against the wrong cwd and
# fail with FileNotFoundError when pymysql tried to load the CA file).
if DB_SSL_CA and not os.path.isabs(DB_SSL_CA):
    DB_SSL_CA = str((ENV_PATH.parent / DB_SSL_CA).resolve())

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
