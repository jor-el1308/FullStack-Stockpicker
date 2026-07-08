-- Sample data so the screener has a realistic universe to filter while
-- Person 2 builds out the live data pipeline (ingestion/).
-- Every active stock has market_cap + financials + dividend rows, since the
-- screener excludes stocks that are missing a filtered data point.
-- Includes deliberate edge cases to demo the default exclusions:
--   * GAMB / TOBC  -> excluded sectors (Gambling, Tobacco)
--   * NEWCO        -> listed < 5 years ago (company-age exclusion)
--   * LOSSY        -> negative earnings (negative P/E)
-- Run with: npm run db:seed --workspace=server
-- (seed.js already connects with the right database selected via DB_NAME -
-- no hardcoded USE statement needed here.)

INSERT IGNORE INTO exchange (exchange_code, exchange_name, country, currency) VALUES
  ('SGX', 'Singapore Exchange', 'Singapore', 'SGD'),
  ('NASDAQ', 'Nasdaq Stock Market', 'United States', 'USD'),
  ('NYSE', 'New York Stock Exchange', 'United States', 'USD');

INSERT IGNORE INTO stock (exchange_code, stock_code, stock_name, sector, listed_date, is_active) VALUES
  ('SGX', 'D05', 'DBS Group Holdings Ltd', 'Financials', '1999-06-25', 1),
  ('SGX', 'O39', 'Oversea-Chinese Banking Corp', 'Financials', '1970-01-01', 1),
  ('SGX', 'U11', 'United Overseas Bank Ltd', 'Financials', '1970-07-20', 1),
  ('SGX', 'Z74', 'Singtel Ltd', 'Telecommunications', '1993-11-01', 1),
  ('SGX', 'C6L', 'Singapore Airlines Ltd', 'Industrials', '1985-12-18', 1),
  ('SGX', 'G13', 'Genting Singapore Ltd', 'Gambling', '2005-12-12', 1),
  ('NASDAQ', 'AAPL', 'Apple Inc', 'Technology', '1980-12-12', 1),
  ('NASDAQ', 'MSFT', 'Microsoft Corp', 'Technology', '1986-03-13', 1),
  ('NASDAQ', 'GOOGL', 'Alphabet Inc', 'Technology', '2004-08-19', 1),
  ('NASDAQ', 'NEWCO', 'NewCo Robotics Inc', 'Technology', '2023-09-15', 1),
  ('NASDAQ', 'LOSSY', 'MoonShot Biotech Inc', 'Healthcare', '2015-04-01', 1),
  ('NYSE', 'KO', 'Coca-Cola Co', 'Consumer Staples', '1919-09-05', 1),
  ('NYSE', 'JNJ', 'Johnson & Johnson', 'Healthcare', '1944-09-25', 1),
  ('NYSE', 'XOM', 'Exxon Mobil Corp', 'Energy', '1920-03-01', 1),
  ('NYSE', 'PM', 'Philip Morris International', 'Tobacco', '2008-03-17', 1),
  ('NYSE', 'WMT', 'Walmart Inc', 'Consumer Staples', '1972-08-25', 1);

INSERT IGNORE INTO daily_price (exchange_code, stock_code, price_date, open, high, low, close, volume) VALUES
  ('SGX', 'D05', CURDATE(), 42.10, 42.55, 41.90, 42.30, 3200000),
  ('SGX', 'O39', CURDATE(), 16.80, 17.05, 16.72, 16.98, 5100000),
  ('SGX', 'U11', CURDATE(), 35.40, 35.90, 35.22, 35.75, 2400000),
  ('SGX', 'Z74', CURDATE(), 3.10, 3.16, 3.08, 3.14, 18500000),
  ('SGX', 'C6L', CURDATE(), 6.90, 7.02, 6.85, 6.95, 8700000),
  ('SGX', 'G13', CURDATE(), 0.92, 0.95, 0.91, 0.94, 22000000),
  ('NASDAQ', 'AAPL', CURDATE(), 208.50, 210.20, 207.80, 209.10, 45000000),
  ('NASDAQ', 'MSFT', CURDATE(), 448.00, 452.30, 446.10, 450.80, 21000000),
  ('NASDAQ', 'GOOGL', CURDATE(), 182.40, 184.10, 181.70, 183.60, 26000000),
  ('NASDAQ', 'NEWCO', CURDATE(), 14.20, 14.85, 13.95, 14.60, 900000),
  ('NASDAQ', 'LOSSY', CURDATE(), 6.40, 6.55, 6.10, 6.25, 1500000),
  ('NYSE', 'KO', CURDATE(), 62.10, 62.80, 61.90, 62.55, 12500000),
  ('NYSE', 'JNJ', CURDATE(), 151.20, 152.60, 150.80, 152.10, 7800000),
  ('NYSE', 'XOM', CURDATE(), 112.30, 113.50, 111.80, 113.10, 15200000),
  ('NYSE', 'PM', CURDATE(), 121.50, 122.40, 120.90, 122.00, 4600000),
  ('NYSE', 'WMT', CURDATE(), 94.10, 95.05, 93.80, 94.70, 16800000);

