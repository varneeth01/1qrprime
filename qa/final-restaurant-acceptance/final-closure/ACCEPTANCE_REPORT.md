# Final closure acceptance

Run with local Playwright Chromium against the disposable SQLite QA restaurant. No production data, charge, push, or deployment was used.

## Realtime and audio

- `KITCHEN_RECONNECT_SUBSCRIPTION`: PASS
- `ORDER_A_INITIAL_ALERT`: 1
- `ORDER_A_AFTER_RECONNECT`: 0
- `ORDER_B_AFTER_RECONNECT`: 1
- `ORDER_C_AFTER_RECONNECT`: 1
- `REALTIME_AFTER_RECONNECT`: PASS; order cards and new alerts resumed after reactivation.
- `AUDIO_AFTER_RECONNECT`: PASS
- `DUPLICATE_EVENT_PROTECTION`: PASS
- `KITCHEN_CANCELLATION_REALTIME`: PASS; cancelled quantity appeared without refresh.
- `KITCHEN_CANCEL_TTS`: PASS; observed `Closure Bill Table. 1 Cold Coffee cancelled.`
- `KITCHEN_CANCEL_TTS_DEDUP`: PASS; 0 replayed after reconnect.

The reconnect defect was fixed by baselining existing orders when Kitchen Mode is activated and only opening the SSE subscription while Kitchen Mode is active. Existing event deduplication remains in place.

## Timeline and billing

- `ORDER_TIMELINE_BROWSER`: PASS — [order-timeline.png](./order-timeline.png)
- `ORDER_TIMELINE_METRICS`: PASS — queue, preparation, service handoff, and fulfillment values rendered.
- `REFUND_EVENTS_IN_TIMELINE`: PASS — human-readable refund history rendered without raw enums or IDs.
- `BILL_AFTER_REFUND_BROWSER`: PASS — [bill-after-partial-refund.png](./bill-after-partial-refund.png)
- `PARTIAL_REFUND_PRESENTATION`: PASS — original paid amount, refund line, and net paid are distinct.
- `FINANCIAL_HISTORY_PRESERVED`: PASS

## Refund and payment safety

- `REFUND_IDEMPOTENCY_BROWSER`: PASS
- `REFUND_RECORD_COUNT`: 1 after repeated manager submission.
- `REFUND_CONCURRENCY`: PASS in the transactional/API regression; only one refundable quantity can win.
- `MAX_REFUND_PROTECTION`: PASS; refund amount is server-derived and cannot exceed the paid allocation.
- `PAYMENT_SAFETY_BROWSER`: PASS for local controlled payment initiation; no live external charge performed.
- `UPI_LAUNCH_MARKS_PAID`: NO
- `FAILED_PAYMENT_MARKS_PAID`: NO
- `ALREADY_PAID_PROTECTION`: PASS; fully paid orders remain protected from a second uncontrolled full payment.
- `SERVER_PAYMENT_AMOUNT_AUTHORITY`: PASS; tampered client amount was ignored and the authoritative bill amount was used.
- `BILL_AFTER_REFUND_STATE`: PASS — [paid-bill-state.png](./paid-bill-state.png)

## Hook investigation

- `HOOK_EXIT_126`: No project-owned hook was found.
- `HOOK_COMMAND`: not attributable to the repository.
- `HOOK_FILE`: none; `core.hooksPath` is unset and `.git/hooks` contains only Git sample hooks.
- `HOOK_REASON`: repository workspace check had no executable project hook to repair.
- `HOOK_APPLICATION_IMPACT`: NONE.

## Evidence

`NEW_SCREENSHOT_COUNT`: 5

`SCREENSHOT_DIRECTORY`: `qa/final-restaurant-acceptance/final-closure/`

- [kitchen-after-reconnect-order-b.png](./kitchen-after-reconnect-order-b.png)
- [kitchen-cancelled-item.png](./kitchen-cancelled-item.png)
- [order-timeline.png](./order-timeline.png)
- [bill-after-partial-refund.png](./bill-after-partial-refund.png)
- [paid-bill-state.png](./paid-bill-state.png)

## Regression validation

- `TYPECHECK`: PASS
- `SQLITE_TESTS`: PASS — 48, 0 failed, 7 skipped in default SQLite run
- `POSTGRES_TESTS`: PASS — 55, 0 failed, 0 skipped in disposable PostgreSQL 16
- `WEB_BUILD`: PASS
- `API_BUILD`: PASS
- `FULL_BUILD`: PASS
- `DB_INVENTORY`: PASS
- `DIFF_CHECK`: PASS

`CRITICAL`: 0

`HIGH`: 0

`MEDIUM`: 0

`LOW`: 0

`PHYSICAL_AUDIO_HEARD`: MANUAL CHECK REQUIRED — browser audio APIs and payloads passed; headless automation cannot certify speaker output.

`READY_FOR_LOCAL_ACCEPTANCE`: YES

No push or deployment was performed.
