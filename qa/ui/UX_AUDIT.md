# 1QR Prime UI/UX audit

Date: 2026-10-09

## Current architecture

- Merchant web UI is a single React entrypoint in `apps/web/src/main.tsx` with a shared stylesheet in `style.css`.
- Native merchant UI is a single Expo/React Native entrypoint in `apps/mobile/App.tsx` with shared style objects.
- API routes are registered in `apps/api/src/app.ts`; existing repositories and authorization helpers remain the source of truth.

## Findings and treatment

| Surface | Current issue | Treatment |
|---|---|---|
| Auth | Registration is visually clear but ends immediately in workspace creation; no explicit plan decision | Add a final plan step backed by the plan catalogue and a pending activation state |
| Bootstrap | Plain text loading state | Replace with branded skeleton/boot surface |
| Navigation | Dense sidebar and all modules shown together | Preserve route model, improve grouping, active state, and compact mobile navigation |
| Overview | Useful data but mixed hierarchy | Strengthen hero, stats, next steps, and operational order desk |
| Menu/Tables/Orders | Existing functionality is broad; mutations need stronger progress/error feedback | Standardise inline busy states, empty states, and responsive cards |
| Payments | Draft language is ambiguous | Use explicit pending owner approval / verification language; preserve server-side gates |
| Staff | Owner-only membership management exists but invitation workflow is limited | Keep permission checks server-side and extend the workflow additively |
| Admin | Existing support console is functional but sparse | Improve account/tenant detail hierarchy without exposing secrets |
| Native app | Broad single-file screen model; styles are inconsistent in density | Preserve navigation and API contract, improve loading, buttons, field ergonomics, and status surfaces |
| Customer page | Business-branded surface is separate from platform shell | Keep separation; only refine spacing and action hierarchy |

## QA matrix

Responsive targets: 375, 390, 430, 768, 1024, 1280, 1440px. Critical checks: no horizontal overflow, 44px controls, keyboard-safe forms, visible focus, reduced motion, and actionable loading/error/empty states.
