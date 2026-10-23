# Marketing SEO report

Public routes now have route-specific titles, descriptions, canonical URLs and Open Graph metadata through `apps/web/src/marketing.tsx`. `robots.txt` and `sitemap.xml` are served from the Vite public directory and exclude private/auth routes.

| Route | Intent | H1 / schema | Indexability |
|---|---|---|---|
| `/` | QR menu for restaurants | One QR. Your whole business. / WebApplication | index |
| `/features` | product features | One QR. More control. | index |
| `/pricing` | QR menu pricing | One clear plan to start well. / Product | index |
| `/restaurants` | restaurant QR ordering | A faster path from table to service. | index |
| `/cafes` | café QR menu | A menu that feels as considered as your space. | index |
| `/hotels` | hotel guest QR page | Useful information, one thoughtful scan. | index |
| `/blog/*` | educational search intent | article title / BlogPosting pending prerender | index |
| `/login`, `/signup`, `/recovery` | account actions | private/auth | noindex via robots |

The current Vite SPA updates metadata client-side. If server-side source HTML is required for search launch, prerender these public routes in deployment; the content is already isolated and deterministic for that next step.
