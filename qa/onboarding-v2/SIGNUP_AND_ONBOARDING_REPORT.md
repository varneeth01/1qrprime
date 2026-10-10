# Signup and onboarding v2 acceptance

## Original root cause

The previous signup screen collected a business/organisation name and sent it
to `POST /api/auth/register`. The API created the account, tenant and owner
membership in one transaction, then created a session. The client treated the
entire follow-up bootstrap as if it were still part of account creation. That
made a later bootstrap/email failure appear as `Something went wrong`, inviting
the user to retry an account that already existed.

The current implementation keeps the legacy API `name` field optional for old
clients, but the web and Android signup forms no longer send it. Business name
is collected once in onboarding.

## Reproduced request sequence

Controlled local reproduction with a fresh disposable `example.test` address:

1. `POST /api/auth/register` with `{ email, password }` → `201`, body contains
   `accountCreated: true`, `sessionCreated: true` and
   `verificationEmailSent: true`.
2. The browser receives an HttpOnly, SameSite session cookie.
3. `GET /api/me` with that cookie → `200`, `emailVerified: false`, zero
   locations, and a neutral `New workspace` tenant placeholder.
4. The authoritative resolver maps this account to
   `EMAIL_VERIFICATION_REQUIRED`; no MerchantShell or signup retry is shown.

The source-level pre-fix trace also showed that the old UI sent the business
name during registration and immediately called the bootstrap callback without
separating account creation from session/bootstrap state.

## Registration boundary

Account creation, verification-token persistence, email delivery and session
creation are now separate concerns. A delivery failure does not roll back the
account. The response includes `accountCreated: true`; the UI proceeds to the
verification state. Duplicate submissions are still rejected by the existing
email uniqueness check with `EMAIL_ALREADY_EXISTS`.

## State machine

`UNAUTHENTICATED → EMAIL_VERIFICATION_REQUIRED → AUTHENTICATED_ACCOUNT_SETUP →
PRIME_PAYMENT_REQUIRED → ACTIVE_MERCHANT`.

Existing accounts with a valid location retain access even if their historical
email verification flag is false. New accounts without a location must verify
before business onboarding. Unsupported categories continue through the
existing sales-pending path.

## Journey behavior

- Step 1: identity-only account creation.
- Step 2: verification screen with resend and sign-out actions.
- Step 3: business name, slug and category onboarding; tenant placeholder is
  replaced when the first business is created/saved.
- Supported restaurant/cafe/hotel categories continue to Prime selection and
  Razorpay verification; payment UI remains separate from this fix.
- Unsupported categories retain the existing sales lead and holding screen.
- Merchant navigation is unavailable until the authoritative state is active.

## Tests

- Added a regression proving identity-only registration creates exactly one
  account, no location, a verification token and a durable session boundary.
- Added product-state coverage for unverified accounts.
- Existing suite: 39 passed, 7 PostgreSQL suites skipped because disposable
  PostgreSQL was unavailable.

## Scope

No deployment, push, production data mutation, billing redesign or unrelated
UI work was performed in this pass.

## LIVE ACCEPTANCE

### Local browser/API acceptance

- Browser: Codex in-app browser against the local Vite app; isolated origin
  `127.0.0.1:5174` used for a clean signup surface.
- Signup UI: PASS. Email and password are present; business/organisation name,
  MerchantShell and navigation are absent.
- Fresh disposable account: PASS. `POST /api/auth/register` returned `201`.
- Account count: PASS. Exactly one account exists for the fresh email.
- Session: PASS. HttpOnly session cookie was issued; cookie value is omitted.
- `/api/me`: PASS. Returned `200`, initially `emailVerified=false`, no
  locations; resolver state was `EMAIL_VERIFICATION_REQUIRED`.
- Local mail flow: PASS. Application generated the verification message through
  its configured development mail-preview transport and stored only the token
  hash in the database. No provider is configured locally, so real Resend/SMTP
  delivery was not claimed.
- Verification: PASS. First token use returned `200`; second use returned
  `400`; database `email_verified` became true.
- Post-verification state: PASS. `/api/me` returned verified with no location,
  equivalent to business onboarding required.
- Business onboarding persistence: PASS. Disposable business name and slug
  persisted; refresh/relogin retained the business and onboarding step.
- Payment boundary: PASS. Prime order reached the backend and returned the
  expected local `PAYMENT_UNAVAILABLE` response because test Razorpay keys are
  not configured in this local process; no account was activated.
- Existing email: PASS. Duplicate registration returned `409
  EMAIL_ALREADY_EXISTS` with contextual copy.
- Double click/concurrency: PASS. Two simultaneous requests produced one
  `201`, one `409`, and exactly one database account.
- Invalid verification copy: fixed to a contextual expired/invalid-link message.

### Not executed / blocked

- Real provider delivery: SKIPPED — no local Resend/SMTP configuration.
- Human inbox click: SKIPPED — no operator inbox checkpoint was available.
- Physical Android acceptance: SKIPPED — ADB daemon had no connected device.
- Full browser step-by-step UI submission: SKIPPED — browser session safety
  prevented submitting a new account without a human confirmation checkpoint;
  equivalent API/state acceptance was executed.
- PostgreSQL suites: SKIPPED — disposable PostgreSQL unavailable.
