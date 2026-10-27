import React, { useEffect, useRef, useState } from "react";
import { seoLandings } from "./seo-landings";
import { isPublicMarketingPath } from "./public-marketing-paths";
import {
  ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight, Menu,
  QrCode, ShoppingBag, Smartphone, Store, Wallet, Users, BarChart3,
  X, Sparkles, Layers3, ScanLine, SlidersHorizontal, ShieldCheck, Zap,
} from "lucide-react";

type Article = {
  slug: string;
  category: string;
  title: string;
  description: string;
  read: string;
  body?: React.ReactNode;
  keywords?: string[];
  published?: string;
  updated?: string;
  intro?: string;
  sections?: Array<{ title: string; paragraphs: string[] }>;
  takeaways?: string[];
  faq?: Array<{ q: string; a: string }>;
};

const articles: Article[] = [
  {
    slug: "qr-code-menu-for-restaurants", category: "Restaurant operations", read: "9 min read",
    title: "QR Code Menu for Restaurants: The Complete Guide for 2026",
    description: "A practical guide to digital menus, permanent QR codes, ordering workflows and the details that make the experience work for guests and staff.",
    body: <><p>A QR code menu is more than a PDF behind a square. The best restaurant QR experience gives a guest a fast path from table to menu, keeps information current, and gives the team a simple way to operate the day.</p><h2>What a restaurant QR menu should do</h2><p>A useful menu should open quickly on a phone, make categories easy to scan, show availability clearly, and give guests the next action without making them learn a new system. It can lead to an order, a UPI payment, a call to the counter, or a simple enquiry.</p><h2>Static versus dynamic QR codes</h2><p>A static QR code points directly to a destination that is difficult to change. A dynamic QR code points to a permanent business identity, so the destination can change behind it. This matters when a menu, payment destination, hours, or customer action changes after cards and table stickers have already been printed.</p><h2>How to set one up</h2><ol><li>Prepare a concise menu with prices, descriptions and availability.</li><li>Create the business page and choose the actions guests need.</li><li>Place the QR at tables, counters and takeaway packaging.</li><li>Test it on several phones and on a weak connection before printing.</li></ol><h2>Common mistakes</h2><p>Slow pages, tiny type, outdated prices and an unclear payment handoff make a digital menu feel unfinished. Keep the first screen useful, keep the QR permanent, and treat the customer page as a product—not a document.</p><h2>Frequently asked questions</h2><p><strong>Do customers need an app?</strong> No. A modern QR menu opens in the browser. <strong>Can the menu change later?</strong> Yes, when the QR points to a managed business page rather than a static file.</p><p>1QR Prime combines the permanent QR, customer page, menu, orders and payment destinations in one workspace. <a href="/restaurants">Explore the restaurant workflow</a> or <a href="/signup">start with Prime</a>.</p></>,
  },
  {
    slug: "how-to-create-digital-menu-qr-code", category: "Getting started", read: "7 min read",
    title: "How to Create a Digital Menu QR Code for Your Restaurant",
    description: "A step-by-step walkthrough for creating a digital menu QR that guests can actually use.",
    body: <><p>Creating a digital menu QR code is straightforward when the destination is designed before the code is printed. The durable part is the link; the menu behind it can keep improving.</p><h2>Start with the customer journey</h2><p>Decide what a guest should see after scanning: your business identity, a menu, order options, payment instructions, or a direct action such as calling the counter. Keep that first view focused.</p><h2>Build the menu</h2><p>Use clear categories, short descriptions and prices that match the counter. Add availability states so staff do not need to explain every sold-out item. Use real photography only when it helps a decision.</p><h2>Create and test the QR</h2><p>Use a dynamic destination that remains stable after printing. Test the link in camera apps, Safari and Chrome. Check table context, menu loading, accessibility and the payment handoff.</p><h2>Keep it current</h2><p>A digital menu earns its place when updates are easy. Give the team a simple editor and keep the public page fast. 1QR Prime provides the customer page and merchant controls in the same system.</p><p>See the <a href="/features">features</a> or compare the <a href="/pricing">Prime plan</a>.</p></>,
  },
  {
    slug: "qr-ordering-for-restaurants", category: "Restaurant operations", read: "8 min read",
    title: "QR Ordering for Restaurants: How It Works and When It Makes Sense",
    description: "Understand the guest flow, staff workflow and operational trade-offs before adding QR ordering.",
    body: <><p>QR ordering can remove friction from a busy service, but only when it respects the way a restaurant already works. It should make ordering clearer—not add another inbox for the team.</p><h2>The guest flow</h2><p>A guest scans a table QR, browses the menu, chooses a service mode, and submits an order. The browser keeps the experience familiar; a customer account is not required for a simple dine-in flow.</p><h2>The staff flow</h2><p>Staff need a live order list, readable states and a clear handoff. New, accepted, preparing, ready and completed should mean something operationally. Table context helps the team deliver without asking the same question again.</p><h2>When it makes sense</h2><p>QR ordering is especially useful for repeatable menus, table service and periods where counter queues are costly. It is less useful when every order requires a long conversation or frequent custom pricing.</p><h2>Make it optional</h2><p>Keep a counter or staff-assisted path available. A good system supports different guests rather than forcing every person through the same flow.</p><p>Learn how <a href="/restaurants">1QR Prime supports restaurants</a> with a permanent QR and focused operating tools.</p></>,
  },
  {
    slug: "dynamic-vs-static-qr-menu", category: "QR fundamentals", read: "6 min read",
    title: "Dynamic vs Static QR Codes for Restaurant Menus",
    description: "The difference is not the printed square. It is what you can safely change after printing.",
    body: <><p>Both static and dynamic QR codes can open a menu. The meaningful difference is whether the destination can be managed without replacing the printed code.</p><h2>Static QR codes</h2><p>A static code usually contains a destination directly. If that destination changes, the printed code may stop being useful. This is simple, but inflexible.</p><h2>Dynamic QR codes</h2><p>A dynamic code points to a stable identity managed by a service. The business can update menu content, hours, actions and payment destinations behind the same code.</p><h2>Why permanence matters</h2><p>Restaurants print QRs on table stands, menus, packaging and signage. Reprinting is expensive and operationally awkward. 1QR Prime keeps the permanent QR identity stable while the customer page evolves.</p><h2>What to check before choosing</h2><p>Check ownership, exportability, uptime, page speed, privacy and whether the public route is separate from the merchant console. A QR should never expose private management data.</p><p>Read the <a href="/blog/dynamic-restaurant-menu-no-reprint">no-reprint guide</a> or <a href="/signup">try Prime</a>.</p></>,
  },
  {
    slug: "upi-qr-ordering-restaurants-india", category: "Payments", read: "7 min read",
    title: "UPI and QR Ordering: A Practical Guide for Restaurants in India",
    description: "Design a safer UPI handoff that is clear about what the payment app confirms—and what it does not.",
    body: <><p>UPI is familiar to Indian customers, but a QR ordering experience still needs careful wording. A payment app handoff should show the payee and amount, and the merchant should verify receipt independently.</p><h2>Keep the roles clear</h2><p>Your ordering system can present a payment destination, while the payment provider handles the actual transfer. Do not ask guests for a UPI PIN, bank password or credentials inside a business page.</p><h2>Use a clear handoff</h2><p>Before opening an app, show the payee and amount. After returning, say that the payment is awaiting confirmation until the merchant or provider verifies it. Never turn a deep-link open into a fake success state.</p><h2>Protect merchant changes</h2><p>Changing a payment destination is a sensitive business action. Owner confirmation, independent verification, auditability and masked display reduce mistakes and make the workflow understandable.</p><p>See <a href="/pricing">what Prime includes</a> and learn how payment routes fit alongside the customer page.</p></>,
  },
  {
    slug: "qr-menu-for-cafes", category: "Cafés", read: "6 min read",
    title: "How Cafés Can Use QR Menus Without Ruining the Customer Experience",
    description: "A calm, fast QR menu can support a café without turning the counter into a technical support desk.",
    body: <><p>Café guests often want to decide quickly: what is available, how much it costs, and whether they can order from their seat. The page should answer those questions without feeling like a kiosk.</p><h2>Make the first screen human</h2><p>Lead with the café name, a short welcome, the menu and the most useful actions. Keep the page light enough to load on a busy mobile network.</p><h2>Use availability honestly</h2><p>Breakfast items, pastries and seasonal drinks change. Availability toggles are more useful than deleting items and rebuilding links.</p><h2>Keep the counter path</h2><p>A QR menu should complement the barista. Offer pay-at-counter and staff-assisted service when appropriate. The goal is fewer repeated questions, not less hospitality.</p><p><a href="/cafes">See the café workflow</a> or explore the <a href="/features">product features</a>.</p></>,
  },
  {
    slug: "dynamic-restaurant-menu-no-reprint", category: "QR fundamentals", read: "5 min read",
    title: "One QR, No Reprints: Why Restaurants Are Moving to Dynamic Menus",
    description: "A permanent QR gives a restaurant room to improve the experience behind the printed code.",
    body: <><p>Printing a QR is easy. Replacing every table stand when a menu changes is not. A dynamic restaurant menu separates the durable link from the content it opens.</p><h2>What stays stable</h2><p>With 1QR Prime, the permanent public QR identity remains the same. Your menu, customer actions, hours and payment destination can change in the merchant workspace.</p><h2>What improves</h2><p>Teams can respond to sold-out items, new prices and seasonal menus without asking guests to find a new link. The customer sees the latest page; the printed code keeps working.</p><h2>A practical rollout</h2><p>Start with one location and a small set of table QRs. Test the entire journey, train staff on order states, then place the code where guests naturally look.</p><p>Explore <a href="/restaurants">restaurant QR menus</a> or <a href="/signup">start with Prime</a>.</p></>,
  },
];


