import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = new URL(".", import.meta.url);
const dist = fileURLToPath(new URL("../dist/", here));
const src = fileURLToPath(new URL("../src/", here));
const templatePath = join(dist, "index.html");
let template = await readFile(templatePath, "utf8");
const origin = "https://1qrprime.com";
const published = "2026-10-23";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const replaceTag = (html, pattern, replacement) =>
  pattern.test(html) ? html.replace(pattern, replacement) : html.replace("</head>", `${replacement}\n</head>`);

const googleVerification = String(process.env.GOOGLE_SITE_VERIFICATION || "").trim();
if (googleVerification) {
  template = replaceTag(
    template,
    /<meta\s+name=["']google-site-verification["'][^>]*>/i,
    `<meta name="google-site-verification" content="${escapeHtml(googleVerification)}"/>`,
  );
}
template = replaceTag(template, /<link\s+rel=["']describedby["'][^>]*>/i, '<link rel="describedby" href="/llms.txt"/>');
template = replaceTag(
  template,
  /<link\s+rel=["']alternate["'][^>]*type=["']application\/rss\+xml["'][^>]*>/i,
  '<link rel="alternate" type="application/rss+xml" title="1QR Prime Journal" href="/blog/feed.xml"/>',
);
await writeFile(templatePath, template, "utf8");

const corePages = {
  "/features": ["One QR Business Platform: Menu, Orders, Payments & Staff | 1QR Prime", "Run menus, orders, tables, payment destinations, staff access, analytics and customer actions behind one permanent QR."],
  "/pricing": ["1QR Prime Pricing — One Master QR from ₹599/month", "See launch pricing for 1QR Prime, the permanent master QR workspace for restaurants, cafés and hotels."],
  "/restaurants": ["Restaurant QR Menu & Ordering System in India | 1QR Prime", "Create one permanent restaurant QR for digital menus, table ordering, UPI payment handoff, staff workflows and customer actions."],
  "/cafes": ["QR Menu & Ordering System for Cafés | 1QR Prime", "Give café guests one fast QR for your live menu, ordering, payment actions and updates without reprinting the code."],
  "/hotels": ["Hotel Guest QR: Menu, Service & Customer Actions | 1QR Prime", "Use one permanent hotel guest QR for menus, information, service actions and a cleaner mobile guest experience."],
  "/blog": ["QR Menu, Restaurant Software & Ordering Guides | 1QR Prime", "Practical guides covering restaurant QR menus, ordering systems, restaurant software, UPI and customer experience."],
  "/contact": ["Contact 1QR Prime", "Talk to the 1QR Prime team about one-QR business rollouts, support or a custom requirement."],
  "/support": ["1QR Prime Support", "Get practical help with your 1QR Prime workspace, customer QR, orders, menu or payment setup."],
  "/privacy": ["Privacy Policy | 1QR Prime", "How 1QR Prime handles merchant account, business, customer-page and operational data."],
  "/terms": ["Terms of Service | 1QR Prime", "Terms for using the 1QR Prime merchant workspace and public business QR services."],
};

const legacyArticles = {
  "qr-code-menu-for-restaurants": ["QR Code Menu for Restaurants: The Complete Guide for 2026", "A practical guide to digital menus, permanent QR codes, ordering workflows and the details that make the experience work for guests and staff."],
  "how-to-create-digital-menu-qr-code": ["How to Create a Digital Menu QR Code for Your Restaurant", "A step-by-step walkthrough for creating a digital menu QR that guests can actually use."],
  "qr-ordering-for-restaurants": ["QR Ordering for Restaurants: How It Works and When It Makes Sense", "Understand the guest flow, staff workflow and operational trade-offs before adding QR ordering."],
  "dynamic-vs-static-qr-menu": ["Dynamic vs Static QR Codes for Restaurant Menus", "The difference is not the printed square. It is what you can safely change after printing."],
  "upi-qr-ordering-restaurants-india": ["UPI and QR Ordering: A Practical Guide for Restaurants in India", "Design a safer UPI handoff that is clear about what the payment app confirms—and what it does not."],
  "qr-menu-for-cafes": ["How Cafés Can Use QR Menus Without Ruining the Customer Experience", "A calm, fast QR menu can support a café without turning the counter into a technical support desk."],
  "dynamic-restaurant-menu-no-reprint": ["One QR, No Reprints: Why Restaurants Are Moving to Dynamic Menus", "A permanent QR gives a restaurant room to improve the experience behind the printed code."],
};

const landingSource = await readFile(join(src, "seo-landings.ts"), "utf8");
const landingPattern = /"(\/[^"]+)":\s*\{\s*title:\s*"([^"]+)",\s*description:\s*"([^"]+)"/g;
const landingPages = {};
for (const match of landingSource.matchAll(landingPattern)) landingPages[match[1]] = [match[2], match[3]];

const articleSource = await readFile(join(src, "seo-articles.ts"), "utf8");
const articlePattern = /slug:\s*"([^"]+)"[\s\S]*?title:\s*"([^"]+)"[\s\S]*?description:\s*"([^"]+)"[\s\S]*?published:\s*d,\s*updated:\s*d,/g;
const generatedArticles = {};
for (const match of articleSource.matchAll(articlePattern)) generatedArticles[match[1]] = [match[2], match[3]];

