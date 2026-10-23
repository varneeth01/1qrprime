# Final restaurant operations browser acceptance

Run with local Playwright Chromium against the local SQLite QA fixture at `http://localhost:5173`.

## Result

- Playwright available: PASS
- Chromium available: PASS
- Real browser rendering: PASS
- Physical speaker output: not claimed; manual device check required
- SQLite/API regression: 47 passed
- PostgreSQL regression: 54 passed, 0 skipped

## Browser evidence

Captured under this directory:

`staff-role-assignment.png`, `kitchen-navigation.png`, `service-navigation.png`, `manager-order-actions.png`, `kitchen-mode-before-start.png`, `kitchen-mode-active.png`, `kitchen-new-order.png`, `kitchen-preparing.png`, `kitchen-ready.png`, `service-ready-order.png`, `service-mark-served.png`, `customer-cart-review-mobile.png`, `customer-slide-confirm-mobile.png`, `customer-order-success.png`, `customer-home-services.png`, `call-waiter-confirm.png`, `waiter-requested.png`, `water-requested.png`, `cutlery-requested.png`, `bill-request.png`, `service-request-waiter.png`, `service-request-accepted.png`, `service-request-completed.png`, `operations-performance.png`, `slow-orders.png`.

Verified in Chromium:

- Owner, Manager, Kitchen, Service/Floor, and Cashier fixture authentication.
- Staff role assignment view and role-scoped navigation.
- Kitchen Mode requires deliberate activation and does not auto-trigger before activation.
- Test sound invokes the browser audio API.
- Kitchen TTS payload captured as: `New order. Table 1. 2 Paneer Tikka, 1 Cold Coffee`.
- Kitchen TTS contains no phone, payment, consent, or UUID data.
- Customer cart review precedes order creation.
- Slider confirmation creates an order and reaches success state.
- Realtime order creation is accepted while Kitchen Mode is active.
- Kitchen cannot see the served action.
- Service order view exposes `Mark served`; clicking it produced `state=served` and populated `served_at` server-side.
- Customer service hub, waiter/water/cutlery/bill request flows, acknowledgement, and completion rendered.
- Operations analytics and slow-order surfaces rendered.

## Not completed in this automated browser pass

- Independent reconnect/no-replay count assertion was not isolated from multiple fixture orders.
- Service-specific audio mode is not exposed in the current UI, so service TTS was not claimed.
- Physical audio output was not claimed from headless Chromium.
- Item cancellation, partial cancellation, locked cancellation, manager override, paid-item refund, and bill-after-refund browser flows were not exercised by this script.
- Failure-injection cart preservation, desktop keyboard confirmation, order timeline, customer served tracker, pay phone/payment-method screenshots, and all requested viewport permutations were not captured.

## Regression

`npm run typecheck`, `npm test`, `npm run test:postgres`, both package builds, full build, `npm run db:inventory`, and `git diff --check` passed after the browser-verified UI fix.

No push or deployment was performed.
