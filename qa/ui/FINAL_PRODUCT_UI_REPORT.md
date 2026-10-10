# 1QR Prime final product UI rebuild report

## Scope

This pass rebuilt the active merchant platform surface instead of adding another override layer. The web shell, authentication, onboarding, portfolio, dashboard, operations screens, QR, payments, staff, profile/settings, admin console, and public customer surface were rendered locally and screenshot-checked. The native shell was rebuilt from the same dark surface language and installed on TECNO KN3.

## Visual root cause

See [VISUAL_ROOT_CAUSE.md](./VISUAL_ROOT_CAUSE.md). The previous experience was not visibly transformed because a monolithic active renderer remained attached to a legacy 1,400-line cascade. New tokens were being overridden by later light rules, and native used an entirely separate style system.

## Web screenshots inspected

Captured at 1440×1000 unless noted:

- `final/web/login.png` — rebuilt auth split layout with restrained ambient lighting and glass form panel.
- `final/web/signup.png` — authenticated onboarding shell with new sidebar, topbar, elevated step card, and controlled form hierarchy.
- `final/web/home.png` — portfolio command center with compact metrics and business card.
- `final/web/orders.png` — operational order desk with status controls and designed empty state.
- `final/web/menu.png` — two-column menu workspace with empty state and structured editor.
- `final/web/tables.png`, `final/web/payments.png`, `final/web/staff.png`, `final/web/qr.png`, `final/web/profile.png`, `final/web/settings.png`.
- `final/web/admin-dashboard.png` — restricted audited support console.

Additional rendered evidence captured during the final review is under
`rebuild-after/`: plan selection, customer-page editor, and the searched admin
account detail view. These were opened in the local production-shaped browser
session and visually inspected, not inferred from source.

The rendered screenshots show a material change from the baseline: the shell is black-first, navigation is compact and bounded, cards use solid elevation rather than global glass, controls share 10–14px radii, and empty states use quiet dashed containers rather than generic blank space.

## Public screenshots inspected

- `final/public/customer-page.png`
- `final/public/menu.png`

## Public surface follow-up

The customer renderer was upgraded after the earlier screenshot set: the hero now supports a cover-led identity layout, the header becomes a compact frosted bar, actions collapse into a primary menu action plus compact secondary controls, categories are sticky and data-driven, menu rows use consumer-oriented spacing, and the cart becomes a floating review bar above the safe area. The merchant dashboard theme does not define these public surfaces.

The marketing home was re-rendered at 390px and inspected as `final/web/marketing-home-mobile.png`; it retains the editorial product site rather than redirecting anonymous visitors into authentication.

The public customer route remains `/q/{publicId}` for permanent QR identity and `/b/{slug}` for the friendly business alias. No API, order, payment, or QR identity contract was changed in this visual follow-up.

## Brand assets

- `/favicon.ico` now serves a multi-size 16/32/48 icon.
- `/favicon.svg` remains available for modern browsers.
- `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`, and `/manifest.webmanifest` were added.
- Local HTTP checks returned 200 for the favicon and manifest.

The customer surface remains business-branded and light when the merchant has chosen a light appearance, with a structured hero, brand mark, status, address, menu search, and customer actions. Platform chrome is not leaked into the storefront.

Follow-up customer evidence was rendered at 390×844 with a realistic café fixture:

- `final/public/customer-home-rebuild.png` — identity hero, compact action rail and primary menu CTA.
- `final/public/customer-page-rebuild.png` — menu-first business route with search, category tabs and item rows.

The fixture was injected only into the local browser request for visual review; no production or persistent merchant data was created.

## Android screenshots inspected

Captured at 720×1600 on TECNO KN3:

- `final/android/launch.png`
- `final/android/after-bootstrap.png`
- `final/android/orders.png`
- `final/android/menu.png`
- `final/android/qr.png`
- `final/android/more.png`

The completed authenticated device set is also available in
`rebuild-after/android/`: home, orders, menu, QR, More, payments, staff,
profile, and settings, plus the inspected contact sheet.

