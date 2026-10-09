# 1QR Prime Authorization Matrix

## Principal levels

| Principal | Intended scope |
|---|---|
| Unauthenticated customer | Published public business/customer page, public QR, public menu, public order submission, opaque-token order tracking, public service requests/reports/events/payment initiation |
| Authenticated user | Own account/session, own `/api/me`, own device registration, owned tenant/location memberships |
| Staff | Read and operational order/request/table/menu access allowed by route; no owner-only configuration |
| Manager | Staff operational access plus location profile/menu/table/payment-request operations explicitly granted by route; not owner-only account/staff/payment-destination actions |
| Owner | Tenant ownership, location creation/profile, staff management, payment route management, export/delete, owner-level audit/analytics |
| Support/admin read | `/api/admin/*` read operations according to `admin_role` |
| Admin | Admin/support reads plus admin-only plan, billing, verification and report state changes |

## Sensitive operation policy

| Operation | Allowed principal | Server-side enforcement reviewed |
|---|---|---|
| Read private location/menu/tables/orders | Tenant member | `getLocation`/location-scoped repository query plus membership |
| Edit location/profile/onboarding | Owner or manager | Location lookup then membership with owner/manager roles |
| Create location | Owner of tenant | `tenantId` membership with owner role |
| Manage menu/tables | Owner or manager | Location membership and child query scoped to location |
| Add payment destination | Owner with verified email | Owner membership and `email_verified` check |
| Request/activate/disable payment route | Owner | Owner membership and route/location scope; activation requires verified route |
| View analytics | Owner or manager | Membership plus analytics entitlement |
| View audit | Owner | Owner membership and tenant audit query |
| Manage staff | Owner | Owner membership; role enum excludes owner/admin; final owner protected |
| Change order lifecycle | Tenant member | Membership plus order transition query scoped to location |
| Merchant-confirm payment | Owner or manager | Membership plus order/location scope; provider verification remains false |
| Export account | Authenticated user | Export tenant list restricted to current user-owned memberships |
| Delete account | Authenticated user with password and literal confirmation | Argon2 password verification and transaction; requires separate disposable-account test |
| Admin account/tenant reads | Admin/support role | `admin()` checks authenticated `admin_role` |
| Admin plan/billing/route/report mutations | Admin role only | `admin(r, true)` plus route-specific checks |
| Route verification | Admin not belonging to route tenant | Independent-verifier membership check |
| Public customer page | Unauthenticated | Published-location lookup, public DTO assembled by repository |

## Required negative tests

1. Unauthenticated access to every private route must return 401.
2. A valid user from Tenant A must not read or mutate Tenant B resources, including nested child-ID mismatch cases.
3. Manager must be denied owner-only staff/payment/account operations.
4. Owner/manager/staff must be denied `/api/admin/*` without an admin role.
5. Client-supplied `role`, `admin_role`, tenant IDs, ownership, verification, billing and plan fields must not grant privilege.
6. Public endpoints must not expose private account, staff, audit, billing or session data.

## Known review caveats

- The source has separate `auth`, `membership`, `loc`, and `admin` helpers; the dynamic test suite must verify callers cannot bypass the helper by supplying a mismatched nested ID.
- `trustProxy` is enabled for non-Vercel production. This requires deployment-specific confirmation that only the trusted reverse proxy can set forwarding headers.
