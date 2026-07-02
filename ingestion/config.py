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
