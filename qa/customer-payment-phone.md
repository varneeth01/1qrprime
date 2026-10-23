# Customer payment phone step

## Scope

This change applies only to the public customer QR/business Pay flow. Merchant Prime checkout, Razorpay billing and merchant activation are unchanged.

## Behavior

- Tapping Pay opens a mobile-first bottom sheet before any payment attempt is created or any UPI URI is returned.
- The sheet collects an Indian mobile number with a fixed `+91` prefix, `inputmode="tel"` and `autocomplete="tel"`.
- Client and API normalize accepted values to `+91XXXXXXXXXX`.
- The API stores the normalized value on the server-side payment attempt and, for an order-linked payment, attaches it to the existing order when no phone is already present.
- Direct payment table context is accepted only when the table ID, public token and location match server-side.
- Payment responses do not include the phone number; analytics events do not receive it.
- Public order creation and tracking responses also omit the stored phone; merchant order views remain controlled by authenticated tenant access.
- UPI launch remains a payment attempt/confirmation-pending state and never means payment succeeded.
- The number is retained only in session storage for the current customer session to make retries convenient.

## Data model

SQLite migration `013_customer_payment_context.sql` and PostgreSQL migration `017_customer_payment_context.sql` add `customer_phone` and validated `table_id` context to `attempts`. Existing order `customer_phone` remains the source of truth for order-linked contact details.

## Validation

- `npm test`: 43 passed, 7 PostgreSQL suites skipped.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm run db:inventory`: PASS.
- `git diff --check`: PASS.

Physical/browser customer payment execution still requires a published disposable business with an active payment route; no live payment was initiated during this implementation.
