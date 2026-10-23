# Customer CRM, WhatsApp Marketing, Promotions and Challenges

## Scope

The customer-marketing slice is deliberately tenant-scoped. A customer is
identified by a normalized phone number only within one tenant; the same phone
number can therefore exist independently for different businesses.

Payment context and marketing consent are separate records. Capturing a phone
number for payment or an order never opts a customer into marketing. The
customer-facing checkbox is unchecked by default, records the consent text
version and source, and the public opt-out endpoint is rate limited and returns
a generic response.

## CRM

Merchant CRM routes live below `/api/locations/:lid/marketing`. Lists return
masked phone numbers. Detail access is tenant- and location-scoped. Public
routes never return customer phone numbers. Campaign audience queries enforce
`customer_consents.status = 'opted_in'` on the server, including at recipient
snapshot time.

## Promotions

The first supported promotion types are percentage discount, flat discount and
special price. A promotion must target the whole menu or validated items or
categories belonging to the current location. Active windows are evaluated by
the API, and order creation recalculates the best applicable non-stackable
price from the current menu state. Customer-facing promotion payloads contain
only display-safe fields.

## Challenges

Challenges support order count, visit count, spend amount, item quantity and
category quantity rule types. Progress is derived after a verified order
reaches `completed`; the client cannot increment progress or self-award a
reward. Challenge completion issues a tenant-scoped entitlement. Flat and
percentage discount entitlements can be atomically consumed by public order
creation for the matching customer phone and are snapshotted on the order;
item rewards remain unavailable until fulfillment semantics exist.

## WhatsApp campaigns

Campaigns support drafts, scheduled metadata, audience selection and recipient
snapshots. Sending requires a connected Meta sender and an approved template.
The current provider is an explicit unconfigured adapter by default. An
official Meta Cloud API adapter is available behind server-only environment
variables. The send endpoint is only a request/audit boundary and never performs
bulk delivery in an HTTP request. `MarketingWorker.runOnce()` is the bounded
worker entry point; it re-checks consent, paces calls, retries with backoff and
fails closed when the provider is not configured. No credentials or provider
tokens are stored in the frontend.

The persistent campaign, recipient and marketing-job tables support scheduled
delivery. The worker is not started by the API process; production still needs
an approved scheduler/queue consumer and real Meta credentials/templates.
Provider webhook normalization and signature helpers exist, but a raw-body
webhook HTTP route and callback reconciliation are not enabled yet.

## Permissions and operations

Owners have full access. Staff access is server-enforced through marketing
capabilities such as `marketing.view`, `marketing.customers`,
`marketing.campaigns.manage`, `marketing.promotions.manage` and
`marketing.challenges.manage`. A manage capability includes its corresponding
read capability, but hiding a navigation item is never the authorization
boundary.

The admin API exposes aggregate marketing operations data at
`/api/admin/marketing/overview` without exposing customer phone lists or
provider credentials.

## Migrations and limitations

SQLite migrations `014_customer_marketing.sql` and `015_marketing_jobs_rewards.sql`,
plus PostgreSQL migrations `018_customer_marketing.sql` and
`019_marketing_jobs_rewards.sql`, are additive. Local tests exercise the consent
boundary, public rendering, promotion/challenge creation, atomic reward
redemption and mock-worker delivery. `npm run test:postgres` accepts only a
local disposable PostgreSQL host and refuses production/remote URLs.
