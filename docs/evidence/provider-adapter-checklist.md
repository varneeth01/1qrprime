# Provider adapter checklist

The current `basic_upi` adapter remains enabled only for deep-link initiation and exposes `webhooks: false`, `statusQueries: false`, and `refunds: false`. A real provider must implement the following behind the existing provider-agnostic interface before capability flags change.

## Required interface and controls

- **Create payment/session**: accept merchant/location/order context and amount; return provider reference, route snapshot, expiry, and payer handoff data without handling a UPI PIN or bank credential.
- **Signed webhook verification**: validate provider signature, timestamp/replay window, merchant identity, amount, order reference, and event ID before mutating state.
- **Status query**: retrieve authoritative provider status server-side and map it to `pending`, `verified`, or `failed` with the raw provider reference retained.
- **Refund/status where supported**: initiate only from an authorized server action and reconcile asynchronous refund states; leave capability disabled when undocumented.
- **Idempotency**: use an idempotency key for session creation and event ID/provider reference uniqueness for callbacks and status updates.
- **Reconciliation**: persist payment attempt, route ID, route snapshot, order ID, amount, provider transaction reference, callback/status timestamps, and final mapped state.
- **Timeout and delayed-callback handling**: keep attempts confirmation-pending after timeout; schedule a bounded status retry/reconciliation path and never infer success from a client redirect.
- **Error classification**: distinguish provider/merchant-route failure, payer bank/app/network failure, expired session, duplicate request, and unknown/pending states using documented provider codes only.

## Required sandbox test evidence

The provider owner must supply a sandbox or approved merchant account, callback signing documentation, status/refund documentation, test payer, endpoint allow-list requirements, and retention expectations. Record transaction IDs and redacted request/response evidence for successful payment, failed payment, delayed callback, missing callback, duplicate callback, provider timeout, route failure, route failover, route rollback, and an existing attempt retaining its original route snapshot.

Until all evidence exists, keep provider confirmation unavailable and display `confirmation pending` for basic UPI attempts.