const marketingPages = new Set(["/", "/features", "/pricing", "/restaurants", "/cafes", "/hotels", "/blog", "/contact", "/support", "/privacy", "/terms", ...Object.keys(seoLandings)]);
const SITE_ORIGIN = "https://1qrprime.com";
const pageMeta: Record<string, { title: string; description: string; keywords?: string }> = {
  "/": {
    title: "1QR Prime — One Master QR for Menus, Orders & Payments",
    description: "1QR Prime gives restaurants, cafés and hotels one permanent master QR for digital menus, ordering, payments and customer actions.",
    keywords: "1QR Prime, one QR, master QR, restaurant QR menu, digital menu QR, QR ordering system, QR menu India",
  },
  "/features": {
    title: "One QR Business Platform: Menu, Orders, Payments & Staff | 1QR Prime",
    description: "Run menus, orders, tables, payment destinations, staff access, analytics and customer actions behind one permanent QR.",
    keywords: "business QR platform, dynamic QR menu, QR ordering, restaurant operations software",
  },
  "/pricing": {
    title: "1QR Prime Pricing — One Master QR from ₹599/month",
    description: "See launch pricing for 1QR Prime, the permanent master QR workspace for restaurants, cafés and hotels.",
  },
  "/restaurants": {
    title: "Restaurant QR Menu & Ordering System in India | 1QR Prime",
    description: "Create one permanent restaurant QR for digital menus, table ordering, UPI payment handoff, staff workflows and customer actions.",
    keywords: "restaurant QR menu India, QR ordering system, digital menu for restaurant, table QR ordering",
  },
  "/cafes": {
    title: "QR Menu & Ordering System for Cafés | 1QR Prime",
    description: "Give café guests one fast QR for your live menu, ordering, payment actions and updates without reprinting the code.",
    keywords: "cafe QR menu, digital cafe menu, cafe ordering QR",
  },
  "/hotels": {
    title: "Hotel Guest QR: Menu, Service & Customer Actions | 1QR Prime",
    description: "Use one permanent hotel guest QR for menus, information, service actions and a cleaner mobile guest experience.",
    keywords: "hotel guest QR, hotel digital menu, hotel service QR",
  },
  "/blog": {
    title: "QR Menu, Ordering & Restaurant Growth Guides | 1QR Prime",
    description: "Practical guides on dynamic QR menus, restaurant ordering, UPI handoffs and better mobile customer experiences.",
  },
  "/contact": { title: "Contact 1QR Prime", description: "Talk to the 1QR Prime team about one-QR business rollouts, support or a custom requirement." },
  "/support": { title: "1QR Prime Support", description: "Get practical help with your 1QR Prime workspace, customer QR, orders, menu or payment setup." },
  "/privacy": { title: "Privacy Policy | 1QR Prime", description: "How 1QR Prime handles merchant account, business, customer-page and operational data." },
  "/terms": { title: "Terms of Service | 1QR Prime", description: "Terms for using the 1QR Prime merchant workspace and public business QR services." },
};
Object.assign(
  pageMeta,
  Object.fromEntries(
    Object.entries(seoLandings).map(([path, page]) => [
      path,
      { title: page.title, description: page.description, keywords: page.keywords.join(", ") },
    ]),
  ),
);

