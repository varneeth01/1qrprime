# 1QR Prime architecture

## Implemented shape

1QR Prime is a TypeScript monorepo with a Fastify API, SQLite relational database, responsive Vite/React web surfaces, and an Expo React Native merchant app. The public customer page, merchant console, and support console share the API but remain separate authorization surfaces.

The API owns tenant authorization, profile versioning, public slugs, menu and order state, payment-route state, route snapshots, push outbox, aggregate events, subscriptions/entitlements, support actions, and immutable audit rows. SQLite uses foreign keys, WAL, migrations, and transactional state transitions. Object storage is optional and uses server-side image conversion before upload.

## Key decisions

- Stable `https://.../b/:slug` page QR is the strongest verified fallback. A separate UPI QR is available after route activation. A single QR that behaves differently based on scanner identity is not assumed.
- The native `oneqrprime://` scheme is reserved for explicitly supported in-app flows. Universal Links and Android App Links are not enabled; regular camera scans resolve to the HTTPS Customer Action Page without requiring the merchant app. Scanner-specific one-QR routing is not advertised without physical-device evidence.
- Payment routes are provider-agnostic. The initial `basic_upi` adapter creates a deep link only; it cannot query provider status, issue refunds, create dynamic QR, or verify webhooks. The UI therefore says `confirmation pending` and separately records audited merchant confirmation.
- Route activation requires a verified state and a non-merchant admin verifier. New payment attempts snapshot route and parameters; later switching or rollback does not mutate in-flight attempts.
- Customer order creation is idempotent by location and caller key. Line prices are copied into the order, sold-out items are checked at submit time, and manager updates use expected-state compare-and-set.
- The mobile app is a real merchant client: it edits profiles, manages availability, handles orders, manages payment routes, shares QRs, requests push notifications, exports data, and deletes the account. It does not wrap the public website.
- Subscription purchase is disabled in the client. Plan and entitlement state is server-managed so Apple/Google billing can be added without changing merchant/customer payment flows.

## Trust boundaries

Sessions are HTTP-only SameSite cookies on web and SecureStore bearer tokens on native. Every merchant-owned query is joined through membership or location tenant. Admin actions require a separate admin role and are audited. Public order recovery uses a high-entropy per-order token and exposes no account data. Unsafe external URL schemes, local/IP destinations, uploads, and oversized images are rejected.

## Operations

Run the API with `npm run dev`, or build `Dockerfile` and run `compose.yml` with production HTTPS, SMTP, and support values. `scripts/backup.ts` creates an SQLite backup. `scripts/retention.ts` expires sessions, tokens, closed operational records, old aggregate events, and audit rows according to the documented retention window. Use `scripts/admin.ts` only from a protected operator environment to grant support/admin role.

## Open architecture work

Production needs a managed database/object store, secret manager, verified email sender, APNs/FCM/EAS project, structured logs/metrics, alerting, and a tested restore drill. SQLite is suitable for the initial single-region deployment; move to PostgreSQL when concurrent write volume or multi-region operation requires it.
# 1QR Prime restaurant ordering architecture

The restaurant flow extends the existing Fastify + SQLite tenant model rather than introducing a parallel order system.

## Restaurant domains

- `menu_categories`, `items`, `menu_item_variants`, `modifier_groups`, `modifiers`, and `menu_item_modifier_groups` hold the configurable menu.
- `restaurant_tables` adds safe table context to the stable business QR. A table URL carries a random token; it does not embed sensitive data.
- `orders` stores authoritative totals and customer/order snapshots. `order_items` and `order_item_modifiers` preserve historical names and prices after menu edits.
- `order_events` records the status timeline. Status transitions remain explicit and optimistic-concurrency protected by `expectedState`.
- `order_sequences` provides human-readable per-business references such as `QR-1000`; internal UUIDs remain the database identity.

Public menu reads resolve the stable QR slug to the active business configuration. Customer submissions are idempotent and re-resolve item, variant, modifier, availability, tax, and fee data inside a database transaction. Merchant web and native clients use the existing safe polling fallback; push remains an additional notification channel.

Category behavior is exposed through `CATEGORY_CAPABILITIES` in `apps/api/src/domain.ts`, keeping restaurant-specific capabilities out of scattered controller conditionals.