const pages = { ...corePages, ...landingPages };
const articles = { ...legacyArticles, ...generatedArticles };

function renderRoute(path, title, description, { article = false } = {}) {
  const canonical = `${origin}${path}`;
  let html = template;

  html = replaceTag(html, /<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = replaceTag(html, /<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${escapeHtml(description)}"/>`);
  html = replaceTag(html, /<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonical}"/>`);
  html = replaceTag(html, /<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${escapeHtml(title)}"/>`);
  html = replaceTag(html, /<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${escapeHtml(description)}"/>`);
  html = replaceTag(html, /<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${canonical}"/>`);
  html = replaceTag(html, /<meta\s+property=["']og:type["'][^>]*>/i, `<meta property="og:type" content="${article ? "article" : "website"}"/>`);
  html = replaceTag(html, /<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${escapeHtml(title)}"/>`);
  html = replaceTag(html, /<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${escapeHtml(description)}"/>`);

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: article
      ? [
          { "@type": "ListItem", position: 1, name: "Journal", item: `${origin}/blog` },
          { "@type": "ListItem", position: 2, name: title, item: canonical },
        ]
      : [
          { "@type": "ListItem", position: 1, name: "1QR Prime", item: origin },
          { "@type": "ListItem", position: 2, name: title, item: canonical },
        ],
  };

  const primary = article
    ? {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: title,
        description,
        url: canonical,
        mainEntityOfPage: canonical,
        datePublished: published,
        dateModified: published,
        author: { "@type": "Organization", name: "1QR Prime Editorial Team", url: `${origin}/about` },
        publisher: { "@type": "Organization", name: "1QR Prime", url: origin },
        inLanguage: "en-IN",
      }
    : {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: title,
        description,
        url: canonical,
        isPartOf: { "@type": "WebSite", name: "1QR Prime", alternateName: ["1QRPrime", "1 QR Prime", "One QR Prime"], url: origin },
        inLanguage: "en-IN",
      };

  const schemaTag = `<script type="application/ld+json">${JSON.stringify([primary, breadcrumb])}</script>`;
  html = html.replace(/<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/i, schemaTag);
  return html;
}

for (const [route, [title, description]] of Object.entries(pages)) {
  const target = join(dist, route.slice(1), "index.html");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, renderRoute(route, title, description), "utf8");
}

for (const [slug, [title, description]] of Object.entries(articles)) {
  const route = `/blog/${slug}`;
  const target = join(dist, "blog", slug, "index.html");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, renderRoute(route, title, description, { article: true }), "utf8");
}

console.log(`Generated ${Object.keys(pages).length} public page documents and ${Object.keys(articles).length} article documents.`);
