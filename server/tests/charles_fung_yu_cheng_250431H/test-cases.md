# Backend Test Cases — Subscription/Paywall, Admin & Data Pipeline (Person 2)

**Owner:** Charles · **Framework:** Vitest (Node) · **Total: 32 tests across 4 files, all passing.**

Unit tests for the three backend areas I own. Stripe and MySQL are mocked (`config/db.js`'s `pool`, the Stripe SDK, `child_process.spawn`, and the collaborating auth/cache services), so nothing hits a real database, Stripe's API, or launches the Python pipeline.

## How to run

From `server/`:

```
npm install
npm test                                   # runs the whole server suite
npx vitest run tests/charles_fung_yu_cheng_250431H   # just these
```

Test files live in `server/tests/charles_fung_yu_cheng_250431H/`.

---

## `subscription.service.test.js` — 13 tests

| # | Test | Expected outcome |
|---|---|---|
| 1 | `SUBSCRIPTION_FEE` constant | `{ amountCents: 999, currency: "SGD", interval: "month" }` |
| 2 | `getStatus` — unknown user | returns `null` |
| 3 | `getStatus` — flag coercion | tinyint `is_active`/`cancel_at_period_end` become booleans; `hasBillingAccount` true when a customer id exists |
| 4 | `listPayments` | returns the rows and queries `FROM payment` with the user id |
| 5 | `constructWebhookEvent` — secret unset | throws `/STRIPE_WEBHOOK_SECRET/` |
| 6 | `constructWebhookEvent` — valid | verifies raw body + signature against the secret, returns the event |
| 7 | `createCheckoutSession` — already subscribed | throws `ALREADY_SUBSCRIBED_MESSAGE`; no Checkout session created |
| 8 | `createBillingPortalSession` — no customer | throws `/No billing account/` |
| 9 | `createBillingPortalSession` — has customer | returns the hosted portal `{ url }` |
| 10 | `scheduleCancelAtPeriodEnd` — nothing to cancel | throws `/No active subscription to cancel/` |
| 11 | `resumeSubscription` — nothing to resume | throws `/No subscription to resume/` |
| 12 | `handleInvoicePaid` — non-subscription invoice | ignored; no DB write |
| 13 | `handleInvoicePaid` — known customer | idempotent `INSERT IGNORE INTO payment` with amount/currency(upper)/invoice id |

## `admin.service.test.js` — 10 tests

| # | Test | Expected outcome |
|---|---|---|
| 1 | `listUsers` flag coercion | `isActive`/`isAdmin` returned as booleans |
| 2 | `revokeUser` | cancels the Stripe subscription, sets `is_active = 0`, returns the user |
| 3 | `revokeUser` — Stripe cancel fails | still revokes; surfaces `stripeCancelError` |
| 4 | `deleteUser` — row removed | `{ deleted: true }`, Stripe cancel attempted |
| 5 | `deleteUser` — no such user | `{ deleted: false }` |
| 6 | `restoreUser` | sets `is_active = 1`, returns refreshed user |
| 7 | `setAdmin` | promotes with `is_admin = 1`, returns `isAdmin: true` |
| 8 | `getStats` | derives `inactiveUsers`, sums succeeded-payment revenue |
| 9 | `createUser` | hashes password, returns a `listUsers`-shaped row (`avatar: null`, `paymentCount: 0`) |
| 10 | `clearCache` | returns `{ entriesCleared }`, wipes the cache |

## `admin.middleware.test.js` — 4 tests (`requireAdmin`)

| # | Test | Expected outcome |
|---|---|---|
| 1 | no authenticated user id | `401`, `next()` not called |
| 2 | user id resolves to no row | `401`, `next()` not called |
| 3 | logged-in non-admin | `403`, `next()` not called |
| 4 | admin | `next()` called once, no status written |

## `ingestion.service.test.js` — 5 tests (reseed control)

| # | Test | Expected outcome |
|---|---|---|
| 1 | `getReseedSchedule` default | disabled — `{ intervalHours: null, nextRunAt: null, lastReseedAt: null }` |
| 2 | `setReseedSchedule(24)` | upserts row id=1 with interval + next-run; reflects `intervalHours: 24` |
| 3 | `setReseedSchedule(0 / null)` | treated as disable — interval and next-run cleared |
| 4 | `startReseed` when idle | `{ started: true }`, spawns the pipeline, status `running: true` |
| 5 | `startReseed` while running | concurrency guard → `{ started: false, alreadyRunning: true }`, no second spawn |
