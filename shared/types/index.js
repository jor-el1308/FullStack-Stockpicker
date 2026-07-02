/**
 * Shared contracts between client and server.
 *
 * These JSDoc typedefs mirror the data points listed in the company
 * requirement doc (section 3: Exchange, Stock Code, Date, OHLC, Market Cap,
 * Dividend, Revenue, PBT, PAT, EBITA) and the criteria/output format in
 * section 5.
 *
 * There's no runtime code here - this file exists so editors (VS Code, etc.)
 * can still offer autocomplete/type hints via JSDoc even though the project
 * is plain JavaScript. Both client (Person 4 dashboard) and server
 * (Person 2/3 data + filters) should reference these typedefs in their own
 * JSDoc comments so the API contract stays in sync while each workstream
 * builds against stub data before the real pipeline is ready.
 */

// ---------- Core identifiers ----------

/**
 * @typedef {string} ExchangeCode e.g. "SGX", "NASDAQ", "NYSE"
 * @typedef {string} StockCode e.g. "D05", "AAPL"
 */

/**
 * @typedef {Object} StockIdentity
 * @property {ExchangeCode} exchangeCode
 * @property {StockCode} stockCode
 * @property {string} stockName
 */

// ---------- Requirement doc section 3: raw data points ----------

/**
 * @typedef {Object} DailyPrice
 * @property {ExchangeCode} exchangeCode
 * @property {StockCode} stockCode
 * @property {string} date ISO date "YYYY-MM-DD"
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} [volume]
 */

/**
 * @typedef {Object} MarketCap
 * @property {ExchangeCode} exchangeCode
 * @property {StockCode} stockCode
 * @property {string} asOfDate
 * @property {number} marketCap
 */

/**
 * Dividend declared per year, in cents (requirement doc 3f).
 * @typedef {Object} DividendPerYear
 * @property {ExchangeCode} exchangeCode
 * @property {StockCode} stockCode
 * @property {number} year
 * @property {number} dividendCents
 */

/**
 * Revenue / PBT / PAT / EBITA per year (requirement doc 3g-3j), one row per fiscal year.
 * @typedef {Object} FinancialsPerYear
 * @property {ExchangeCode} exchangeCode
 * @property {StockCode} stockCode
 * @property {number} year
 * @property {number} revenue
 * @property {number} profitBeforeTax
 * @property {number} profitAfterTax
 * @property {number} ebita
 */

// ---------- Screener criteria (requirement doc section 2 & 5) ----------

/**
 * @typedef {"marketCap"|"dividendCents"|"revenue"|"profitBeforeTax"|"profitAfterTax"|"ebita"|"peRatio"|"companyAgeYears"} CriteriaKey
 */

/**
 * @typedef {Object} CriteriaRange
 * @property {CriteriaKey} key
 * @property {string} label
 * @property {number} [min]
 * @property {number} [max]
 */

/**
 * A named, saved set of filter ranges tied to a user account (Person 1's "quick-select" feature).
 * @typedef {Object} SavedCriteriaSet
 * @property {string} id
 * @property {string} userId
 * @property {string} name
 * @property {CriteriaRange[]} criteria
 * @property {string} createdAt
 */

/**
 * @typedef {Object} ScreenerRequest
 * @property {CriteriaRange[]} criteria
 * @property {string[]} [excludeSectors] e.g. gambling, tobacco
 * @property {number} [minCompanyAgeYears]
 * @property {ExchangeCode[]} [exchanges]
 */

/**
 * One row of the results table described in requirement doc section 5b.
 * @typedef {StockIdentity & { values: Partial<Record<CriteriaKey, number>> }} ScreenerResultRow
 */

/**
 * @typedef {Object} ScreenerResponse
 * @property {CriteriaRange[]} criteriaUsed
 * @property {ScreenerResultRow[]} results
 */

// ---------- Stock detail / dashboard (Person 4) ----------

/**
 * @typedef {StockIdentity & {
 *   latestMarketCap?: number,
 *   fiftyTwoWeekHigh?: number,
 *   fiftyTwoWeekLow?: number,
 *   priceHistory: DailyPrice[],
 *   financials: FinancialsPerYear[],
 *   dividends: DividendPerYear[]
 * }} StockDetail
 */

// ---------- Auth (Person 1) ----------

/**
 * @typedef {Object} AuthUser
 * @property {string} id
 * @property {string} email
 * @property {string} name
 * @property {string} createdAt
 */

/**
 * @typedef {Object} LoginRequest
 * @property {string} email
 * @property {string} password
 */

/**
 * @typedef {Object} SignupRequest
 * @property {string} email
 * @property {string} password
 * @property {string} name
 */

/**
 * @typedef {Object} AuthResponse
 * @property {AuthUser} user
 * @property {string} token
 */

// ---------- Watchlist / notifications (Person 5) ----------

/**
 * @typedef {Object} WatchlistItem
 * @property {string} id
 * @property {string} userId
 * @property {ExchangeCode} exchangeCode
 * @property {StockCode} stockCode
 * @property {string} [savedCriteriaSetId] alert if stock stops meeting these criteria
 * @property {"whatsapp"|"telegram"|"email"} channel
 * @property {string} createdAt
 */

// ---------- Optional AI recommendation step (Person 5, optional per doc section 6) ----------

/**
 * @typedef {Object} AiRecommendationRequest
 * @property {ScreenerResultRow[]} shortlist
 * @property {string} [notes] e.g. recent news, qualitative context
 */

/**
 * @typedef {Object} AiRecommendationResponse
 * @property {StockCode} stockCode
 * @property {ExchangeCode} exchangeCode
 * @property {"consider"|"caution"|"neutral"} recommendation
 * @property {string} rationale
 */

// ---------- Generic API envelope ----------

/**
 * @typedef {Object} ApiError
 * @property {string} message
 * @property {string} [code]
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success
 * @property {*} [data]
 * @property {ApiError} [error]
 */

// This file has no runtime exports - it's JSDoc-only. Keeping an empty
// export keeps it a valid ES module if anything ever does `import` it.
export {};
