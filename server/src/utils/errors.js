/**
 * Shared 500-response helper. Logs the real error server-side but sends the
 * client a generic message instead of `err.message` - several controllers
 * used to return err.message directly, which can leak internal details
 * (SQL error text, file paths, library internals) to API callers. Mirrors
 * the pattern already used in screener.controller.js and ai.controller.js.
 *
 * @param {import("express").Response} res
 * @param {Error} err
 * @param {string} logPrefix e.g. "[auth] login"
 * @param {string} [publicMessage]
 */
export function sendInternalError(res, err, logPrefix, publicMessage = "Something went wrong. Please try again.") {
  console.error(`${logPrefix} failed:`, err.message);
  res.status(500).json({ success: false, error: { message: publicMessage } });
}
