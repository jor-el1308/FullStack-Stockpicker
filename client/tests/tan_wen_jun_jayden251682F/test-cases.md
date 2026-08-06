# Test Cases — Watchlist & Notifications (Person 5)

**Framework:** Vitest. **Total: 15 tests, all passing** (10 server + 5 client).

## How to run

```
# server (Twilio WhatsApp service)
cd server && npm install && npm test

# client (watchlist status util)
cd client && npm install && npm test
```

Test files: `server/tests/<name>/whatsapp.service.test.js` and `client/tests/<name>/watchlistStatus.test.js`.

---

## Server — `whatsapp.service.test.js` (10 tests)

No real Twilio calls: the dry-run path returns before any network call, and the misconfiguration case throws before a client is created.

| # | Test | Expected outcome |
|---|---|---|
| 1 | `normalizeWhatsAppRecipient` prefixes a bare number | `+65…` → `whatsapp:+65…` |
| 2 | leaves an already-prefixed number unchanged | `whatsapp:+65…` stays as-is |
| 3 | trims whitespace before prefixing | `"  +65…  "` → `whatsapp:+65…` |
| 4 | handles null/undefined input | returns `whatsapp:` |
| 5 | `resolveWhatsAppSender` returns the configured sender, trimmed | env value returned without spaces |
| 6 | returns empty string when sender unset | `""` |
| 7 | `buildWatchlistAlertText` phrases an 'above' condition | text contains "risen above", symbol, target, current price |
| 8 | phrases a 'below' condition | text contains "fallen below" and the symbol |
| 9 | `sendWhatsAppMessage` throws when `TWILIO_WHATSAPP_FROM` unset | rejects with "TWILIO_WHATSAPP_FROM is not set" |
| 10 | dry-run returns without calling Twilio | returns `{ sid: "dry-run", status: "queued" }` and logs the payload |

## Client — `watchlistStatus.test.js` (5 tests)

`determineWatchlistStatus(exchangeCode, stockCode, results)` — a watchlisted stock "passes" if it appears in the latest screener results for its saved criteria, else "fails".

| # | Test | Expected outcome |
|---|---|---|
| 1 | stock is in the results | `"pass"` |
| 2 | stock not in the results | `"fail"` |
| 3 | empty results list | `"fail"` |
| 4 | results omitted entirely (defaults to `[]`) | `"fail"` |
| 5 | requires both exchange AND code to match | same code, different exchange → `"fail"` |

---

## Notes

- Test #10 (dry-run) is the important one — it proves the alert path works end-to-end (recipient normalisation → send) without depending on live Twilio credentials, so it runs anywhere.
- Test #5 (client) guards a real correctness bug: matching on stock code alone would falsely "pass" a same-ticker stock on a different exchange.