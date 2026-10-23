# Visual rebuild root-cause record

## Why earlier changes were easy to miss

The product did not have a single visual runtime. It has two active stylesheet systems (`style.css` for auth/merchant/customer and `marketing.css` for public marketing), while most authenticated screens are still rendered inside one large `main.tsx` component. Changes to onboarding and marketing therefore did not automatically propagate to the verification callback, merchant screens, admin console, or public customer route.

The verification waiting page was also a one-line component with its own older content hierarchy, while `/verify` was rendered by `Recovery` using a separate `customer-wrap` + `card` shell. That produced two visibly unrelated authentication experiences. The merchant shell similarly retained older screen-specific surfaces even after global tokens were introduced.

The active app was confirmed by the local browser at `http://127.0.0.1:5173/`: marketing renders through `MarketingRouter`, while `/login`, `/signup`, recovery, verification, onboarding, merchant and admin routes render through `App` in `main.tsx`. The current work therefore targets these active render paths and their active stylesheets, rather than dormant components.

## Current design issues being addressed

- Auth and callback screens use inconsistent shells and card geometry.
- Onboarding is nested inside the auth card instead of owning a wider setup composition.
- Plan price typography can collapse into an unreadable inline row.
- Merchant/admin data surfaces use inconsistent density, borders and hierarchy.
- Customer surfaces need a clear separation between brand content and merchant operations.