INSERT IGNORE INTO market_cap (exchange_code, stock_code, as_of_date, market_cap) VALUES
  ('SGX', 'D05', CURDATE(), 115000000000),
  ('SGX', 'O39', CURDATE(), 76000000000),
  ('SGX', 'U11', CURDATE(), 59000000000),
  ('SGX', 'Z74', CURDATE(), 52000000000),
  ('SGX', 'C6L', CURDATE(), 21000000000),
  ('SGX', 'G13', CURDATE(), 11000000000),
  ('NASDAQ', 'AAPL', CURDATE(), 3200000000000),
  ('NASDAQ', 'MSFT', CURDATE(), 3350000000000),
  ('NASDAQ', 'GOOGL', CURDATE(), 2250000000000),
  ('NASDAQ', 'NEWCO', CURDATE(), 1800000000),
  ('NASDAQ', 'LOSSY', CURDATE(), 950000000),
  ('NYSE', 'KO', CURDATE(), 270000000000),
  ('NYSE', 'JNJ', CURDATE(), 366000000000),
  ('NYSE', 'XOM', CURDATE(), 445000000000),
  ('NYSE', 'PM', CURDATE(), 189000000000),
  ('NYSE', 'WMT', CURDATE(), 760000000000);

INSERT IGNORE INTO dividend (exchange_code, stock_code, year, dividend_cents) VALUES
  ('SGX', 'D05', 2025, 220.00),
  ('SGX', 'O39', 2025, 86.00),
  ('SGX', 'U11', 2025, 180.00),
  ('SGX', 'Z74', 2025, 15.20),
  ('SGX', 'C6L', 2025, 48.00),
  ('SGX', 'G13', 2025, 4.00),
  ('NASDAQ', 'AAPL', 2025, 96.00),
  ('NASDAQ', 'MSFT', 2025, 332.00),
  ('NASDAQ', 'GOOGL', 2025, 80.00),
  ('NASDAQ', 'NEWCO', 2025, 0.00),
  ('NASDAQ', 'LOSSY', 2025, 0.00),
  ('NYSE', 'KO', 2025, 194.00),
  ('NYSE', 'JNJ', 2025, 496.00),
  ('NYSE', 'XOM', 2025, 396.00),
  ('NYSE', 'PM', 2025, 540.00),
  ('NYSE', 'WMT', 2025, 83.00);

INSERT IGNORE INTO financials (exchange_code, stock_code, year, revenue, profit_before_tax, profit_after_tax, ebita) VALUES
  ('SGX', 'D05', 2025, 20500000000, 11200000000, 9400000000, 12100000000),
  ('SGX', 'O39', 2025, 13700000000, 8300000000, 7000000000, 8900000000),
  ('SGX', 'U11', 2025, 14100000000, 7100000000, 6000000000, 7700000000),
  ('SGX', 'Z74', 2025, 14200000000, 2600000000, 2200000000, 4300000000),
  ('SGX', 'C6L', 2025, 19000000000, 3200000000, 2700000000, 4100000000),
  ('SGX', 'G13', 2025, 2500000000, 780000000, 610000000, 1050000000),
  ('NASDAQ', 'AAPL', 2025, 391000000000, 128000000000, 101000000000, 134000000000),
  ('NASDAQ', 'MSFT', 2025, 245000000000, 108000000000, 88000000000, 118000000000),
  ('NASDAQ', 'GOOGL', 2025, 350000000000, 112000000000, 94000000000, 123000000000),
  ('NASDAQ', 'NEWCO', 2025, 120000000, 8000000, 6000000, 15000000),
  ('NASDAQ', 'LOSSY', 2025, 45000000, -180000000, -180000000, -150000000),
  ('NYSE', 'KO', 2025, 47000000000, 12500000000, 10600000000, 14200000000),
  ('NYSE', 'JNJ', 2025, 88000000000, 21000000000, 17500000000, 26000000000),
  ('NYSE', 'XOM', 2025, 344000000000, 44000000000, 33500000000, 61000000000),
  ('NYSE', 'PM', 2025, 38000000000, 12800000000, 10500000000, 14800000000),
  ('NYSE', 'WMT', 2025, 681000000000, 26000000000, 19400000000, 36000000000);
