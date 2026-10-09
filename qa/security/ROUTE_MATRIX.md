# 1QR Prime Route Matrix

Generated from the route registrations in `apps/api/src/app.ts` on 2026-10-09. `LID` means a location identifier; `TID` a tenant; `OID` an order; and `RID` a route/request/report identifier. All mutation bodies are JSON unless the route is the upload endpoint.

| Method | Path | Access / role | Tenant scope and ownership check | State / sensitive behavior | Expected denial |
|---|---|---|---|---|---|
| GET | `/api/health` | Public | None | Health only | N/A |
| GET | `/api/ready` | Public | None | Database readiness | 503 when unavailable |
| GET | `/api/runtime-config` | Public | None | Public client config | N/A |
| GET | `/api/templates` | Public | None | Public templates | N/A |
| POST | `/api/auth/register` | Public | New account and tenant | Account creation | 400/409 |
| POST | `/api/auth/login` | Public | User credentials | Session creation | 400/401 |
| POST | `/api/auth/logout` | Public/session optional | Current token only | Session revocation | N/A |
| POST | `/api/auth/recovery` | Public | Email lookup, generic response | Sends reset email | 400 |
| POST | `/api/auth/reset` | Public reset token | Token hash and expiry | Password/session state change | 400 |
| POST | `/api/auth/request-verification` | Authenticated | Current user | Sends verification email | 401/429 |
| POST | `/api/auth/verify` | Public verification token | Token hash and expiry | Verifies email | 400 |
| GET | `/api/me` | Authenticated | Current user memberships | Account and tenant summary | 401 |
| POST | `/api/locations` | Owner | `tenantId` membership | Creates location | 401/403/402/409 |
| PUT | `/api/locations/:lid` | Owner/manager | Location resolves before membership | Profile/publish update with version | 401/403/404/409 |
| PATCH | `/api/locations/:lid/onboarding` | Owner/manager | Location resolves before membership | Onboarding update | 401/403/404 |
| GET | `/api/locations/:lid` | Member | Location resolves before membership | Private location/menu view | 401/403/404 |
| GET | `/api/locations/:lid/menu` | Member | Location membership | Private menu | 401/403/404 |
| POST | `/api/locations/:lid/menu/categories` | Owner/manager | Location membership | Category create | 401/403/404 |
| PATCH | `/api/locations/:lid/menu/categories/:cid` | Owner/manager | Category repository scopes `cid` by `lid` | Category update | 401/403/404 |
| DELETE | `/api/locations/:lid/menu/categories/:cid` | Owner/manager | Category repository scopes `cid` by `lid` | Category archive | 401/403/404 |
| POST | `/api/locations/:lid/items` | Owner/manager | Location membership | Item/structure create | 401/403/404 |
| PUT | `/api/locations/:lid/items/:iid` | Owner/manager | Item repository scopes `iid` by `lid` | Item update | 401/403/404 |
| DELETE | `/api/locations/:lid/items/:iid` | Owner/manager | Item repository scopes `iid` by `lid` | Item archive | 401/403/404 |
| GET | `/api/locations/:lid/tables` | Member | Location membership | Table list | 401/403/404 |
| POST | `/api/locations/:lid/tables` | Owner/manager | Location membership | Table create/opaque token | 401/403/404 |
| PATCH | `/api/locations/:lid/tables/:tid` | Owner/manager | Table repository scopes `tid` by `lid` | Table update | 401/403/404 |
| DELETE | `/api/locations/:lid/tables/:tid` | Owner/manager | Table repository scopes `tid` by `lid` | Table disable | 401/403/404 |
| GET | `/api/locations/:lid/tables/:tid/history` | Member | History repository scopes location/table | Historical orders | 401/403/404 |
| POST | `/api/locations/:lid/menu/items/:iid/variants` | Owner/manager | Item existence is location-scoped | Variant create | 401/403/404 |
| PATCH | `/api/locations/:lid/menu/variants/:vid` | Owner/manager | Variant query joins location | Variant update | 401/403/404 |
| POST | `/api/locations/:lid/menu/modifier-groups` | Owner/manager | Location membership | Group create | 401/403/404 |
| POST | `/api/locations/:lid/menu/modifier-groups/:gid/modifiers` | Owner/manager | Group existence is location-scoped | Modifier create | 401/403/404 |
| PATCH | `/api/locations/:lid/menu/modifiers/:mid` | Owner/manager | Modifier query joins location | Modifier update | 401/403/404 |
| GET | `/api/media/:tenant/:asset` | Public/local media route | Filename regex and resolved path | Media read | 404 |
| POST | `/api/locations/:lid/upload` | Owner/manager | Location membership; generated storage key | Image upload/update | 401/403/400/413 |
| GET | `/api/locations/:lid/routes` | Member | Location membership | Payment route metadata | 401/403/404 |
| POST | `/api/locations/:lid/routes` | Owner | Location membership; verified email | Draft route create | 401/403/404 |
| POST | `/api/locations/:lid/routes/:rid/request-verification` | Owner | Route scoped by location | Verification workflow | 401/403/404/409 |
| POST | `/api/locations/:lid/routes/:rid/activate` | Owner | Verified route scoped by location | Active route switch | 401/403/404/409 |
| POST | `/api/locations/:lid/routes/rollback` | Owner | Location membership and route IDs scoped | Active route rollback | 401/403/404/409 |
| POST | `/api/locations/:lid/routes/:rid/disable` | Owner | Route scoped by location | Route disable | 401/403/404/409 |
| GET | `/api/public/:slug` | Public | Published location lookup by slug/publicId; optional table token scoped to location | Public hub/menu/table context | 404/409 |
| GET | `/api/public/:slug/qr` | Public | Published location; table token scoped | Public QR artwork | 404/409 |
| POST | `/api/public/:slug/events` | Public | Published location | Analytics event write | 404/400 |
| GET | `/api/locations/:lid/qr` | Member | Location membership; table ID scoped | Merchant QR artwork | 401/403/404/409 |
| POST | `/api/public/:slug/orders` | Public | Published location; all live items/variants/modifiers checked against location | Order creation | 400/404/409 |
| GET | `/api/orders/:oid` | Public order token | Requires exact `x-order-token` for order | Order view | 404 |
| GET | `/api/public/orders/:token` | Public opaque tracking token | Exact tracking token | Public order view | 404 |
| GET | `/api/locations/:lid/orders` | Member | Location membership | Merchant orders | 401/403/404 |
| POST | `/api/locations/:lid/orders/:oid/state` | Member | Transition query scopes order by location | Order lifecycle | 401/403/404/409 |
| POST | `/api/orders/:oid/payments` | Public order token | Exact order token; amount read from order | Order-linked payment attempt | 404/409 |
| POST | `/api/public/:slug/payments` | Public | Active route belongs to published location | General payment attempt | 400/404/409 |
| POST | `/api/locations/:lid/orders/:oid/confirm-payment` | Owner/manager | Order update scopes by location | Merchant confirmation | 401/403/409 |
| POST | `/api/public/:slug/requests` | Public | Published location | Service request write | 400/404/409 |
| GET | `/api/locations/:lid/requests` | Member | Location membership | Merchant request list | 401/403/404 |
| POST | `/api/locations/:lid/requests/:rid/close` | Member | Close query scopes location/request | Request state change | 401/403/404 |
| GET | `/api/locations/:lid/analytics` | Owner/manager | Location membership and entitlement | Analytics read | 401/402/403/404 |
| GET | `/api/locations/:lid/audit` | Owner | Location membership / tenant audit scope | Audit read | 401/403/404 |
| GET | `/api/tenants/:tid/staff` | Owner | Tenant membership | Staff list | 401/403 |
| POST | `/api/tenants/:tid/staff` | Owner | Tenant membership and staff entitlement | Membership upsert | 401/403/402/404/409 |
| DELETE | `/api/tenants/:tid/staff/:uid` | Owner | Tenant membership; owner protected | Membership removal | 401/403/404 |
| POST | `/api/push` | Authenticated | Device token bound to current user | Token registration | 401/400 |
| DELETE | `/api/push` | Authenticated | Deletes current user tokens | Token deactivation | 401 |
| POST | `/api/public/:slug/report` | Public | Report location is published slug target | Report creation | 400/404 |
| GET | `/api/account/export` | Authenticated owner context | Only current user-owned tenants | Export | 401 |
| POST | `/api/account/delete` | Authenticated + password | Current user; owner tenant deletion policy | Account deletion transaction | 401/400 |
| GET | `/api/admin/accounts` | Admin/support read | Platform-wide admin role | Sensitive account lookup + audit | 401/403 |
| GET | `/api/admin/plans` | Admin/support read | Platform-wide admin role | Plan metadata | 401/403 |
| PUT | `/api/admin/plans/:pid` | Admin only | Validated plan ID | Plan mutation | 401/403/400 |
| GET | `/api/admin/tenants/:tid` | Admin/support read | Platform-wide admin role | Tenant operational view | 401/403/404 |
| POST | `/api/admin/tenants/:tid/notes` | Admin/support read/write per current role model | Valid tenant | Support note | 401/403/404 |
| POST | `/api/admin/tenants/:tid/billing` | Admin only | Valid tenant/plan | Billing mutation | 401/403/404 |
| POST | `/api/admin/routes/:rid/verify` | Admin only + independent verifier | Route state and verifier not tenant member | Payment route verification | 401/403/409 |
| POST | `/api/admin/reports/:rid/resolve` | Admin only | Report target loaded before update | Report resolution/unpublish | 401/403/404 |

## Review notes

- The matrix is based on source registration, not only frontend visibility.
- IDs are not treated as authorization: repository queries must scope child IDs by their location/tenant.
- Public order access intentionally uses opaque order tokens; merchant access uses authenticated location membership.
- The QR print view requires a separate XSS review because it creates an HTML document with business-controlled text.
