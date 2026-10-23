# 1QR Prime — high-risk browser acceptance

Run with local Playwright Chromium against the disposable SQLite QA database. No push or deployment was performed.

## Result

| Area | Result |
| --- | --- |
| Waiter cancellation inside window | PASS |
| Partial item cancellation | PASS |
| Cancellation lock and stale API rejection | PASS |
| Manager locked-item override and audit actor | PASS |
| Paid-item waiter restriction | PASS after narrow UI fix |
| Manager paid-item refund flow | PASS |
| Manual UPI refund state/completion | PASS (`MANUAL_REQUIRED` → `SUCCEEDED`) |
| Desktop confirmation | PASS |
| Browser order idempotency | PASS; repeated key returned one order ID |
| Failure preserves cart | PASS |
| Operations metrics and spend/hour rendering | PASS; no `NaN`/`Infinity` |
| Order close and server `closed_at` | PASS |
| Kitchen reconnect dedup | FAIL: Order A was not replayed, but Order B produced no captured post-reconnect announcement (`1 / 0 / 0`) |
| Kitchen cancellation TTS payload | FAIL in this run; no cancellation speech payload was captured |
| Dedicated order timeline UI | NOT IMPLEMENTED/FAIL: no dedicated browser timeline surface was observed |

The waiter paid-item defect was proven in the browser: the API rejected the mutation, but the waiter UI exposed the wrong cancellation affordance. The UI now hides normal cancellation for paid items and shows manager assistance; manager/owner paid items retain the controlled refund action. This was the only product behavior changed during this run.

## Evidence

Screenshots are in this directory:

- [waiter-cancel-in-window.png](./waiter-cancel-in-window.png)
- [partial-cancel.png](./partial-cancel.png)
- [waiter-cancel-locked.png](./waiter-cancel-locked.png)
- [manager-cancel-override.png](./manager-cancel-override.png)
- [paid-item-waiter-blocked.png](./paid-item-waiter-blocked.png)
- [manager-paid-refund.png](./manager-paid-refund.png)
- [manual-refund-required.png](./manual-refund-required.png)
- [desktop-order-confirmation.png](./desktop-order-confirmation.png)
- [order-failure-preserves-cart.png](./order-failure-preserves-cart.png)
- [table-performance.png](./table-performance.png)

## Automated regression after the browser run

- Typecheck: PASS
- SQLite/API: 47 passed, 7 skipped in the default suite
- Disposable PostgreSQL: 54 passed, 0 skipped
- Web build: PASS
- API build: PASS
- Full build: PASS
- DB inventory: PASS
- Diff check: PASS

Physical speaker output was not claimed: `PHYSICAL_AUDIO_HEARD: MANUAL CHECK REQUIRED`.
