# Frontend Test Cases — Activation & Subscription/Admin API (Person 2)

**Owner:** Charles · **Framework:** Vitest + React Testing Library (jsdom) · **Total: 19 tests across 2 files, all passing.**

Unit tests for my client surface: the Activate (paywall) page component, and the thin API-client wrappers for subscription and admin. `global.fetch`, the `api` client, and the auth context are stubbed so each state is deterministic and no real network call happens.

## How to run

From `client/`:

```
npm install
npm test                                   # runs the whole client suite
npx vitest run tests/charles_fung_yu_cheng_250431H   # just these
```

Test files live in `client/tests/charles_fung_yu_cheng_250431H/`. Config is the `test` block in `client/vite.config.js`; `client/tests/setup.js` loads the jest-dom matchers.

---

## `subscriptionApiClient.test.js` — 14 tests

Verifies each wrapper hits the correct method/path (and body) per `api-documentation.md`. `global.fetch` is stubbed.

### `api/subscription.js` (5)

| # | Function | Expected request |
|---|---|---|
| 1 | `getSubscriptionStatus` | `GET /api/subscription/status` |
| 2 | `listMyPayments` | `GET /api/subscription/payments` |
| 3 | `cancelSubscription` | `POST /api/subscription/cancel` |
| 4 | `resumeSubscription` | `POST /api/subscription/resume` |
| 5 | `createBillingPortalSession` | `POST /api/subscription/billing-portal`, returns `{ url }` |

### `api/admin.js` (9)

| # | Function | Expected request |
|---|---|---|
| 1 | `getStats` | `GET /api/admin/stats` |
| 2 | `listUsers` | `GET /api/admin/users` |
| 3 | `createUser(payload)` | `POST /api/admin/users` with the payload body |
| 4 | `revokeUser(id)` | `POST /api/admin/users/:id/revoke` |
| 5 | `restoreUser(id)` | `POST /api/admin/users/:id/restore` |
| 6 | `deleteUser(id)` | `DELETE /api/admin/users/:id` |
| 7 | `setAdmin(id, isAdmin)` | `POST /api/admin/users/:id/admin` with `{ isAdmin }` |
| 8 | `clearCache` | `POST /api/admin/cache/clear` |
| 9 | `runReseed` | `POST /api/admin/reseed` |

## `Activate.test.jsx` — 5 tests

The `api` client and `useAuth` are mocked; the page is rendered inside a `MemoryRouter`.

| # | Test | Expected outcome |
|---|---|---|
| 1 | logged-in render | shows "Activate your account", the S$9.99/month fee, and a Subscribe button |
| 2 | subscribe | `POST /subscription/checkout-session`, then full-page redirect to the returned Stripe URL |
| 3 | return from Stripe | `GET /subscription/verify-session?session_id=…`; on `isActive`, calls `updateUser({ isActive: true, activatedAt })` |
| 4 | `status=cancelled` | shows the "Payment was cancelled" message |
| 5 | no logged-in user | renders nothing (redirects to `/login`) |
