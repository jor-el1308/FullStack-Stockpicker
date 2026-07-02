-- Minimal sample data so Persons 3/4/5 can develop against something real
-- while Person 2 builds out the live data pipeline.
-- Run with: npm run db:seed --workspace=server

USE stockpicker;

INSERT IGNORE INTO exchange (exchange_code, exchange_name, country, currency) VALUES
  ('SGX', 'Singapore Exchange', 'Singapore', 'SGD'),
  ('NASDAQ', 'Nasdaq Stock Market', 'United States', 'USD');

INSERT IGNORE INTO stock (exchange_code, stock_code, stock_name, sector, listed_date, is_active) VALUES
  ('SGX', 'D05', 'DBS Group Holdings Ltd', 'Financials', '1999-06-25', 1),
  ('SGX', 'O39', 'Oversea-Chinese Banking Corp', 'Financials', '1970-01-01', 1),
  ('NASDAQ', 'AAPL', 'Apple Inc', 'Technology', '1980-12-12', 1),
  ('NASDAQ', 'MSFT', 'Microsoft Corp', 'Technology', '1986-03-13', 1);

INSERT IGNORE INTO daily_price (exchange_code, stock_code, price_date, open, high, low, close, volume) VALUES
  ('NASDAQ', 'AAPL', CURDATE(), 208.50, 210.20, 207.80, 209.10, 45000000),
  ('SGX', 'D05', CURDATE(), 42.10, 42.55, 41.90, 42.30, 3200000);

INSERT IGNORE INTO market_cap (exchange_code, stock_code, as_of_date, market_cap) VALUES
  ('NASDAQ', 'AAPL', CURDATE(), 3200000000000),
  ('SGX', 'D05', CURDATE(), 115000000000);

INSERT IGNORE INTO dividend (exchange_code, stock_code, year, dividend_cents) VALUES
  ('SGX', 'D05', 2025, 220.00),
  ('NASDAQ', 'AAPL', 2025, 96.00);

INSERT IGNORE INTO financials (exchange_code, stock_code, year, revenue, profit_before_tax, profit_after_tax, ebita) VALUES
  ('SGX', 'D05', 2025, 20500000000, 11200000000, 9400000000, 12100000000),
  ('NASDAQ', 'AAPL', 2025, 391000000000, 128000000000, 101000000000, 134000000000);
