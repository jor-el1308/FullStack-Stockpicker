# API Documentation — Dashboard & Stock Report

**Owner:** Enrico (Person 4)

The endpoints my two features depend on. The screener endpoint is implemented by Person 3 and the stock endpoints by Person 2; documented here as the integration contract my Dashboard and Stock Report pages are built against (source of truth: `shared/types/index.js`).

## Conventions

- **Base URL:** `/api` (the Vite dev server proxies this to `http://localhost:4000`).
- **Auth:** an httpOnly `token` cookie set at login; every request is sent with `credentials: "include"`. All endpoints below also require an **active** subscription.
- **Response envelope (every endpoint):**

```json
{ "success": true,  "data": { } }
{ "success": false, "error": { "message": "…", "code": "…" } }
```

- **Units:** numeric values cross the API in **raw units** (market cap and financials in dollars, dividends in cents, ratios as-is). Human formatting happens client-side.

---

## 1. `POST /api/screener/run`

Runs the filter engine and returns the rows the Dashboard renders. An empty body runs the default screen — which is exactly what the Dashboard sends.

- **Auth:** required + active
- **Request body** (all fields optional):

```json
{
  "criteria": [
    { "key": "marketCap", "min": 1000000000 },
    { "key": "peRatio", "max": 25 }
  ],
  "exchanges": ["SGX", "NYSE"],
  "excludeSectors": ["Gambling", "Tobacco"],
  "minCompanyAgeYears": 5
}
```

- **Success `200`:**

```json
{
  "success": true,
  "data": {
    "criteriaUsed": [{ "key": "marketCap", "label": "Market Cap", "min": 1000000000 }],
    "results": [
      {
        "exchangeCode": "SGX",
        "stockCode": "D05",
        "stockName": "DBS Group Holdings",
        "values": { "marketCap": 95000000000, "peRatio": 9.8, "revenue": 20600000000, "dividendCents": 216 },
        "score": 87
      }
    ]
  }
}
```

`score` is optional — present only when Person 3's criteria-weighting is applied; the table renders a Score column when any row has one.

- **Errors:** `400` (invalid body), `401`, `402`, `500`. See the error table below.

---

## 2. `GET /api/stocks/:exchangeCode/:stockCode`

Everything on the report page **except** price history.

- **Auth:** required + active
- **Path params:** `exchangeCode` (e.g. `SGX`), `stockCode` (e.g. `D05`)
- **Success `200`:**

```json
{
  "success": true,
  "data": {
    "exchangeCode": "SGX",
    "stockCode": "D05",
    "stockName": "DBS Group Holdings",
    "latestMarketCap": 95000000000,
    "fiftyTwoWeekHigh": 38.20,
    "fiftyTwoWeekLow": 30.15,
    "financials": [
      { "year": 2023, "revenue": 20600000000, "profitBeforeTax": 11200000000, "profitAfterTax": 10300000000, "ebita": 12100000000 },
      { "year": 2022, "revenue": 16500000000, "profitBeforeTax": 8900000000,  "profitAfterTax": 8200000000,  "ebita": 9600000000 }
    ],
    "dividends": [
      { "year": 2023, "dividendCents": 216 },
      { "year": 2022, "dividendCents": 150 }
    ]
  }
}
```

- **Errors:** `404` (stock not found), `401`, `402`, `500`.

---

## 3. `GET /api/stocks/:exchangeCode/:stockCode/prices`

Daily closes for the chart, and the source of the current price and day-change figures.

- **Auth:** required + active
- **Path params:** `exchangeCode`, `stockCode`
- **Success `200`** — an array of daily prices (up to ~260 rows, roughly one trading year):

```json
{
  "success": true,
  "data": [
    { "date": "2024-01-02", "open": 33.10, "high": 33.45, "low": 32.98, "close": 33.20, "volume": 12000000 },
    { "date": "2024-01-03", "open": 33.25, "high": 33.60, "low": 33.05, "close": 33.51, "volume": 10400000 }
  ]
}
```

- **Errors:** `401`, `402`, `500`. An unknown stock returns an empty array rather than `404`.

---

## Error codes

| Status | `error.code` | When | How the page reacts |
|---|---|---|---|
| `400` | — | Malformed screener request body | Inline error on the Dashboard |
| `401` | — | Missing / invalid / expired session cookie | Redirect to `/login` |
| `402` | `ACCOUNT_INACTIVE` | Logged in but subscription not active | Redirect to `/activate` |
| `404` | — | Stock detail for an unknown symbol | Inline "Couldn't load…" + back action |
| `500` | — | DB not migrated/seeded, or unexpected server error | Inline error; message preserved |

All error bodies follow `{ "success": false, "error": { "message": string, "code"?: string } }`. The shared client wrapper throws `error.message`, which each page renders.

---

## Integration notes (to resolve before the final demo)

1. **Stock detail currently returns a subset.** The live `getStockDetail` query returns name/sector/listed date/active flag but not `latestMarketCap`, `fiftyTwoWeekHigh`, `fiftyTwoWeekLow`, `financials`, or `dividends`. Until the server query is extended, the report page's stat cards fall back to `—` (handled gracefully). — *Server-side, Person 2.*
2. **Price ordering.** `/prices` currently returns rows newest-first (`ORDER BY price_date DESC`), but the chart and day-change logic assume oldest-first. The server should sort ascending (or the client should reverse) so the timeline reads left-to-right and "current price" is the latest close.