The native shell now removes the decorative star field, uses a restrained black surface, compact merchant header, pale production badge, high-contrast content cards, and a floating-feeling bottom navigation state. The rebuilt release launched successfully with no focused crash/ANR or application skipped-frame evidence.

## System changes

- Replaced the conflicting web CSS cascade with one tokenized system in `apps/web/src/style.css`.
- Added explicit platform shell/auth classes in `apps/web/src/main.tsx`.
- Added native tokens in `apps/mobile/theme.ts` and applied them to the active shell, cards, forms, and navigation primitives.
- Added scoped public/customer styling so merchant/admin surfaces and customer business branding remain separate.
- Added reduced-motion handling, visible focus states, 44px-class controls, responsive sidebar collapse, form wrapping, table overflow, and mobile-width layout rules.

## Validation

- Typecheck: PASS
- API build: PASS
- Web build: PASS
- API tests: 32 PASS, 7 PostgreSQL suites skipped because no disposable PostgreSQL service was available
- UI validation tests: 3 PASS
- Android production release: PASS through `npm run android:release`
- Android APK SHA256: `4858d6592ee7743d428f6961e7930daff4413ea0f39dddc0e7fa9b1930a65ca9`
- Android package: `in.oneqr.prime`
- Android manifest: `allowBackup=false`, `usesCleartextTraffic=false`
- DB inventory: remains expected from the prior acceptance run
- No push or deployment performed

## Known limitations

The current application still has a monolithic screen renderer and several mature workflows whose data interactions were intentionally preserved in this visual pass. A future refactor can split these into files without changing the visual contract. Full authenticated staff/admin/live-email acceptance remains a separate release gate and is not inferred from screenshots.

The device was reconnected and the authenticated Android screen set was completed: Home, Orders, Menu, QR, More, Payments, Staff, Profile, and Settings were captured at 720×1600 and inspected as `qa/ui/rebuild-after/android/contact-sheet.png`. Login, Signup, and Plan remain represented by prior form/onboarding evidence because the device was intentionally kept in the authenticated QA session rather than clearing session state. The current admin implementation is a restricted support console rather than a separate accounts/businesses navigation product; the account detail screenshot documents that actual scope.
# Final product UI report

## Public website rebuild — current pass

The root route is now a public marketing surface rather than an implicit login screen. The public layer is implemented in `apps/web/src/marketing.tsx` and scoped in `apps/web/src/marketing.css`.

### Screens covered

- Landing: editorial hero, actual product-shaped phone/browser previews, permanent QR story, restaurant journey, menu management, pricing, FAQ and final CTA.
- Product/category pages: Features, Restaurants, Cafés and Hotels.
- Pricing: Prime ₹599/month launch price with ₹1,599 reference price and custom sales path.
- Journal: index plus seven article routes.
- Contact, Support, Privacy, Terms and a polished 404.
- Auth remains explicit at `/login` and `/signup`; private console and `/q/:publicId`/`/b/:slug` routes are preserved.

### Evidence

Baseline: `qa/marketing-v1/before/root-auth.png`.

Final web evidence: `qa/marketing-v1/web/home.png`, `home-mobile.png`, `features.png`, `pricing.png`, `restaurants.png`, `blog.png`, `blog-qr-code-menu-for-restaurants.png`, `contact.png`, `privacy.png`, `terms.png`, `login.png`, `signup.png`.

Android smoke evidence: `qa/marketing-v1/android/home.png` and `qa/marketing-v1/android/logcat.txt`.

### Validation

`npm run typecheck`, `npm test` (38 pass, 7 PostgreSQL skipped), `npm run build`, and `git diff --check` pass. The canonical Android release command also completed and the APK was installed on TECNO KN3; focused logcat scan found no application crash, ANR, ReactNativeJS, cleartext or TLS errors.

### Known limitation

The web app remains a Vite SPA, so route-specific title/meta/schema are set client-side. Public content is deterministic and the sitemap/robots files are present; server-side prerendering is still recommended before SEO launch if source-HTML indexing is a hard requirement.
