# 1QR Prime staff model

## Identity and tenant boundary

- `users` is the authentication identity.
- `tenants` is the merchant workspace.
- `memberships` connects a user to a tenant and carries the role plus a JSON permission snapshot.
- Locations belong to tenants; a location ID never replaces the tenant membership check.

## Roles

| Role | Intended capability |
|---|---|
| Owner | Full tenant administration, plan selection, staff management, payment-change approval, and destructive account actions. |
| Manager | Operational work according to the membership permission snapshot; never ownership, billing, destructive account actions, or owner approval. |
| Staff | Narrow operational work according to the membership permission snapshot. |

The server remains authoritative. Navigation visibility is only a usability layer.

## Permission domains

Permission keys are namespaced and stored on the membership created from an invitation:

- `orders.view`, `orders.update`
- `menu.view`, `menu.edit`
- `tables.view`, `tables.edit`
- `analytics.view`
- `customer_page.view`, `customer_page.edit`
- `payments.view`, `payments.request_change`
- `staff.view`, `staff.manage`
- `business.view`, `business.edit`

The current high-risk operations continue to require owner authorization explicitly. In particular, plan changes, account deletion, and payment-route owner approval are not granted by client-supplied permission JSON.

## Invitation lifecycle

`pending → accepted` or `pending → revoked/expired`.

Only a SHA-256 token hash is persisted. Raw tokens are sent in the HTTPS invitation link, expire after 72 hours, and cannot be reused. Existing accounts must authenticate as the invited email before accepting; new invitees create a password through the acceptance flow.

## Activity

Successful web/native sessions create a minimized `login_events` record and update `last_login_at` / `last_active_at`. Passwords, bearer tokens, reset tokens, and authorization headers are never stored in activity records.
