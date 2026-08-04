/**
 * Owner: Person 5 (Jayden) - Notifications & Optional AI Step.
 * TODO: wire up to notifications.service.js. Watchlist alert checks
 * (does a stock still meet a saved criteria set) depend on Person 3's
 * screener logic and Person 2's data.
 */

import { randomUUID } from "node:crypto";
import { pool } from "../config/db.js";
import { sendWhatsAppMessage } from "../services/whatsapp.service.js";

const VALID_CHANNELS = new Set(["whatsapp", "telegram", "email"]);

export async function listWatchlist(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT w.id, w.exchange_code, w.stock_code, w.saved_criteria_set_id,
              w.channel, w.created_at, s.stock_name
       FROM watchlist w
       JOIN stock s ON s.exchange_code = w.exchange_code AND s.stock_code = w.stock_code
       WHERE w.user_id = ?
       ORDER BY w.created_at DESC`,
      [req.userId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("[notifications] listWatchlist failed:", err.message);
    res.status(500).json({ success: false, error: { message: "Failed to load watchlist" } });
  }
}

export async function addToWatchlist(req, res) {
  const { exchangeCode, stockCode, savedCriteriaSetId, channel, recipientNumber } = req.body;

  if (!exchangeCode || !stockCode) {
    return res.status(400).json({
      success: false,
      error: { message: "exchangeCode and stockCode are required" },
    });
  }

  const resolvedChannel = channel ?? "whatsapp";
  if (!VALID_CHANNELS.has(resolvedChannel)) {
    return res.status(400).json({
      success: false,
      error: { message: "channel must be 'whatsapp', 'telegram', or 'email'" },
    });
  }

  const id = randomUUID();

  try {
    await pool.query(
      `INSERT INTO watchlist (id, user_id, exchange_code, stock_code, saved_criteria_set_id, channel)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.userId, exchangeCode, stockCode, savedCriteriaSetId ?? null, resolvedChannel]
    );
  } catch (err) {
    // Most likely cause: exchangeCode/stockCode doesn't exist in `stock`,
    // or savedCriteriaSetId doesn't exist / isn't this user's - both are
    // FK constraint failures (MySQL error code ER_NO_REFERENCED_ROW_2).
    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,
        error: { message: "Unknown stock or saved criteria set" },
      });
    }
    console.error("[notifications] addToWatchlist failed:", err.message);
    return res.status(500).json({ success: false, error: { message: "Failed to add to watchlist" } });
  }

  // Best-effort WhatsApp confirmation. If a recipient number is supplied,
  // use that directly; otherwise skip the send so the watchlist row is still
  // saved even if no number is available yet.
  if (resolvedChannel === "whatsapp") {
    try {
      const targetNumber = recipientNumber?.trim() || null;
      if (targetNumber) {
        await sendWhatsAppMessage(
          targetNumber,
          `✅ You're now watching ${stockCode} (${exchangeCode}) on your watchlist.`
        );
      } else {
        console.warn("[notifications] No WhatsApp recipient number supplied for user", req.userId);
      }
    } catch (err) {
      console.error("[notifications] WhatsApp confirmation failed:", err.message);
    }
  }

  res.status(201).json({
    success: true,
    data: { id, exchangeCode, stockCode, savedCriteriaSetId: savedCriteriaSetId ?? null, channel: resolvedChannel },
  });
}

export async function removeFromWatchlist(req, res) {
  try {
    const [result] = await pool.query(
      "DELETE FROM watchlist WHERE id = ? AND user_id = ?",
      [req.params.id, req.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: { message: "Watchlist item not found" } });
    }

    res.status(204).send();
  } catch (err) {
    console.error("[notifications] removeFromWatchlist failed:", err.message);
    res.status(500).json({ success: false, error: { message: "Failed to remove from watchlist" } });
  }
}

/**
 * Out of scope for this pass - Person 5's optional AI step
 * (requirement doc section 6).
 */
export async function getAiRecommendation(_req, res) {
  res.status(501).json({ success: false, error: { message: "Not implemented: getAiRecommendation (optional feature)" } });
}
