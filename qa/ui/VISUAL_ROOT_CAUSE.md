# Visual root cause

The root URL was still owned by the authenticated bootstrap in `apps/web/src/main.tsx`. Unauthenticated visitors were sent directly to `Auth`; there was no rendered marketing route layer. The existing dark design tokens were therefore visible only inside the merchant console/auth screens, not on a public product page. The new public surface is now a dedicated route layer (`apps/web/src/marketing.tsx`) with its own scoped stylesheet, while `/login`, `/signup`, `/b/:slug`, `/q/:publicId`, recovery and the private console retain their existing behavior.

The baseline before screenshot is `qa/marketing-v1/before/root-auth.png`. Final screenshots belong under `qa/marketing-v1/web/`.