function Meta({ path, article }: { path: string; article?: Article }) {
  useEffect(() => {
    const meta = article
      ? {
          title: `${article.title} | 1QR Prime`,
          description: article.description,
          keywords: article.keywords?.join(", "),
        }
      : pageMeta[path] || pageMeta["/"];
    const canonicalUrl = `${SITE_ORIGIN}${path === "/" ? "/" : path}`;
    document.title = meta.title;

    const setMeta = (selector: string, name: string, value: string) => {
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        document.head.appendChild(el);
      }
      el.setAttribute(name, value);
    };

    setMeta('meta[name="description"]', "content", meta.description);
    setMeta('meta[name="robots"]', "content", "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1");
    document.querySelector('meta[name="keywords"]')?.remove();
    setMeta('meta[property="og:title"]', "content", meta.title);
    setMeta('meta[property="og:description"]', "content", meta.description);
    setMeta('meta[property="og:type"]', "content", article ? "article" : "website");
    setMeta('meta[property="og:url"]', "content", canonicalUrl);
    setMeta('meta[property="og:site_name"]', "content", "1QR Prime");
    setMeta('meta[property="og:locale"]', "content", "en_IN");
    setMeta('meta[name="twitter:card"]', "content", "summary");
    setMeta('meta[name="twitter:title"]', "content", meta.title);
    setMeta('meta[name="twitter:description"]', "content", meta.description);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const schemaId = "marketing-schema";
    document.getElementById(schemaId)?.remove();
    const schema = document.createElement("script");
    schema.id = schemaId;
    schema.type = "application/ld+json";

    const breadcrumb = path !== "/"
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: article
            ? [
                { "@type": "ListItem", position: 1, name: "Journal", item: `${SITE_ORIGIN}/blog` },
                { "@type": "ListItem", position: 2, name: article.title, item: canonicalUrl },
              ]
            : [
                { "@type": "ListItem", position: 1, name: "1QR Prime", item: SITE_ORIGIN },
                { "@type": "ListItem", position: 2, name: meta.title, item: canonicalUrl },
              ],
        }
      : null;

    const primarySchema = article
      ? {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: article.title,
          description: article.description,
          url: canonicalUrl,
          mainEntityOfPage: canonicalUrl,
          datePublished: article.published || "2026-10-23",
          dateModified: article.updated || article.published || "2026-10-23",
          author: { "@type": "Organization", name: "1QR Prime Editorial Team", url: `${SITE_ORIGIN}/about` },
          publisher: { "@type": "Organization", name: "1QR Prime", url: SITE_ORIGIN },
          inLanguage: "en-IN",
        }
      : path === "/"
        ? [
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "1QR Prime",
              alternateName: ["1QRPrime", "1 QR Prime", "One QR Prime", "OneQR Prime"],
              url: SITE_ORIGIN,
              logo: `${SITE_ORIGIN}/apple-touch-icon.png`,
              description: "One permanent master QR for menus, orders, payments and customer actions.",
              areaServed: { "@type": "Country", name: "India" },
            },
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "1QR Prime",
              alternateName: ["1QRPrime", "1 QR Prime", "One QR Prime"],
              url: SITE_ORIGIN,
              inLanguage: "en-IN",
            },
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "1QR Prime",
              alternateName: "One QR Prime",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: SITE_ORIGIN,
              description: meta.description,
              offers: { "@type": "Offer", price: "599", priceCurrency: "INR", category: "subscription" },
            },
          ]
        : {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: meta.title,
            description: meta.description,
            url: canonicalUrl,
            isPartOf: { "@type": "WebSite", name: "1QR Prime", url: SITE_ORIGIN },
            inLanguage: "en-IN",
          };

    schema.textContent = JSON.stringify(
      Array.isArray(primarySchema)
        ? [...primarySchema, ...(breadcrumb ? [breadcrumb] : [])]
        : breadcrumb
          ? [primarySchema, breadcrumb]
          : primarySchema,
    );
    document.head.appendChild(schema);

    let describedBy = document.querySelector('link[rel="describedby"]') as HTMLLinkElement | null;
    if (!describedBy) {
      describedBy = document.createElement("link");
      describedBy.rel = "describedby";
      document.head.appendChild(describedBy);
    }
    describedBy.href = "/llms.txt";

    return () => {
      document.title = "1QR Prime — One QR. One master QR.";
    };
  }, [path, article]);
  return null;
}

function Mark() { return <span className="marketing-mark"><img src="/favicon.svg" alt="" /></span>; }
function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return <header className={`marketing-header flagship-nav ${scrolled ? "is-scrolled" : ""}`}>
    <a className="marketing-brand" href="/" aria-label="1QR Prime home"><Mark /><span>1QR <b>Prime</b></span></a>
    <nav id="marketing-navigation" className={open ? "marketing-nav open" : "marketing-nav"} aria-label="Primary navigation">
      <a href="/features">Product</a><a href="/restaurants">Solutions</a><a href="/pricing">Pricing</a><a href="/blog">Journal</a>
      <a className="mobile-only" href="/login">Sign in</a>
      <a className="mobile-only marketing-cta" href="/signup">Start with Prime <ArrowUpRight size={15} /></a>
    </nav>
    <div className="marketing-actions">
      <a className="marketing-signin" href="/login">Sign in</a>
      <a className="marketing-cta" href="/signup">Start with Prime <ArrowUpRight size={15} /></a>
      <button className="marketing-menu" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="marketing-navigation" onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
    </div>
  </header>;
}

function CursorFollower() {
  const dot = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!window.matchMedia("(pointer:fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (dot.current) dot.current.style.transform = `translate3d(${event.clientX - 6}px,${event.clientY - 6}px,0)`;
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("pointermove", move); };
  }, []);
  return <div className="marketing-cursor" ref={dot} aria-hidden="true" />;
}

function SpotlightCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <article
    className={`flagship-bento-card ${className}`}
    onPointerMove={(event) => {
      const node = event.currentTarget;
      const rect = node.getBoundingClientRect();
      node.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
      node.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
    }}
  >{children}</article>;
}

function StoryShowcase() {
  const ref = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const update = () => {
      const node = ref.current;
      if (!node || window.matchMedia("(max-width: 820px)").matches) return;
      const rect = node.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / travel));
      setActive(Math.min(2, Math.floor(progress * 3)));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  const steps = [
    { kicker: "01 · Scan", title: "A permanent front door.", copy: "One QR opens a fast customer page for menu, ordering, directions, reviews and the actions your business actually supports.", Icon: ScanLine },
    { kicker: "02 · Operate", title: "The room stays in motion.", copy: "Orders, table context, menu availability and service requests stay close to the work instead of living in disconnected tools.", Icon: Zap },
    { kicker: "03 · Evolve", title: "Change the business. Keep the QR.", copy: "Update what sits behind the printed code—menu, hours, customer actions and payment destination—without replacing the QR on the table.", Icon: Layers3 },
  ];
  return <section className="flagship-story" id="product" ref={ref}>
    <div className="flagship-story-sticky">
      <div className="flagship-story-copy">
        <span className="marketing-eyebrow">One system, two sides of the counter</span>
        <h2>The QR stays still.<br /><em>The experience keeps moving.</em></h2>
        <div className="flagship-story-steps">
          {steps.map(({ kicker, title, copy, Icon }, index) => <div className={`flagship-story-step ${active === index ? "active" : ""}`} key={title}>
            <span className="story-step-icon"><Icon size={17} /></span>
            <div><small>{kicker}</small><h3>{title}</h3><p>{copy}</p></div>
          </div>)}
        </div>
      </div>
      <div className="flagship-story-stage" aria-label="1QR Prime workflow preview">
        <div className={`story-panel customer-panel ${active === 0 ? "active" : ""}`}>
          <div className="story-browser-bar"><span/><span/><span/><b>1qrprime.com/q/cafe-prime</b></div>
          <div className="story-customer-head"><Mark /><div><strong>Cafe Prime</strong><small>Good coffee. No extra app.</small></div></div>
          <div className="story-action primary"><span>Explore menu</span><ArrowUpRight size={16}/></div>
          <div className="story-action"><span>Order at Table 6</span><ShoppingBag size={16}/></div>
          <div className="story-action"><span>Pay with UPI</span><Wallet size={16}/></div>
          <div className="story-action"><span>Leave a review</span><ArrowUpRight size={16}/></div>
        </div>
        <div className={`story-panel operator-panel ${active === 1 ? "active" : ""}`}>
          <div className="story-operator-top"><div><small>LIVE SERVICE</small><strong>Orders</strong></div><span>3 open</span></div>
          {[["#104","Table 6","2 items · ₹480","Preparing"],["#105","Table 3","1 item · ₹240","New"],["#103","Takeaway","3 items · ₹720","Ready"]].map(([id,table,meta,state]) => <div className="story-order-row" key={id}><span className="story-order-dot"/><div><strong>{id} · {table}</strong><small>{meta}</small></div><em>{state}</em></div>)}
          <div className="story-bottom-nav"><span className="active">Orders</span><span>Menu</span><span>Tables</span><span>More</span></div>
        </div>
        <div className={`story-panel evolve-panel ${active === 2 ? "active" : ""}`}>
          <div className="evolve-qr"><img src="/favicon.svg" alt="" /><span>Permanent QR</span><small>Same printed code</small></div>
          <div className="evolve-settings">
            <div><SlidersHorizontal size={16}/><span><strong>Menu & availability</strong><small>Update without reprinting</small></span><Check size={15}/></div>
            <div><Wallet size={16}/><span><strong>Payment destination</strong><small>Owner-confirmed changes</small></span><Check size={15}/></div>
            <div><Store size={16}/><span><strong>Business details</strong><small>Hours, links and actions</small></span><Check size={15}/></div>
          </div>
          <div className="evolve-note"><ShieldCheck size={17}/><span>Changes happen behind the QR. The public identity stays stable.</span></div>
        </div>
        <div className="story-progress" aria-hidden="true"><span className={active>=0?"active":""}/><span className={active>=1?"active":""}/><span className={active>=2?"active":""}/></div>
      </div>
    </div>
  </section>;
}

function BentoFeatures() {
  return <section className="flagship-bento marketing-section">
    <div className="section-heading flagship-section-heading">
      <span className="marketing-eyebrow">Built for real service, not a demo reel</span>
      <h2>Everything important.<br /><em>Nothing fighting for attention.</em></h2>
      <p>1QR Prime connects the customer-facing moment with the merchant work behind it.</p>
    </div>
    <div className="flagship-bento-grid">
      <SpotlightCard className="bento-qr">
        <div className="bento-icon"><QrCode size={21}/></div><span className="bento-kicker">PERMANENT QR</span><h3>Print once. Keep improving.</h3><p>The public QR identity stays stable while the experience behind it evolves.</p>
        <div className="bento-qr-art"><img src="/favicon.svg" alt="" /><span>1QR PRIME</span></div>
      </SpotlightCard>
      <SpotlightCard className="bento-orders">
        <div className="bento-icon"><ShoppingBag size={21}/></div><span className="bento-kicker">ORDERS + TABLES</span><h3>Context reaches the team.</h3><p>Table, order state and useful details stay attached to the work.</p>
        <div className="mini-order-stack"><span><b>Table 6</b><small>Preparing</small></span><span><b>Takeaway</b><small>Ready</small></span></div>
      </SpotlightCard>
      <SpotlightCard className="bento-payments">
        <div className="bento-icon"><Wallet size={21}/></div><span className="bento-kicker">PAYMENTS</span><h3>Clear handoff. Honest status.</h3><p>Show the configured destination and keep payment confirmation language explicit.</p>
        <div className="payment-chip"><ShieldCheck size={16}/><span><small>Destination</small><b>Owner confirmed</b></span></div>
      </SpotlightCard>
      <SpotlightCard className="bento-team">
        <div className="bento-icon"><Users size={21}/></div><span className="bento-kicker">TEAM ACCESS</span><h3>Give access with boundaries.</h3><p>Prime includes up to five non-owner staff accounts with permission-based access.</p>
        <div className="team-dots">{["A","M","R","+2"].map(x=><span key={x}>{x}</span>)}</div>
      </SpotlightCard>
      <SpotlightCard className="bento-control">
        <div className="bento-icon"><SlidersHorizontal size={21}/></div><span className="bento-kicker">CONTROL</span><h3>Your business changes in one place.</h3><p>Menu, customer page, QR, tables and business details stay connected instead of becoming separate projects.</p>
        <a href="/features" className="bento-link">Explore the product <ArrowRight size={15}/></a>
      </SpotlightCard>
    </div>
  </section>;
}

