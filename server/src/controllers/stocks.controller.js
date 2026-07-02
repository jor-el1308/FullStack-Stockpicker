import * as stockLookupService from "../services/stockLookup.service.js";

/**
 * Owner: Person 2 (Charles) - Data Collection & Database Design.
 */

export async function lookupStocks(req, res) {
  const query = String(req.query.q ?? "");
  try {
    const results = await stockLookupService.searchStocks(query);
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

export async function getStockDetail(req, res) {
  const { exchangeCode, stockCode } = req.params;
  try {
    const detail = await stockLookupService.getStockDetail(exchangeCode, stockCode);
    if (!detail) {
      return res.status(404).json({ success: false, error: { message: "Stock not found" } });
    }
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

export async function getDailyPrices(req, res) {
  const { exchangeCode, stockCode } = req.params;
  try {
    const prices = await stockLookupService.getDailyPrices(exchangeCode, stockCode);
    res.json({ success: true, data: prices });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}

export async function getFinancials(req, res) {
  const { exchangeCode, stockCode } = req.params;
  try {
    const financials = await stockLookupService.getFinancials(exchangeCode, stockCode);
    res.json({ success: true, data: financials });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
}
