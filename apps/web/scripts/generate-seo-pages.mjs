import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const template = await readFile(join(dist, "index.html"), "utf8");
const origin = "https://1qrprime.com";

const pages = {
  "/features": ["One QR Business Platform: Menu, Orders, Payments & Staff | 1QR Prime", "Run menus, orders, tables, payment destinations, staff access, analytics and customer actions behind one permanent QR."],
  "/pricing": ["1QR Prime Pricing — One Master QR from ₹599/month", "See launch pricing for 1QR Prime, the permanent master QR workspace for restaurants, cafés and hotels."],
  "/restaurants": ["Restaurant QR Menu & Ordering System in India | 1QR Prime", "Create one permanent restaurant QR for digital menus, table ordering, UPI payment handoff, staff workflows and customer actions."],
  "/cafes": ["QR Menu & Ordering System for Cafés | 1QR Prime", "Give café guests one fast QR for your live menu, ordering, payment actions and updates without reprinting the code."],
  "/hotels": ["Hotel Guest QR: Menu, Service & Customer Actions | 1QR Prime", "Use one permanent hotel guest QR for menus, information, service actions and a cleaner mobile guest experience."],
  "/blog": ["QR Menu, Ordering & Restaurant Growth Guides | 1QR Prime", "Practical guides on dynamic QR menus, restaurant ordering, UPI handoffs and better mobile customer experiences."],
  "/contact": ["Contact 1QR Prime", "Talk to the 1QR Prime team about one-QR business rollouts, support or a custom requirement."],
  "/support": ["1QR Prime Support", "Get practical help with your 1QR Prime workspace, customer QR, orders, menu or payment setup."],
  "/privacy": ["Privacy Policy | 1QR Prime", "How 1QR Prime handles merchant account, business, customer-page and operational data."],
  "/terms": ["Terms of Service | 1QR Prime", "Terms for using the 1QR Prime merchant workspace and public business QR services."],
  "/blog/qr-code-menu-for-restaurants": ["QR Code Menu for Restaurants: What Actually Matters | 1QR Prime", "A practical guide to restaurant QR menus that stay fast, editable and useful after the code has been printed."],
  "/blog/how-to-create-digital-menu-qr-code": ["How to Create a Digital Menu QR Code | 1QR Prime", "Learn how to create a digital menu QR that remains stable while prices, availability and menu content change."],
  "/blog/qr-ordering-for-restaurants": ["QR Ordering for Restaurants: A Practical Guide | 1QR Prime", "Understand the customer journey, table context and staff workflow behind a useful restaurant QR ordering system."],
  "/blog/dynamic-vs-static-qr-menu": ["Dynamic vs Static QR Menu: Which Should Restaurants Use? | 1QR Prime", "Compare static and dynamic restaurant QR menus, including reprints, ownership, speed and long-term maintenance."],
  "/blog/upi-qr-ordering-restaurants-india": ["UPI and QR Ordering for Restaurants in India | 1QR Prime", "A safer way to design restaurant UPI and QR ordering handoffs without confusing app opens with confirmed payments."],
  "/blog/qr-menu-for-cafes": ["QR Menus for Cafés Without a Bad Customer Experience | 1QR Prime", "How cafés can use fast mobile QR menus and ordering while keeping the customer experience simple and human."],
  "/blog/dynamic-restaurant-menu-no-reprint": ["One QR, No Reprints: Dynamic Restaurant Menus | 1QR Prime", "Why a permanent dynamic QR lets restaurants update menus, availability and customer actions without replacing table codes."],
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const replaceTag = (html, pattern, replacement) =>
  pattern.test(html) ? html.replace(pattern, replacement) : html.replace("</head>", `${replacement}\n</head>`);

for (const [route, [title, description]] of Object.entries(pages)) {
  const canonical = `${origin}${route}`;
  let html = template;

  html = replaceTag(html, /<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = replaceTag(html, /<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${escapeHtml(description)}"/>`);
  html = replaceTag(html, /<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonical}"/>`);
  html = replaceTag(html, /<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${escapeHtml(title)}"/>`);
  html = replaceTag(html, /<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${escapeHtml(description)}"/>`);
  html = replaceTag(html, /<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${canonical}"/>`);
  html = replaceTag(html, /<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${escapeHtml(title)}"/>`);
  html = replaceTag(html, /<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${escapeHtml(description)}"/>`);

  const schema = {
    "@context": "https://schema.org",
    "@type": route.startsWith("/blog/") ? "BlogPosting" : "WebPage",
    name: title,
    headline: route.startsWith("/blog/") ? title : undefined,
    description,
    url: canonical,
    mainEntityOfPage: canonical,
    isPartOf: { "@type": "WebSite", name: "1QR Prime", url: origin },
    publisher: { "@type": "Organization", name: "1QR Prime", url: origin },
    inLanguage: "en-IN",
  };
  const schemaTag = `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
  html = html.replace(/<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/i, schemaTag);

  const target = join(dist, route.slice(1), "index.html");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html, "utf8");
}

console.log(`Generated ${Object.keys(pages).length} route-specific SEO HTML documents.`);