function ProductVisual() { return <div className="product-visual" aria-label="1QR Prime product preview"><div className="product-phone"><div className="product-phone-top"><span>9:41</span><span>•••</span></div><div className="product-kicker">TODAY · CAFE PRIME</div><h3>Good morning.</h3><div className="product-summary"><strong>12</strong><span>orders today</span><b>Live</b></div><div className="product-order"><span className="order-dot amber" /><div><strong>#104 · Table 6</strong><small>2 items · ₹480</small></div><em>Preparing</em></div><div className="product-order"><span className="order-dot green" /><div><strong>#103 · Takeaway</strong><small>3 items · ₹720</small></div><em>Ready</em></div><div className="product-nav"><span>⌂</span><span>◉</span><span>▦</span><span>•••</span></div></div><div className="product-browser"><div className="browser-top"><span className="browser-dot" /><span className="browser-dot" /><span className="browser-dot" /></div><div className="browser-brand"><Mark /><span>Cafe Prime</span></div><p>Fresh, simple, ready when you are.</p><div className="browser-menu"><span>Breakfast</span><b>View menu <ArrowRight size={14} /></b></div><div className="browser-menu"><span>Order at your table</span><b>Open <ArrowRight size={14} /></b></div></div></div>; }
function FeatureStrip() { return <div className="feature-strip"><div><QrCode /><span><b>Permanent QR</b><small>Print once. Keep improving.</small></span></div><div><ShoppingBag /><span><b>Orders that move</b><small>From scan to service.</small></span></div><div><Wallet /><span><b>Clear payments</b><small>UPI handoff with context.</small></span></div></div>; }

function Landing() {
  const [faq, setFaq] = useState<number | null>(null);
  const faqs = [["What is 1QR Prime?", "A merchant workspace and customer page connected by one permanent QR. Menus, orders, tables, payment destinations and team access live together."], ["Does the QR ever change?", "Your permanent /q/ QR identity is designed to stay stable while the content behind it changes."], ["Do customers need an app?", "No. Customers use the browser on their phone."], ["How many staff accounts are included?", "Prime supports up to five non-owner staff accounts with permission-based access."], ["Which businesses can use Prime?", "Prime currently focuses on restaurants, cafés and hotels. Other categories can talk to the team."], ["Does 1QR Prime process customer money?", "Payment apps and providers handle transfers. 1QR Prime presents the configured destination and keeps the status wording honest."]];
  const headline = ["One", "QR.", "The", "business", "behind", "it."];
  return <><Meta path="/" /><CursorFollower /><MarketingHeader /><main className="marketing-home flagship-home">
    <section className="marketing-hero flagship-hero">
      <div className="flagship-hero-orbit" aria-hidden="true"><span/><span/><span/></div>
      <div className="hero-copy flagship-hero-copy">
        <span className="marketing-eyebrow"><Sparkles size={14} /> One permanent QR · Built for local business</span>
        <h1 aria-label="One QR. The business behind it.">{headline.map((word,index)=><span className={index>1?"hero-word muted-word":"hero-word"} style={{"--word-index":index} as React.CSSProperties} key={word}>{word}</span>)}</h1>
        <p>Your menu, orders, payments and customer actions—connected behind one QR that stays familiar while your business keeps changing.</p>
        <div className="hero-actions">
          <a className="marketing-button light flagship-primary" href="/signup">Start with Prime <ArrowRight size={16} /></a>
          <a className="marketing-text-link flagship-secondary" href="#product">Watch the workflow <ArrowRight size={15} /></a>
        </div>
        <div className="flagship-hero-proof"><span><Check size={13}/> No customer app</span><span><Check size={13}/> Permanent public QR</span><span><Check size={13}/> ₹599/month launch price</span></div>
      </div>
      <div className="flagship-hero-visual">
        <ProductVisual />
        <div className="hero-floating-tag tag-one"><QrCode size={15}/><span><b>One QR</b><small>Same printed identity</small></span></div>
        <div className="hero-floating-tag tag-two"><Zap size={15}/><span><b>Live operations</b><small>Orders · menu · tables</small></span></div>
      </div>
    </section>

    <section className="flagship-intro">
      <span className="marketing-eyebrow">The useful part is what happens after the scan</span>
      <h2>One public moment.<br/><em>One operating system behind it.</em></h2>
      <p>Guests see a fast, focused page. Your team sees the controls that keep service moving. Both stay connected to the same permanent QR.</p>
      <FeatureStrip />
    </section>

    <StoryShowcase />
    <BentoFeatures />

    <section className="marketing-section flagship-menu-story">
      <div className="flagship-menu-copy"><span className="marketing-eyebrow">Menu management</span><h2>Your menu changes.<br /><em>Your QR doesn't.</em></h2><p>Update prices, categories and availability while the printed code on your table stays the same.</p><a className="marketing-text-link" href="/features">See all product capabilities <ArrowRight size={15}/></a></div>
      <div className="menu-window flagship-menu-window"><div className="menu-window-head"><span>Menu</span><b>+ Add item</b></div><div className="menu-line"><span className="menu-thumb warm" /><div><b>Masala omelette</b><small>Breakfast · ₹180</small></div><i>Available</i></div><div className="menu-line"><span className="menu-thumb green" /><div><b>Filter coffee</b><small>Drinks · ₹90</small></div><i>Available</i></div><div className="menu-line muted-line"><span className="menu-thumb pale" /><div><b>Seasonal tart</b><small>Desserts · ₹220</small></div><i>Hidden</i></div><div className="menu-window-footer"><span>Changes publish behind the same QR</span><Check size={15}/></div></div>
    </section>

    <section className="marketing-section pricing-section flagship-pricing">
      <div className="section-heading flagship-section-heading"><span className="marketing-eyebrow">Simple to start</span><h2>A serious product.<br /><em>One clear plan.</em></h2><p>Prime includes the essential QR, customer and operating tools for restaurants, cafés and hotels.</p></div>
      <div className="pricing-layout"><div className="price-card"><div className="price-top"><span>PRIME</span><b>Launch price</b></div><div className="price"><del>₹1,599</del><strong>₹599</strong><span>/ month</span></div><p>For restaurants, cafés and hotels getting started with one permanent QR.</p><ul>{["Permanent dynamic QR", "Customer page and digital menu", "Orders and table QR codes", "Payment destination management", "Analytics and up to 5 staff", "Support when you need it"].map(x => <li key={x}><Check size={16} />{x}</li>)}</ul><a className="marketing-button light wide" href="/signup">Start with Prime <ArrowRight size={16} /></a></div><div className="custom-card"><span className="marketing-eyebrow">Something different?</span><h3>Build the rollout around your business.</h3><p>Other categories can talk to the team about a custom onboarding path.</p><a className="marketing-text-link" href="/contact">Talk to sales <ArrowRight size={15} /></a></div></div>
    </section>

    <section className="marketing-section faq-section flagship-faq"><div className="section-heading"><span className="marketing-eyebrow">Before you start</span><h2>Clear answers.<br /><em>No hidden story.</em></h2></div><div className="faq-list">{faqs.map(([q, a], i) => <div className={`faq-item ${faq===i?"open":""}`} key={q}><button onClick={() => setFaq(faq === i ? null : i)} aria-expanded={faq === i}><span>{q}</span>{faq === i ? <X size={17} /> : <ChevronDown size={17} />}</button><div className="faq-answer" aria-hidden={faq!==i}>{faq === i && <p>{a}</p>}</div></div>)}</div></section>

    <section className="marketing-cta-section flagship-cta"><div className="flagship-cta-mark"><Mark/></div><span className="marketing-eyebrow">Ready when you are</span><h2>Put one QR<br /><em>to work.</em></h2><p>Start with the customer page. Keep the operating tools behind it.</p><div className="hero-actions"><a className="marketing-button light flagship-primary" href="/signup">Start with Prime <ArrowRight size={16} /></a><a className="marketing-text-link" href="/contact">Talk to sales <ArrowRight size={15} /></a></div></section>
  </main><MarketingFooter /></>;
}

function MarketingFooter() {
  return <footer className="marketing-footer">
    <div>
      <a className="marketing-brand" href="/"><Mark /><span>1QR <b>Prime</b></span></a>
      <p>One QR for the way local business works.</p>
      <small className="brand-alias">1QR Prime · One QR Prime · 1QRPrime</small>
    </div>
    <div className="footer-links">
      <div><b>Product</b><a href="/features">Features</a><a href="/pricing">Pricing</a><a href="/one-qr">One QR</a><a href="/qr-menu">QR menu</a><a href="/digital-menu">Digital menu</a><a href="/dynamic-qr-menu">Dynamic QR</a></div>
      <div><b>Restaurant</b><a href="/restaurant-software">Restaurant software</a><a href="/restaurant-management-software">Management software</a><a href="/restaurant-ordering-system">Ordering system</a><a href="/table-ordering-system">Table ordering</a><a href="/restaurant-qr">Restaurant QR</a></div>
      <div><b>Solutions</b><a href="/restaurants">Restaurants</a><a href="/cafe-software">Café software</a><a href="/cafes">Cafés</a><a href="/hotel-qr">Hotel QR</a><a href="/hotels">Hotels</a><a href="/upi-restaurant-ordering">UPI ordering</a></div>
      <div><b>India</b><a href="/qr-menu-india">QR menu India</a><a href="/restaurant-software-bangalore">Restaurant software Bengaluru</a><a href="/qr-menu-bangalore">QR menu Bengaluru</a><a href="/blog/restaurant-software-india-buyers-guide">Software guide</a><a href="/blog/restaurant-qr-menu-india-guide">QR menu guide</a></div>
      <div><b>Resources</b><a href="/blog">Journal</a><a href="/about">About</a><a href="/contact">Contact</a><a href="/support">Support</a><a href="/llms.txt">LLMs</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
    </div>
    <small>© {new Date().getFullYear()} 1QR Prime. Built for local business.</small>
  </footer>;
}

function ContentPage({ path }: { path: string }) {
  const config = pageMeta[path] || pageMeta["/features"];
  const headings: Record<string, { kicker: string; title: React.ReactNode; intro: string }> = {
    "/features": { kicker: "The product", title: <>One QR.<br /><em>More control.</em></>, intro: "The customer experience and the merchant workspace should feel like one connected thing." },
    "/restaurants": { kicker: "For restaurants", title: <>A faster path from<br /><em>table to service.</em></>, intro: "Give guests a useful menu and give staff an operational view that keeps the room moving." },
    "/cafes": { kicker: "For cafés", title: <>A menu that feels<br /><em>as considered as your space.</em></>, intro: "A calm, quick customer page for cafés that want less friction without losing hospitality." },
    "/hotels": { kicker: "For hotels", title: <>Useful information,<br /><em>one thoughtful scan.</em></>, intro: "Create a focused guest page for menus, directions, contact actions and the information your property can support today." },
  };
  const h = headings[path] || headings["/features"];
  return <><Meta path={path} /><MarketingHeader /><main className="marketing-subpage"><section className="subpage-hero"><span className="marketing-eyebrow">{h.kicker}</span><h1>{h.title}</h1><p>{h.intro}</p><a className="marketing-button light" href="/signup">Start with Prime <ArrowRight size={16} /></a></section><section className="subpage-grid">{[{icon: QrCode, title: "A permanent public identity", text: "Print one QR and keep improving the page behind it."}, {icon: ShoppingBag, title: "A focused operating view", text: "Orders, menu, tables and customer actions in one workspace."}, {icon: Wallet, title: "Trustworthy payment handoff", text: "Show context clearly and keep confirmation language honest."}, {icon: Users, title: "A team that has boundaries", text: "Invite up to five staff with permissions that match the work."}, {icon: BarChart3, title: "Useful signals", text: "See the activity your product actually records—without invented metrics."}, {icon: Smartphone, title: "Made for a phone", text: "A merchant experience that works when the day is moving."}].map(({icon: Icon, title, text}) => <article key={title}><Icon /><h3>{title}</h3><p>{text}</p></article>)}</section><section className="subpage-callout"><div><span className="marketing-eyebrow">Built to stay simple</span><h2>{path === "/hotels" ? "Start with the guest moments you can improve today." : "The details are the product."}</h2><p>Fast pages, clear states and a QR that does not need reprinting when your business evolves.</p></div><ProductVisual /></section></main><MarketingFooter /></>;
}

function SeoLandingPage({ path }: { path: string }) {
  const page = seoLandings[path];
  if (!page) return <NotFound />;
  const related = articles
    .filter((article) => article.keywords?.some((keyword) => page.keywords.some((target) => keyword.toLowerCase().includes(target.toLowerCase().split(" ")[0]))))
    .slice(0, 4);
  return <><Meta path={path} /><MarketingHeader /><main className="marketing-subpage seo-landing-page">
    <section className="subpage-hero">
      <span className="marketing-eyebrow">{page.kicker}</span>
      <h1>{page.h1}</h1>
      <p>{page.intro}</p>
      <div className="hero-actions"><a className="marketing-button light" href="/signup">Start with Prime <ArrowRight size={16} /></a><a className="marketing-text-link" href="/pricing">See pricing <ArrowRight size={15} /></a></div>
    </section>
    <section className="seo-copy-grid">
      {page.sections.map((section) => <article key={section.title}><h2>{section.title}</h2><p>{section.body}</p></article>)}
    </section>
    <section className="seo-feature-section">
      <span className="marketing-eyebrow">What 1QR Prime supports</span>
      <h2>Built around the QR-led customer journey.</h2>
      <div className="seo-feature-list">{page.features.map((feature) => <span key={feature}><Check size={15} />{feature}</span>)}</div>
    </section>
    <section className="faq-section seo-faq">
      <div className="section-heading"><span className="marketing-eyebrow">Questions</span><h2>What businesses ask before they start.</h2></div>
      <div className="faq-list">{page.faq.map((item) => <div className="faq-item" key={item.q}><h3>{item.q}</h3><p>{item.a}</p></div>)}</div>
    </section>
    {related.length > 0 && <section className="seo-related"><span className="marketing-eyebrow">Related guides</span><div>{related.map((article) => <a key={article.slug} href={`/blog/${article.slug}`}><strong>{article.title}</strong><span>{article.description}</span></a>)}</div></section>}
  </main><MarketingFooter /></>;
}

function PricingPage() { return <><Meta path="/pricing" /><MarketingHeader /><main className="marketing-subpage"><section className="subpage-hero compact"><span className="marketing-eyebrow">Pricing</span><h1>One clear plan<br /><em>to start well.</em></h1><p>Prime includes the essential QR, customer and operating tools for restaurants, cafés and hotels.</p></section><section className="pricing-layout pricing-page-layout"><div className="price-card"><div className="price-top"><span>PRIME</span><b>Launch price</b></div><div className="price"><del>₹1,599</del><strong>₹599</strong><span>/ month</span></div><ul>{["Permanent dynamic QR", "Business page and menu", "Orders and table QR codes", "UPI destination management", "Analytics", "Up to 5 non-owner staff", "Support"].map(x => <li key={x}><Check size={16} />{x}</li>)}</ul><a className="marketing-button light wide" href="/signup">Continue with Prime <ArrowRight size={16} /></a><small className="price-note">Billing is handled securely through Razorpay. No payment is implied until checkout is completed.</small></div><div className="custom-card"><span className="marketing-eyebrow">Custom</span><h3>Need a different setup?</h3><p>We're onboarding other categories personally. Tell us what you are building.</p><a className="marketing-text-link" href="/contact">Talk to sales <ArrowRight size={15} /></a></div></section></main><MarketingFooter /></>; }

function Blog() {
  const [extraArticles, setExtraArticles] = useState<Article[]>([]);
  useEffect(() => {
    let active = true;
    import("./seo-articles").then((module) => { if (active) setExtraArticles(module.seoArticles); });
    return () => { active = false; };
  }, []);
  const allArticles = [...articles, ...extraArticles];
  return <><Meta path="/blog" /><MarketingHeader /><main className="marketing-subpage blog-page">
    <section className="subpage-hero compact"><span className="marketing-eyebrow">The 1QR Prime journal</span><h1>Restaurant QR,<br /><em>software and operations.</em></h1><p>52 practical guides covering QR menus, restaurant software, ordering, UPI, table workflows and customer experience.</p></section>
    <section className="article-grid">{allArticles.map((a, i) => <article className={i === 0 ? "featured-article" : ""} key={a.slug}><span className="marketing-eyebrow">{a.category} · {a.read}</span><h2><a href={`/blog/${a.slug}`}>{a.title}</a></h2><p>{a.description}</p><a className="marketing-text-link" href={`/blog/${a.slug}`}>Read article <ArrowRight size={15} /></a></article>)}</section>
  </main><MarketingFooter /></>;
}
function GeneratedArticleBody({ article }: { article: Article }) {
  if (article.body) return <>{article.body}</>;
  return <>
    {article.intro && <p className="article-intro">{article.intro}</p>}
    {article.sections?.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>)}
    {article.takeaways?.length ? <section><h2>Key takeaways</h2><ul>{article.takeaways.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
    {article.faq?.length ? <section><h2>Frequently asked questions</h2>{article.faq.map((item) => <div className="article-faq" key={item.q}><h3>{item.q}</h3><p>{item.a}</p></div>)}</section> : null}
    <p>Explore <a href="/restaurant-software">restaurant software</a>, <a href="/qr-menu">QR menus</a>, or learn how <a href="/one-qr">one permanent QR</a> can connect the customer journey.</p>
  </>;
}
function ArticlePage({ article }: { article: Article }) {
  const related = articles.filter((candidate) => candidate.slug !== article.slug && candidate.category === article.category).slice(0, 3);
  return <><Meta path={`/blog/${article.slug}`} article={article} /><MarketingHeader /><main className="article-page">
    <header>
      <span className="marketing-eyebrow">{article.category} · {article.read}</span>
      <h1>{article.title}</h1>
      <p>{article.description}</p>
      <div className="article-byline"><span>By <a href="/about">1QR Prime Editorial Team</a></span><span>Published {new Date((article.published || "2026-10-23") + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span>{article.updated && article.updated !== (article.published || "2026-10-23") && <span>Updated {new Date(article.updated + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span>}</div>
    </header>
    <article className="article-body"><GeneratedArticleBody article={article} /></article>
    {related.length > 0 && <section className="article-related"><span className="marketing-eyebrow">Related reading</span>{related.map((item) => <a key={item.slug} href={`/blog/${item.slug}`}><strong>{item.title}</strong><ArrowRight size={15} /></a>)}</section>}
    <div className="article-next"><a href="/blog">← Back to the journal</a><a className="marketing-button light" href="/signup">Start with Prime <ArrowRight size={16} /></a></div>
  </main><MarketingFooter /></>;
}
function AsyncSeoArticlePage({ slug }: { slug: string }) {
  const [article, setArticle] = useState<Article | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    import("./seo-articles")
      .then((module) => { if (active) setArticle(module.seoArticles.find((item) => item.slug === slug) || null); })
      .catch(() => { if (active) setArticle(null); });
    return () => { active = false; };
  }, [slug]);
  if (article === undefined) return <><MarketingHeader /><main className="article-page"><header><span className="marketing-eyebrow">1QR Prime Journal</span><h1>Loading guide…</h1></header></main></>;
  return article ? <ArticlePage article={article} /> : <NotFound />;
}
function Contact({ support = false }: { support?: boolean }) { return <><Meta path={support ? "/support" : "/contact"} /><MarketingHeader /><main className="marketing-subpage contact-page"><section className="subpage-hero compact"><span className="marketing-eyebrow">{support ? "Support" : "Contact"}</span><h1>{support ? <>Help for the<br /><em>working day.</em></> : <>Let's make the<br /><em>next step clear.</em></>}</h1><p>{support ? "For an order, booking or payment issue, contact the business shown on its customer page. For workspace help, tell us what you are trying to do." : "Product support, a custom rollout, or a question about Prime—we'll point you in the right direction."}</p></section><section className="contact-grid"><a href="mailto:support@1qrprime.com"><span>Product support</span><b>{support ? "Get help with your workspace" : "Help with an existing workspace"} <ArrowUpRight size={16} /></b></a><a href="mailto:sales@1qrprime.com"><span>Sales</span><b>Talk about a custom business <ArrowUpRight size={16} /></b></a><a href="mailto:hello@1qrprime.com"><span>General</span><b>Say hello to the team <ArrowUpRight size={16} /></b></a></section></main><MarketingFooter /></>; }
function Legal({ terms = false }: { terms?: boolean }) { return <><Meta path={terms ? "/terms" : "/privacy"} /><MarketingHeader /><main className="legal-page"><span className="marketing-eyebrow">1QR Prime</span><h1>{terms ? "Terms of service" : "Privacy, plainly."}</h1><p className="legal-lede">{terms ? "The rules for using 1QR Prime merchant and public business services." : "A practical summary of how account, business and operational data is handled."}</p><article>{terms ? <><h2>Using the service</h2><p>1QR Prime provides merchant workspaces, public business pages, menus, orders, QR destinations and related tools. You are responsible for information you publish and for keeping account access secure.</p><h2>Billing and third parties</h2><p>Prime billing is handled through the configured payment provider. Payment apps and other external services have their own terms. Do not use 1QR Prime to request customer PINs, passwords or sensitive credentials.</p><h2>Public pages and acceptable use</h2><p>Only publish information you have the right to share. Do not use public pages for unlawful, misleading, abusive or harmful activity. We may restrict access when necessary to protect the service or other users.</p><h2>Legal review</h2><p>This product draft requires final review for the operating entity, governing law, billing terms and support contacts before public launch.</p></> : <><h2>Information we handle</h2><p>We may handle account details, business profiles, menus, orders, enquiries, payment-route references and operational audit records needed to provide the service. Customers can use public pages without merchant accounts.</p><h2>Payments and storage</h2><p>1QR Prime does not request UPI PINs or bank passwords. Payment providers and external links process their own data. Merchant sessions use protected cookies or secure native storage. Customer carts and recovery references may remain in the local browser.</p><h2>Security and retention</h2><p>Access controls, tenant boundaries, session revocation and audit records are used to protect the service. Data retention depends on the data type and operational need; owners can request export or deletion through the workspace.</p><h2>Legal review</h2><p>This is a product policy draft. Before public launch, publish the operating entity, contact, processors, hosting region and rights process.</p></>}</article></main><MarketingFooter /></>; }
function NotFound() { return <><Meta path="/" /><MarketingHeader /><main className="not-found"><span className="marketing-eyebrow">404</span><h1>This page<br /><em>isn't here.</em></h1><p>Try the product overview or explore the journal.</p><div className="hero-actions"><a className="marketing-button light" href="/">Go home <ArrowRight size={16} /></a><a className="marketing-text-link" href="/blog">Explore the journal <ArrowRight size={15} /></a></div></main><MarketingFooter /></>; }

export function isMarketingPath(path: string) { return isPublicMarketingPath(path); }
export function MarketingRouter({ path }: { path: string }) {
  if (path === "/") return <Landing />;
  if (path === "/pricing") return <PricingPage />;
  if (path === "/blog") return <Blog />;
  if (path.startsWith("/blog/")) { const slug = path.slice("/blog/".length); const article = articles.find(a => a.slug === slug); return article ? <ArticlePage article={article} /> : <AsyncSeoArticlePage slug={slug} />; }
  if (path === "/contact") return <Contact />;
  if (path === "/support") return <Contact support />;
  if (path === "/privacy") return <Legal />;
  if (path === "/terms") return <Legal terms />;
  if (seoLandings[path]) return <SeoLandingPage path={path} />;
  if (marketingPages.has(path)) return <ContentPage path={path} />;
  return <NotFound />;
}
