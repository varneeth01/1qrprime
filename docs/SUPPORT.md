# Merchant and support guide

Merchants register, create a location, choose a category, edit the public page, add catalogue items, publish, and download a page QR. Restaurants can enable order types and counter/UPI payment options. Payment destinations are drafts until independently verified; only verified routes can be activated. A route change affects new payment attempts, while existing attempts retain their original snapshot.

The printed page QR opens the public HTTPS Customer Action Page from a regular camera and does not require the merchant app. The native `oneqrprime://` link is reserved for explicitly supported app flows; Universal Links and Android App Links are not enabled. The separate UPI QR remains available for payment-app scanning. Scanner-specific one-QR behavior is unverified and must not be promised to merchants.

The manager desk polls every four seconds and shows connection state. Push notifications are an extra alert, not the delivery mechanism. Staff can handle orders according to role. A customer can recover a submitted order by keeping the browser open or retrying with the same idempotency key.

With the current basic UPI adapter, a payment attempt is `confirmation pending`. A UPI app, bank, network, or payer-side failure cannot be diagnosed or repaired by switching the merchant route. Merchant-side route problems are handled by owner/manager failover and rollback; provider-confirmed success is unavailable until a signed provider callback/status adapter is configured. Never treat a redirect, screenshot, or return to the page as proof of payment.

Support can search accounts, inspect route state/reports/audit history, add a support note, and resolve abuse reports. Only an admin can change entitlements, verify payment routes, or unpublish a reported page. Never store a UPI PIN, bank password, full bank credential, or health information in a support note.
# Restaurant support runbook

- If a customer sees an unavailable item, refresh the public menu. The server revalidates availability and price at checkout.
- If an order is not visible, use the merchant Orders desk refresh/reconnect indicator; the order is persisted before notification delivery.
- For table orders, confirm the table name shown on the order, not a customer-supplied free-text value.
- Customer tracking URLs are opaque and should not be copied into public support tickets. Ask the customer for the order number and business name.
- UPI deep-link launch is not payment confirmation. Confirm payment using the configured provider or merchant evidence workflow.
