# 1QR Prime design system

The platform shell uses a quiet, dark operations-console language: near-black foundations, neutral elevated surfaces, one restrained brand accent, and typography that prioritises scanability. Customer pages remain business-branded and do not inherit merchant-console tokens.

## Tokens

```css
--platform-bg: #050505;
--platform-surface: #0a0a0a;
--platform-surface-2: #111111;
--platform-surface-3: #171717;
--platform-line: rgba(255,255,255,.09);
--platform-line-strong: rgba(255,255,255,.15);
--platform-text: #f7f7f5;
--platform-muted: #969692;
--platform-accent: #dce7b0;
--platform-danger: #ffb8b8;
```

Spacing uses a 4px base: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Card padding is 24px desktop and 20px mobile. Interactive controls are at least 44px tall.

Radii: 8px for fields, 12px for controls, 16px for cards, 20px for hero surfaces, 999px for pills. Shadows stay soft and black; no neon glow or decorative gradient is used in the merchant shell.

Typography uses DM Sans for body/UI and Manrope for headings. Page titles are 30–36px desktop and 26–30px mobile; section headings are 18–22px; metadata is 12–13px. Body line-height is 1.55–1.65.

Breakpoints: 640px mobile, 900px compact tablet, 1180px desktop workspace. The sidebar collapses to a bottom navigation on small screens. `prefers-reduced-motion` disables transitions and shimmer.

## Component rules

- Use `primary` for one clear page action; use `secondary` for supporting actions.
- Prefer inline progress (`Saving…`, `Publishing…`) over global spinners for mutations.
- Empty states include a concise explanation and a next action.
- Errors are actionable and never expose raw SQL, stack traces, or credentials.
- Dialogs must have a labelled title, Escape/back dismissal, visible focus, and a 44px close target.
- Tables become cards or intentional horizontal scroll below 768px.
- Skeletons reserve the final layout dimensions to prevent content shift.

## Surface hierarchy

`background → surface → surface-2 → surface-3`. Borders define boundaries; they do not decorate every nested element. Blur is reserved for fixed navigation, command surfaces, and modal layers.
