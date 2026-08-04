export function determineWatchlistStatus(exchangeCode, stockCode, results = []) {
  const match = results.some(
    (row) => row.exchangeCode === exchangeCode && row.stockCode === stockCode
  );
  return match ? 'pass' : 'fail';
}
