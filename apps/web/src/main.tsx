import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  QrCode,
  LayoutDashboard,
  ShoppingBag,
  Store,
  Wallet,
  BarChart3,
  Users,
  Settings,
  ArrowUpRight,
  Plus,
  Check,
  ExternalLink,
  LogOut,
  ShieldCheck,
  ArrowLeft,
  Clock,
  Download,
  Menu as MenuIcon,
  Bell,
  RefreshCw,
  Search,
  ChevronRight,
  MapPin,
  Phone,
  Link as LinkIcon,
  MessageCircle,
  Navigation,
  Star,
  Globe,
  Utensils,
  Table2,
  Palette,
  Pencil,
} from "lucide-react";
import { api, ApiError, updateLocation, money, label, type Any } from "./api";
import { emailFormatError, normalizeSlugSuggestion, passwordFormatError, slugFormatError } from "./validation";
import { SLUG_AVAILABILITY_PATH } from "../../../shared/slug";
import { canRenderMerchantNavigation, resolveProductState } from "../../../shared/product-state";
import { isMarketingPath, MarketingRouter } from "./marketing";
import "./style.css";
import "./marketing.css";
function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="error">
      {error}
    </div>
  ) : null;
}
function Field({ title, error = "", success = "", description = "", ...props }: any) {
  return (
    <label className="field">
      <span>{title}</span>
      <input {...props} />
      {description && !error && !success && <small>{description}</small>}
      {error && <small className="field-message error-text" role="alert">{error}</small>}
      {!error && success && <small className="field-message success-text">{success}</small>}
    </label>
  );
}
function Badge({ children, tone = "" }: any) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
const browserOrigin = window.location.origin;
const localOrigin = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(window.location.hostname);
const temporaryPreviewOrigin = /\.trycloudflare\.com$/i.test(window.location.hostname);
let razorpayLoader: Promise<void> | null = null;
function loadRazorpayCheckout() {
  if ((window as any).Razorpay) return Promise.resolve();
  if (razorpayLoader) return razorpayLoader;
  razorpayLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Secure checkout couldn't load")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Secure checkout couldn't load"));
    document.head.appendChild(script);
  });
  return razorpayLoader;
}
function Empty({ title, children }: any) {
  return (
    <div className="empty">
      <QrCode size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}
function Brand() {
  return (
    <a className="brand" href="/">
      <span className="brand-icon">
        <QrCode size={25} />
      </span>
      <strong>
        1QR <em>Prime</em>
      </strong>
    </a>
  );
}
function Auth({ done, initialRegister = false }: { done: () => void; initialRegister?: boolean }) {
  const [register, setRegister] = useState(initialRegister),
    [error, setError] = useState(""),
    [rateLimitSeconds, setRateLimitSeconds] = useState(0),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [touched, setTouched] = useState<Record<string, boolean>>({}),
    [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!rateLimitSeconds) return;
    const timer = window.setInterval(() => setRateLimitSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [rateLimitSeconds]);
  const emailError = emailFormatError(email),
    passwordError = passwordFormatError(password),
    nameError = !name.trim() ? "Enter your business or organisation name." : name.trim().length < 2 ? "Use at least 2 characters." : "";
  function markTouched(field: string) {
    setTouched((current) => ({ ...current, [field]: true }));
  }
  function changeField(setter: (value: string) => void, value: string) {
    setter(value);
    if (error) setError("");
  }
  function show(field: string, fieldError: string) {
    return (submitted || touched[field]) ? fieldError : "";
  }
  return (
    <div className="auth auth-v2">
      <section className="auth-story auth-hero">
        <Brand />
        <div>
          <Badge>BUILT FOR LOCAL BUSINESS</Badge>
          <h1>
            Your business.
            <br />
            One connected
            <br />
            <i>experience.</i>
          </h1>
          <p>
            A welcoming page for your customers. A calmer working day for you.
          </p>
          <div className="auth-features">
            <span>
              <Check /> Your own business QR
            </span>
            <span>
              <Check /> Menus, orders & payment routes
            </span>
            <span>
              <Check /> No customer app needed
            </span>
          </div>
        </div>
        <small>1QR Prime · Made for merchants in India</small>
      </section>
      <section className="auth-form auth-card">
        <Brand />
        <h2>{register ? "Create your account" : "Welcome back"}</h2>
        <p>
          {register
            ? "Start setting up your business in a few minutes."
            : "Sign in to manage your business."}
        </p>
        {rateLimitSeconds > 0 && <div className="auth-rate-limit" role="status">Too many attempts. Try again in {rateLimitSeconds} seconds.</div>}
        {error && <div className="auth-inline-error" role="alert">{error}</div>}
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitted(true);
            setTouched({ email: true, password: true, ...(register ? { name: true } : {}) });
            if (emailError || passwordError || (register && nameError)) return;
            setBusy(true);
            setError("");
            try {
              await api(
                `/auth/${register ? "register" : "login"}`,
                "POST",
                { email: email.trim(), password, ...(register ? { name: name.trim() } : {}) },
              );
              done();
            } catch (e) {
              if (e instanceof ApiError && !register && e.status === 401)
                setError("Email or password is incorrect.");
              else if (e instanceof ApiError && e.status === 429) {
                setRateLimitSeconds(Math.max(1, Number(e.data?.retryAfterSeconds || 60)));
                setError("");
              }
              else if (e instanceof ApiError && register && e.code === "EMAIL_ALREADY_EXISTS")
                setError("An account with this email already exists. Sign in instead or use password recovery.");
              else if (/failed to fetch|network|timed out/i.test((e as Error).message))
                setError("Couldn't connect. Check your connection and try again.");
              else if (e instanceof ApiError)
                setError(e.message);
              else
                setError("Something went wrong. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {register && (
            <Field
              title="Business / organisation name"
              value={name}
              onChange={(e: any) => changeField(setName, e.target.value)}
              onBlur={() => markTouched("name")}
              error={show("name", nameError)}
              autoComplete="organization"
            />
          )}
          <Field
            title="Email address"
            value={email}
            onChange={(e: any) => changeField(setEmail, e.target.value)}
            onBlur={() => markTouched("email")}
            error={show("email", emailError)}
            inputMode="email"
            type="text"
            autoComplete="email"
          />
          <Field
            title="Password"
            value={password}
            onChange={(e: any) => changeField(setPassword, e.target.value)}
            onBlur={() => markTouched("password")}
            error={show("password", passwordError)}
            type="password"
            maxLength={128}
            description="Use at least 12 characters."
            autoComplete={register ? "new-password" : "current-password"}
          />
          <button className="primary wide" disabled={busy || rateLimitSeconds > 0}>
            {busy ? (register ? "Creating account…" : "Signing in…") : register ? "Create account" : "Sign in"}
          </button>
        </form>
        <div className="auth-links">
          {register ? <span>Already have an account? <button className="text-button" onClick={() => { setRegister(false); setError(""); }}>Sign in</button></span> : <><a href="/recovery">Forgot password?</a><span>New to 1QR Prime? <button className="text-button" onClick={() => { setRegister(true); setError(""); }}>Create account</button></span></>}
        </div>
        <footer className="auth-footer">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/support">Support</a>
        </footer>
      </section>
    </div>
  );
}
function RouteRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return <div className="boot-screen"><Brand /><Skeleton className="boot-line" /><p>Opening your workspace</p></div>;
}
function StaffInvite({ token }: { token: string }) {
  const [invite, setInvite] = useState<Any | null>(null), [password, setPassword] = useState(""), [error, setError] = useState(""), [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { api(`/staff/invitations/${token}`).then(setInvite).catch((e) => setError((e as Error).message)); }, [token]);
  if (accepted) return <div className="auth"><section className="auth-form"><Brand /><Badge tone="green">INVITATION ACCEPTED</Badge><h2>You’re part of the team</h2><p>Sign in to open your new business workspace.</p><a className="button primary wide" href="/">Open workspace <ArrowUpRight size={17} /></a></section></div>;
  return <div className="auth"><section className="auth-form"><Brand /><Badge>STAFF INVITATION</Badge><h2>Join 1QR Prime</h2>{invite ? <><p>{invite.name}, you’ve been invited as <strong>{invite.role}</strong>.</p><p className="muted">{invite.email}</p><ErrorBox error={error} /><form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(""); try { await api(`/staff/invitations/${token}/accept`, "POST", { password, name: invite.name }); setAccepted(true); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><Field title="Create your password" name="password" type="password" minLength={12} required value={password} onChange={(e: any) => setPassword(e.target.value)} autoComplete="new-password" /><small>Use at least 12 characters. This invitation expires soon and can only be used once.</small><button className="primary wide" disabled={busy}>{busy ? "Accepting…" : "Accept invitation"} <Check size={17} /></button></form></> : <><ErrorBox error={error} />{!error && <><Skeleton className="boot-line" /><p>Checking invitation…</p></>}</>}</section></div>;
}
function PaymentRouteConfirmation({ token }: { token: string }) {
  const [approval, setApproval] = useState<Any | null>(null), [error, setError] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { api(`/payment-routes/confirm/${token}`).then(setApproval).catch((e) => setError((e as Error).message)); }, [token]);
  return <div className="auth"><section className="auth-form"><Brand /><Badge tone={confirmed ? "green" : ""}>{confirmed ? "CONFIRMED" : "PAYMENT DESTINATION"}</Badge>{confirmed ? <><h2>Payment destination confirmed</h2><p>Owner approval is recorded. Independent verification is still required before this destination can become active.</p><a className="button primary wide" href="/">Return to workspace</a></> : approval ? <><h2>Confirm this destination?</h2><p>{approval.business}</p><div className="card-soft"><strong>{approval.vpa}</strong><small>{approval.payee}</small></div><ErrorBox error={error} /><button className="primary wide" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await api(`/payment-routes/confirm/${token}`, "POST"); setConfirmed(true); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>{busy ? "Confirming…" : "Confirm payment destination"} <Check size={17} /></button><p className="muted">If you did not request this change, do not approve it.</p></> : <><ErrorBox error={error} />{!error && <><Skeleton className="boot-line" /><p>Checking confirmation link…</p></>}</>}</section></div>;
}
function SalesPending({ name, category, email, phone, city, onEdit, onSignOut }: any) {
  return <div className="sales-pending-shell">
    <Brand />
    <span className="eyebrow">REQUEST RECEIVED</span>
    <h1>Thanks — we’ll take it from here.</h1>
    <p>We’re currently onboarding businesses in your category personally. Our team will contact you soon.</p>
    <dl className="sales-summary">
      <div><dt>Business</dt><dd>{name || "—"}</dd></div>
      <div><dt>Category</dt><dd>{label(category || "business")}</dd></div>
      <div><dt>Email</dt><dd>{email || "—"}</dd></div>
      <div><dt>Phone</dt><dd>{phone || "Not provided"}</dd></div>
      <div><dt>City</dt><dd>{city || "Not provided"}</dd></div>
    </dl>
    <div className="sales-actions">
      <button className="primary" onClick={onEdit}>Edit business details</button>
      <a className="button secondary" href="/support">Contact support</a>
      <button className="text-button" onClick={onSignOut}>Sign out</button>
    </div>
  </div>;
}
const nav = [
  ["portfolio", "Portfolio", LayoutDashboard],
  ["overview", "Overview", Store],
  ["orders", "Orders", ShoppingBag],
  ["menu", "Menu", MenuIcon],
  ["tables", "Tables", Table2],
  ["payments", "Payments", Wallet],
  ["qr", "QR Codes", QrCode],
  ["customer", "Customer page", Palette],
  ["analytics", "Analytics", BarChart3],
  ["staff", "Staff", Users],
  ["profile", "Business profile", Store],
  ["settings", "Settings", Settings],
] as const;
function App() {
  const [me, setMe] = useState<Any | null>(null),
    [loading, setLoading] = useState(true),
    [section, setSection] = useState("portfolio"),
    [lid, setLid] = useState(""),
    [error, setError] = useState(""),
    [salesEditing, setSalesEditing] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const m = await api("/me");
      setMe(m);
      setLid((old) =>
        m.locations.some((l: Any) => l.id === old)
          ? old
          : m.locations[0]?.id || "",
      );
      // A newly registered or legacy account without a business should enter
      // the business setup flow directly, matching the native experience.
      if (!m.locations.length && !m.adminRole) setSection((current) => current === "portfolio" ? "new" : current);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const pathname = window.location.pathname;
  if (isMarketingPath(pathname)) return <MarketingRouter path={pathname} />;
  if (pathname === "/login" || pathname === "/signup") {
    if (loading) return <div className="boot-screen"><Brand /><Skeleton className="boot-line" /><p>Preparing your workspace</p></div>;
    if (!me) return <Auth done={refresh} initialRegister={pathname === "/signup"} />;
    return <RouteRedirect to="/app" />;
  }
  if (["/reset", "/verify", "/recovery"].includes(pathname))
    return <Recovery mode={pathname.slice(1)} />;
  if (pathname.startsWith("/staff/invite/"))
    return <StaffInvite token={decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) || "")} />;
  if (pathname.startsWith("/payment-routes/confirm/"))
    return <PaymentRouteConfirmation token={decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) || "")} />;
  if (pathname.startsWith("/b/") || pathname.startsWith("/q/")) {
    const parts = pathname.split("/").filter(Boolean);
    const legacy = parts[0] === "b";
    const initialView = legacy ? "menu" : parts[2] === "menu" ? "menu" : parts[2] === "pay" ? "pay" : "hub";
    return <Customer slug={decodeURIComponent(parts[1])} initialView={initialView} />;
  }
  if (loading) return <div className="boot-screen"><Brand /><Skeleton className="boot-line" /><p>Preparing your workspace</p></div>;
  if (!me) return <Auth done={refresh} />;
  const l = me.locations.find((x: Any) => x.id === lid),
    tenant =
      me.tenants.find((t: Any) => t.id === l?.tenant_id) || me.tenants[0];
  const productState = resolveProductState({ ...me, activeLocationId: l?.id });
  const needsOnboarding = productState === "AUTHENTICATED_ACCOUNT_SETUP";
  const paymentRequired = productState === "PRIME_PAYMENT_REQUIRED";
  const salesPending = productState === "SALES_CONTACT_PENDING";
  if (!canRenderMerchantNavigation(productState) && !me.adminRole)
    return (
      <div className="auth auth-v2">
        {needsOnboarding ? <section className="auth-form auth-card"><Brand /><NewLocation me={me} initial={l} done={refresh} /></section> : paymentRequired ? <section className="auth-form auth-card"><Brand /><NewLocation me={me} initial={l} forcePayment done={refresh} /></section> : salesEditing ? <section className="auth-form auth-card"><Brand /><NewLocation me={me} initial={l} startAt={0} done={async () => { setSalesEditing(false); await refresh(); }} onSalesSubmitted={async () => { setSalesEditing(false); await refresh(); }} /></section> : <SalesPending name={l?.name} category={l?.category} email={me.email} phone={l?.profile?.phone} city={l?.profile?.city || l?.profile?.address} onEdit={() => setSalesEditing(true)} onSignOut={async () => { await api("/auth/logout", "POST"); window.location.replace("/login"); }} />}
      </div>
    );
  return (
    <div className="shell platform-shell">
      <aside className="sidebar platform-sidebar">
        <Brand />
        <div className="workspace-label">WORKSPACE</div>
        <select
          aria-label="Active business"
          value={lid || "all"}
          onChange={(e) => {
            const next = e.target.value;
            setLid(next === "all" ? "" : next);
            if (next === "all") setSection("portfolio");
          }}
        >
          <option value="all">All businesses</option>
          {me.locations.map((x: Any) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <nav aria-label="Merchant workspace">
          {nav
            .filter(
              ([key]) =>
                !(
                  l?.role === "staff" &&
                  ["payments", "staff", "analytics"].includes(key)
                ),
            )
            .map(([key, title, Icon]) => (
              <button
                className={section === key ? "active" : ""}
                key={key}
                onClick={() => {
                  setSection(key);
                  setError("");
                }}
              >
                <Icon size={19} />
                {title}
                {key === "orders" && <span className="nav-dot" />}
              </button>
            ))}
          {l?.role === "owner" && <button onClick={() => setSection("new")}>
            <Plus size={19} />
            Add business
          </button>}
          {me.adminRole && (
            <button onClick={() => setSection("admin")}>
              <ShieldCheck size={19} />
              Support console
            </button>
          )}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">{me.email[0].toUpperCase()}</span>
          <div>
            <strong>{tenant?.name}</strong>
            <small>{label(l?.role || "owner")} workspace</small>
          </div>
          <button
            aria-label="Sign out"
            onClick={async () => {
              await api("/auth/logout", "POST");
              refresh();
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="workspace platform-workspace">
        <header className="topbar platform-topbar">
          <span>
            Workspace <ChevronRight size={14} />{" "}
            <strong>
              {nav.find((x) => x[0] === section)?.[1] || "Support"}
            </strong>
          </span>
          <div className="topbar-context">
            <span className="topbar-business-status">{tenant?.name || "Workspace"}</span>
            {l?.published && <Badge tone="green">Live</Badge>}
          </div>
        </header>
        <main className="page-content">
          <ErrorBox error={error} />
          {section === "admin" ? (
            <Admin />
          ) : section === "new" ? (
            <NewLocation me={me} done={async () => { await refresh(); setSection("portfolio"); }} />
          ) : section === "portfolio" || !lid ? (
            <Portfolio me={me} go={(next: string, locationId?: string) => { if (locationId) setLid(locationId); setSection(next); }} />
          ) : !l ? (
            <NewLocation
              me={me}
              done={async () => {
                await refresh();
                setSection("overview");
              }}
            />
          ) : needsOnboarding ? (
            <NewLocation
              me={me}
              initial={l}
              done={async () => {
                await refresh();
                setSection("overview");
              }}
            />
          ) : (
            <>
              <div className="page-title">
                <div>
                  <div className="eyebrow">
                    {l.name} · {label(l.category)}
                  </div>
                  <h1>
                    {section === "overview"
                      ? `Good to see you, ${l.name}.`
                      : nav.find((x) => x[0] === section)?.[1]}
                  </h1>
                  <p>
                    {section === "overview"
                      ? "A clear view of today’s work, customer activity and what needs attention."
                      : `Manage ${l.name} with confidence.`}
                  </p>
                </div>
                <a
                  className="button secondary"
                  href={`/b/${l.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View live page <ArrowUpRight size={16} />
                </a>
              </div>
              {section === "overview" && <Overview l={l} go={setSection} />}{" "}
              {section === "profile" && (
                <Profile key={l.id + ":" + l.version} l={l} done={refresh} />
              )}{" "}
              {section === "menu" && <Catalogue l={l} done={refresh} />}{" "}
              {section === "tables" && <Tables l={l} />}{" "}
              {section === "orders" && <Orders l={l} />}{" "}
              {section === "payments" && <Payments l={l} emailVerified={!!me.emailVerified} />}{" "}
              {section === "qr" && <QrStudio l={l} />}{" "}
              {section === "customer" && <CustomerDesigner l={l} done={refresh} />}{" "}
              {section === "analytics" && <Analytics l={l} />}{" "}
              {section === "staff" && <Staff l={l} />}{" "}
              {section === "settings" && (
                <SettingsPage
                  tenant={tenant}
                  go={setSection}
                  refresh={refresh}
                />
              )}
            </>
          )}
        </main>
        <div className="workspace-footer">
          <span>1QR Prime · A simpler way to stay connected</span>
          <a href="/support">Need a hand? ↗</a>
        </div>
      </div>
    </div>
  );
}
function Portfolio({ me, go }: any) {
  const [rows, setRows] = useState<Record<string, Any>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all(me.locations.map(async (location: Any) => {
      try { return [location.id, await api(`/locations/${location.id}/orders`)] as const; }
      catch { return [location.id, { orders: [] }] as const; }
    })).then((entries) => { if (active) setRows(Object.fromEntries(entries)); }).catch((e) => setError(e.message));
    return () => { active = false; };
  }, [me.locations]);
  const orders = me.locations.flatMap((location: Any) => (rows[location.id]?.orders || []).map((order: Any) => ({ ...order, location })));
  const active = orders.filter((order: Any) => !["completed", "cancelled", "rejected"].includes(order.state));
  const revenue = orders.filter((order: Any) => order.state === "completed").reduce((sum: number, order: Any) => sum + (order.amount_paise || 0), 0);
  return <>
    <div className="portfolio-hero">
      <div><Badge>OWNER COMMAND CENTER</Badge><h1>Your businesses, together.</h1><p>Run every location from one calm workspace. Pick a business when you need operational detail.</p></div>
      <button className="primary" onClick={() => go("new")}> <Plus size={17} /> Add business</button>
    </div>
    <ErrorBox error={error} />
    <div className="portfolio-stats">
      <Stat title="Locations" value={me.locations.length} note="Across your portfolio" />
      <Stat title="Orders" value={orders.length} note="Recent order history" />
      <Stat title="Open orders" value={active.length} note="Need attention now" />
      <Stat title="Completed value" value={money(revenue)} note="From loaded history" />
    </div>
    <section className="portfolio-grid">
      {me.locations.map((location: Any) => {
        const locationOrders = rows[location.id]?.orders || [];
        const open = locationOrders.filter((order: Any) => !["completed", "cancelled", "rejected"].includes(order.state)).length;
        return <article className="business-card" key={location.id}>
          <div className="business-card-top"><div className="business-mark">{location.name.slice(0, 1).toUpperCase()}</div><Badge tone={location.published ? "green" : "amber"}>{location.published ? "LIVE" : "DRAFT"}</Badge></div>
          <h2>{location.name}</h2><p>{label(location.category)} · {location.profile?.address || "Location not added yet"}</p>
          <div className="business-card-metrics"><span><strong>{open}</strong> open orders</span><span><strong>{location.items?.length || 0}</strong> menu items</span><span><strong>{location.active_route_id ? "Active" : "Set up"}</strong> payments</span></div>
          <div className="button-row"><button className="primary" onClick={() => go("overview", location.id)}>Open dashboard <ArrowUpRight size={15} /></button><a className="secondary button" href={`/q/${location.publicId}`} target="_blank" rel="noreferrer">Customer page</a></div>
        </article>;
      })}
      {!me.locations.length && <Empty title="Add your first business">Your portfolio will appear here as soon as you create a location.</Empty>}
    </section>
  </>;
}

function Overview({ l, go }: any) {
  const [data, setData] = useState<Any>({ orders: [] }),
    [error, setError] = useState("");
  useEffect(() => {
    api(`/locations/${l.id}/orders`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [l.id]);
  const active = data.orders.filter(
    (o: Any) => !["completed", "cancelled", "rejected"].includes(o.state),
  );
  return (
    <>
      <ErrorBox error={error} />
      <div className="welcome-banner">
        <div>
          <Badge>ONE QR. MORE POSSIBILITIES.</Badge>
          <h2>
            Make every visit
            <br />
            the start of something.
          </h2>
          <p>
            Your menu, your links, your business.
            <br />A single page that brings it all together.
          </p>
          <button className="button light" onClick={() => go("qr")}>
            Get your business QR <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="mini-page">
          <div className="mini-avatar">{l.name.slice(0, 1)}</div>
          <strong>{l.name}</strong>
          <small>Your neighbourhood favourite</small>
          <div>
            <span>Explore our menu</span>
            <ArrowUpRight size={16} />
          </div>
          <div>
            <span>Visit · Connect · Pay</span>
            <QrCode size={16} />
          </div>
          <small className="powered">Connected by 1QR Prime</small>
        </div>
      </div>
      <div className="stats">
        <Stat
          title="Open orders"
          value={active.length}
          note="Waiting, accepted or preparing"
        />
        <Stat
          title="Catalogue items"
          value={l.items.length}
          note={`${l.items.filter((x: Any) => x.available).length} currently available`}
        />
        <Stat
          title="Business page"
          value={l.published ? "Live" : "Draft"}
          note="Your printed URL stays the same"
        />
        <Stat
          title="Payment route"
          value={l.active_route_id ? "Active" : "Set up"}
          note="Manual, verified destinations"
        />
      </div>
      <div className="two-columns">
        <section className="card">
          <div className="card-heading">
            <h2>Make it yours</h2>
            <Badge>GET STARTED</Badge>
          </div>
          {[
            [
              "profile",
              "Add your business details",
              "Help customers get to know you.",
            ],
            [
              "menu",
              "Build your menu or catalogue",
              "Put your best offerings up front.",
            ],
            [
              "payments",
              "Connect a payment destination",
              "Verify a route before accepting UPI.",
            ],
            ["qr", "Print your business QR", "Turn a visit into a connection."],
          ].map(([s, t, d], i) => (
            <button className="step" key={s} onClick={() => go(s)}>
              <span className="step-number">0{i + 1}</span>
              <span>
                <strong>{t}</strong>
                <small>{d}</small>
              </span>
              <ArrowUpRight size={18} />
            </button>
          ))}
        </section>
        <section className="card">
          <div className="card-heading">
            <h2>At the counter</h2>
            <button className="text-button" onClick={() => go("orders")}>
              Open order desk ↗
            </button>
          </div>
          {active.length ? (
            active.slice(0, 4).map((o: Any) => (
              <div className="list-row" key={o.id}>
                <div>
                  <strong>#{o.id.slice(0, 8)}</strong>
                  <small>
                    {label(o.order_type)} · {money(o.amount_paise)}
                  </small>
                </div>
                <Badge>{label(o.state)}</Badge>
              </div>
            ))
          ) : (
            <Empty title="A little quiet, for now">
              Incoming orders will appear here. Keep the order desk open during
              service.
            </Empty>
          )}
        </section>
      </div>
      {!l.active_route_id && <div className="note payment-warning"><Wallet size={20} /><span><strong>Payment not set up.</strong> Customers will not see Pay until a verified UPI route is active.</span><button className="secondary" onClick={() => go("payments")}>Configure UPI</button></div>}
      <div className="quick-actions"><button className="secondary" onClick={() => go("menu")}><Plus size={16} /> Add menu item</button><button className="secondary" onClick={() => go("tables")}><Table2 size={16} /> Manage tables</button><button className="secondary" onClick={() => go("customer")}><Palette size={16} /> Customize customer page</button><button className="secondary" onClick={() => go("qr")}><QrCode size={16} /> Download QR</button></div>
      <div className="note">
        <ShieldCheck size={20} />
        <span>
          <strong>A payment tap is only the beginning.</strong> 1QR keeps
          payment attempts separate from confirmed receipts.
        </span>
      </div>
    </>
  );
}
function Stat({ title, value, note }: any) {
  return (
    <div className="stat">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function NewLocation({ me, done, initial, forcePayment = false, startAt, onSalesSubmitted }: any) {
  const [draft, setDraft] = useState<Any | null>(initial || null),
    [step, setStep] = useState(forcePayment ? 4 : (startAt ?? initial?.onboarding?.step ?? 0)),
    [name, setName] = useState(initial?.name || ""),
    [slug, setSlug] = useState(initial?.slug || ""),
    [slugTouched, setSlugTouched] = useState(!!initial?.slug),
    [slugBlurred, setSlugBlurred] = useState(false),
    [slugSubmitted, setSlugSubmitted] = useState(false),
    [slugAvailability, setSlugAvailability] = useState<"idle" | "checking" | "available" | "unavailable">("idle"),
    [slugAvailabilityValue, setSlugAvailabilityValue] = useState(""),
    [category, setCategory] = useState(initial?.category || "restaurant"),
    [description, setDescription] = useState(initial?.profile?.description || ""),
    [address, setAddress] = useState(initial?.profile?.address || ""),
    [phone, setPhone] = useState(initial?.profile?.phone || ""),
    [hours, setHours] = useState(initial?.profile?.hours || ""),
    [tax, setTax] = useState(String((initial?.profile?.taxBps || 0) / 100)),
    [packaging, setPackaging] = useState(String((initial?.profile?.packagingFeePaise || 0) / 100)),
    [itemName, setItemName] = useState(""),
    [itemPrice, setItemPrice] = useState(""),
    [plans, setPlans] = useState<Any[]>([]),
    [planId, setPlanId] = useState(initial?.plan_id || "prime"),
    [salesSubmitted, setSalesSubmitted] = useState(false),
    [paymentVerified, setPaymentVerified] = useState(initial?.billing_state === "active"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const originalSlug = useRef(initial?.slug || ""),
    availabilityRequest = useRef(0);
  useEffect(() => { api("/plans").then((value) => setPlans(value as Any[])).catch(() => setPlans([])); }, []);
  const slugError = slugFormatError(slug);
  useEffect(() => {
    const value = normalizeSlugSuggestion(slug);
    const requestId = ++availabilityRequest.current;
    if (!value || value === originalSlug.current || slugError || value.length < 3) {
      setSlugAvailability("idle");
      setSlugAvailabilityValue("");
      return;
    }
    setSlugAvailability("checking");
    setSlugAvailabilityValue(value);
    const timer = window.setTimeout(() => {
      api(`${SLUG_AVAILABILITY_PATH}?slug=${encodeURIComponent(value)}`)
        .then((result) => {
          if (requestId === availabilityRequest.current && value === normalizeSlugSuggestion(slug))
            setSlugAvailability(result.available ? "available" : "unavailable");
        })
        .catch(() => {
          if (requestId === availabilityRequest.current) {
            setSlugAvailability("idle");
            setSlugAvailabilityValue("");
          }
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [slug, slugError]);
  const restaurant = ["restaurant", "cafe", "cloud_kitchen"].includes(category);
  const primeEligible = ["restaurant", "cafe", "hotel"].includes(category);
  const profile = () => ({
    ...(draft?.profile || {}), description, address, phone, hours,
    orderEnabled: restaurant,
    orderTypes: restaurant ? ["dine_in", "takeaway"] : ["takeaway"],
    payAtCounter: true,
    taxBps: Math.round(Number(tax || 0) * 100),
    packagingFeePaise: Math.round(Number(packaging || 0) * 100),
  });
  async function save(nextStep: number, completed = false) {
    if (step === 0) {
      setSlugSubmitted(true);
      const canonicalSlug = normalizeSlugSuggestion(slug);
      const canonicalError = slugFormatError(canonicalSlug);
      setSlug(canonicalSlug);
      if (canonicalError || (slugAvailabilityValue === canonicalSlug && slugAvailability === "unavailable") || (slugAvailabilityValue === canonicalSlug && slugAvailability === "checking")) {
        setError(slugAvailability === "unavailable" ? "That URL is already taken. Try another one." : slugAvailability === "checking" ? "Checking your URL…" : canonicalError);
        return null;
      }
    }
    setBusy(true); setError("");
    try {
      let next = draft;
      if (!next) {
        next = await api("/locations", "POST", { tenantId: me.tenants.find((t: Any) => t.role === "owner")?.id, name, slug: normalizeSlugSuggestion(slug), category });
        setDraft(next);
      }
      if (!next) throw new Error("Unable to create the business draft");
      const updated = await api(`/locations/${next.id}/onboarding`, "PATCH", { step: nextStep, name, category, profile: profile(), completed });
      setDraft(updated); setStep(nextStep);
      return updated;
    } catch (e) { setError((e as Error).message); return null; }
    finally { setBusy(false); }
  }
  async function addItem() {
    if (!draft || !itemName || !itemPrice) return;
    setBusy(true); setError("");
    try {
      await api(`/locations/${draft.id}/items`, "POST", { name: itemName, description: "", section: "Menu", price_paise: Math.round(Number(itemPrice) * 100), available: true, foodType: "OTHER" });
      setItemName(""); setItemPrice("");
      const updated = await api(`/locations/${draft.id}`); setDraft(updated);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function publish() {
    if (!primeEligible) {
      setBusy(true); setError("");
      try {
        await api("/sales/leads", "POST", { businessName: name, category, email: me.email, phone: phone || "Not provided", city: address || "Not provided", locationCount: 1, notes: "Requested a custom onboarding conversation." });
        setSalesSubmitted(true);
        await onSalesSubmitted?.();
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      return;
    }
    const updated = await save(6, false);
    if (!updated) return;
    setBusy(true); setError("");
    try {
      if (!paymentVerified) throw new Error("Complete secure checkout before publishing Prime.");
      const result = await api(`/locations/${updated.id}/publish`, "POST");
      setDraft(result.location || updated); setStep(6);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function startPrimeCheckout() {
    if (!draft || !primeEligible) return;
    setBusy(true); setError("");
    try {
      const order = await api("/billing/checkout/order", "POST", { planCode: "prime", locationId: draft.id });
      await loadRazorpayCheckout();
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => { if (!settled) { settled = true; resolve(); } };
        const checkout = new (window as any).Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.order_id || order.orderId,
          name: "1QR Prime",
          description: "Prime plan",
          prefill: { email: me.email },
          theme: { color: "#f5f5f2" },
          handler: async (response: Any) => {
            try {
              await api("/billing/checkout/verify", "POST", { razorpayPaymentId: response.razorpay_payment_id, razorpayOrderId: response.razorpay_order_id, razorpaySignature: response.razorpay_signature });
              setPaymentVerified(true); setStep(5);
            } catch { setError("We couldn't verify this payment yet. If money was deducted, contact support and we'll check it."); }
            finally { finish(); }
          },
          modal: { ondismiss: () => { setError("Payment wasn't completed. You can continue when you're ready."); finish(); } },
        });
        checkout.on("payment.failed", () => { setError("We couldn't complete the payment. No Prime access has been activated."); finish(); });
        checkout.open();
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Payments are temporarily unavailable. Please try again.");
    } finally { setBusy(false); }
  }
  if (salesSubmitted) return <SalesPending name={name} category={category} email={me.email} phone={phone} city={address} onEdit={() => { setSalesSubmitted(false); setStep(0); }} onSignOut={async () => { await api("/auth/logout", "POST"); window.location.replace("/login"); }} />;
  if (step >= 6 && draft) return <section className="card onboarding-success narrow"><Badge tone="green">LIVE</Badge><h1>Your business is live 🎉</h1><p>Print or share this QR anywhere. Your menu, payment details and business information can change later without replacing it.</p><img className="qr-image" src={`/api/locations/${draft.id}/qr?format=svg&kind=page`} alt={`${name} permanent QR`} /><p className="public-link">{location.origin}/q/{draft.publicId}</p><div className="button-row"><a className="button primary" href={`/api/locations/${draft.id}/qr?format=png&kind=page`} download>Download QR</a><a className="button secondary" href={`/q/${draft.publicId}`} target="_blank" rel="noreferrer">View Customer Page</a><button className="secondary" onClick={done}>Go to Dashboard</button></div></section>;
  return <section className="card narrow onboarding-card">
    <div className="onboarding-progress"><Badge>STEP {Math.min(step + 1, 6)} OF 6</Badge><span>{name || "New business"}</span></div>
    <h1>{step === 0 ? "Let's set up your business" : step === 1 ? "Tell customers about you" : step === 2 ? "Configure your experience" : step === 3 ? "Add your menu" : step === 4 ? "Choose your plan" : "Preview your 1QR page"}</h1>
    <p>{step === 0 ? "Create your business profile and your permanent 1QR." : step === 3 ? "Add a few items now, or skip and finish your menu later." : step === 4 ? "Every new workspace starts with a clear plan decision. Billing activation remains separate." : "Your progress is saved automatically."}</p><ErrorBox error={error} />
    {step === 0 && <><Field title="Business name" value={name} onChange={(e: any) => { const value = e.target.value; setName(value); if (!slugTouched) setSlug(normalizeSlugSuggestion(value)); }} required /><Field title="Permanent page URL" value={slug} onChange={(e: any) => { setSlugTouched(true); setSlug(e.target.value); setError(""); }} onBlur={() => { const normalized = normalizeSlugSuggestion(slug); setSlug(normalized); setSlugBlurred(true); setSlugSubmitted(true); }} error={slugSubmitted || slugBlurred ? (slugAvailability === "unavailable" && slugAvailabilityValue === normalizeSlugSuggestion(slug) ? "That URL is already taken. Try another one." : slugError) : ""} success={slugAvailability === "available" && slugAvailabilityValue === normalizeSlugSuggestion(slug) ? "Available" : ""} description={slugAvailability === "checking" ? "Checking availability…" : "Use a name customers will recognize."} autoCapitalize="none" autoCorrect="off" /><small className="slug-preview">{location.origin}/b/{normalizeSlugSuggestion(slug) || "your-business"}</small><label className="field"><span>Business category</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{[["restaurant", "Restaurant"], ["cafe", "Cafe"], ["cloud_kitchen", "Cloud Kitchen"], ["retail", "Retail Store"], ["salon", "Salon"], ["clinic", "Clinic"], ["hotel", "Hotel"], ["professional_services", "Professional Services"], ["generic", "Other"]].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label></>}
    {step === 1 && <><Field title="Description" value={description} onChange={(e: any) => setDescription(e.target.value)} /><Field title="Phone number" value={phone} onChange={(e: any) => setPhone(e.target.value)} inputMode="tel" /><Field title="Address" value={address} onChange={(e: any) => setAddress(e.target.value)} /><Field title="Opening hours" value={hours} onChange={(e: any) => setHours(e.target.value)} /></>}
    {step === 2 && restaurant && <><label className="check"><input type="checkbox" checked readOnly /> Accept restaurant orders</label><label className="check"><input type="checkbox" checked readOnly /> Dine-in</label><label className="check"><input type="checkbox" checked readOnly /> Takeaway</label><Field title="Tax (%)" type="number" min="0" max="30" step="0.01" value={tax} onChange={(e: any) => setTax(e.target.value)} /><Field title="Packaging fee (₹)" type="number" min="0" step="1" value={packaging} onChange={(e: any) => setPackaging(e.target.value)} /></>}
    {step === 2 && !restaurant && <div className="empty"><h3>Your category is ready</h3><p>Configure links, payments and services later from your dashboard.</p></div>}
    {step === 3 && restaurant && <><div className="onboarding-menu-list">{draft?.items?.map((i: Any) => <div className="list-row" key={i.id}><span>{i.name}</span><strong>{money(i.price_paise)}</strong></div>)}</div><div className="two-fields"><Field title="Item name" value={itemName} onChange={(e: any) => setItemName(e.target.value)} /><Field title="Price (₹)" type="number" value={itemPrice} onChange={(e: any) => setItemPrice(e.target.value)} /></div><button className="secondary" type="button" onClick={addItem} disabled={busy || !itemName || !itemPrice}>Add item</button><small>Customers cannot order until an available item exists. You can skip this step for a browse-only page.</small></>}
    {step === 3 && !restaurant && <p>Skip to publish your business page.</p>}
    {step === 4 && (primeEligible ? <div className="plan-grid">{(plans.length ? plans : [{ id: "prime", name: "Prime", price_paise: 59900, original_price_paise: 159900, max_staff: 5, entitlements: { locations: 10, staff: 5, orders: true, analytics: true, modules: true }, recommended: true }]).filter((plan: Any) => plan.id === "prime").map((plan: Any) => <button type="button" key={plan.id} className={`plan-card ${planId === plan.id ? "selected" : ""}`} onClick={() => setPlanId(plan.id)}><span className="plan-card-top"><Badge tone="green">RECOMMENDED</Badge>{planId === plan.id && <Check size={18} />}</span><strong>{plan.name}</strong><span className="plan-price"><del>{money(plan.original_price_paise || 159900)}</del> {money(plan.price_paise)}<small>/ month · Launch price</small></span><small>Dynamic QR · menu · orders · tables · analytics · up to {plan.max_staff || plan.entitlements?.staff || 5} staff</small></button>)}</div> : <div className="plan-grid"><div className="plan-card selected"><Badge>BUILT AROUND YOUR BUSINESS</Badge><strong>Custom</strong><span className="plan-price">Let’s talk</span><small>Custom onboarding, tailored customer experience, and dedicated setup support.</small></div></div>)}
    {step === 5 && <><div className="preview-panel"><Badge>{label(category)}</Badge><h2>{name}</h2><p>{description || "Your description will appear here."}</p><p>{address || "Add your address later from Business page."}</p></div><a className="button secondary" href={draft?.publicId ? `/q/${draft.publicId}` : "#"} target="_blank" rel="noreferrer">Preview as Customer <ArrowUpRight size={16} /></a></>}
    <div className="button-row onboarding-actions">{step > 0 && <button className="secondary" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}{step < 5 && <button className="primary" onClick={() => step === 4 ? (primeEligible ? (paymentVerified ? setStep(5) : startPrimeCheckout()) : publish()) : save(step + 1)} disabled={busy || (step === 0 && (!name || !slug))}>{busy ? (step === 4 && primeEligible ? "Preparing secure checkout…" : "Saving…") : step === 4 && !primeEligible ? "Request a callback" : step === 4 ? (paymentVerified ? "Continue setup" : "Continue with Prime") : "Next"} <ArrowUpRight size={16} /></button>}{step === 5 && <button className="primary" onClick={publish} disabled={busy || !planId || !paymentVerified}>{busy ? "Publishing…" : "Publish Business"}</button>}</div>
  </section>;
}
function Profile({ l, done }: any) {
  const [p, setP] = useState({ ...l.profile }),
    [name, setName] = useState(l.name),
    [category, setCategory] = useState(l.category),
    [published, setPublished] = useState(!!l.published),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <div className="two-columns profile-grid">
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await updateLocation(l.id, {
              name,
              category,
              profile: p,
              published,
              version: l.version,
            });
            setSaved(true);
            done();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <h2>Business details</h2>
        <ErrorBox error={error} />
        {saved && <p role="status">Changes saved.</p>}
        <Field
          title="Business name"
          value={name}
          onChange={(e: any) => setName(e.target.value)}
          required
        />
        <label className="field">
          <span>Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {[
              "restaurant",
              "cafe",
              "cloud_kitchen",
              "retail",
              "salon",
              "clinic",
              "hotel",
              "professional_services",
              "generic",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {["description", "address", "hours", "phone"].map((k) => (
          <Field
            key={k}
            title={label(k)}
            value={p[k]}
            onChange={(e: any) => setP({ ...p, [k]: e.target.value })}
          />
        ))}
        <h3>Customer QR experience</h3>
        <small>These destinations appear in the public action hub when configured.</small>
        <Field title="Google review URL" type="url" value={p.googleReviewUrl || ""} onChange={(e: any) => setP({ ...p, googleReviewUrl: e.target.value || null })} placeholder="https://g.page/r/.../review" />
        <Field title="Website URL" type="url" value={p.websiteUrl || ""} onChange={(e: any) => setP({ ...p, websiteUrl: e.target.value || null })} placeholder="https://example.com" />
        <Field title="WhatsApp number" value={p.whatsappNumber || ""} onChange={(e: any) => setP({ ...p, whatsappNumber: e.target.value })} inputMode="tel" placeholder="+919876543210" />
        <Field title="Directions URL" type="url" value={p.directionsUrl || ""} onChange={(e: any) => setP({ ...p, directionsUrl: e.target.value || null })} placeholder="https://maps.google.com/..." />
        <div className="two-fields">
          <Field title="Instagram URL" type="url" value={p.instagramUrl || ""} onChange={(e: any) => setP({ ...p, instagramUrl: e.target.value || null })} />
          <Field title="Facebook URL" type="url" value={p.facebookUrl || ""} onChange={(e: any) => setP({ ...p, facebookUrl: e.target.value || null })} />
          <Field title="YouTube URL" type="url" value={p.youtubeUrl || ""} onChange={(e: any) => setP({ ...p, youtubeUrl: e.target.value || null })} />
          <Field title="X / Twitter URL" type="url" value={p.xUrl || ""} onChange={(e: any) => setP({ ...p, xUrl: e.target.value || null })} />
          <Field title="LinkedIn URL" type="url" value={p.linkedinUrl || ""} onChange={(e: any) => setP({ ...p, linkedinUrl: e.target.value || null })} />
        </div>
        <h3>Custom page actions</h3>
        <small>
          Use trusted HTTPS destinations. Check spelling and ownership before
          publishing.
        </small>
        {p.actions.map((a: Any, i: number) => (
          <div className="action-editor" key={i}>
            <Field
              title="Button label"
              value={a.label}
              onChange={(e: any) =>
                setP({
                  ...p,
                  actions: p.actions.map((x: Any, j: number) =>
                    j === i ? { ...x, label: e.target.value } : x,
                  ),
                })
              }
            />
            <Field
              title="Destination URL"
              value={a.url}
              onChange={(e: any) =>
                setP({
                  ...p,
                  actions: p.actions.map((x: Any, j: number) =>
                    j === i ? { ...x, url: e.target.value } : x,
                  ),
                })
              }
            />
            <button
              type="button"
              className="text-button danger"
              onClick={() =>
                setP({
                  ...p,
                  actions: p.actions.filter((_: any, j: number) => j !== i),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={p.actions.length >= 12}
          onClick={() =>
            setP({ ...p, actions: [...p.actions, { label: "", url: "" }] })
          }
        >
          Add action
        </button>
        <h3>Customer options</h3>
        {[
          ["orderEnabled", "Accept menu orders"],
          ["requestEnabled", "Accept enquiry / booking requests"],
          ["payAtCounter", "Allow pay at counter"],
        ].map(([k, t]) => (
          <label className="check" key={k}>
            <input
              type="checkbox"
              checked={p[k]}
              onChange={(e) => setP({ ...p, [k]: e.target.checked })}
            />
            {t}
          </label>
        ))}
        {["takeaway", "dine_in"].map((t) => (
          <label className="check" key={t}>
            <input
              type="checkbox"
              checked={p.orderTypes.includes(t)}
              onChange={(e) =>
                setP({
                  ...p,
                  orderTypes: e.target.checked
                    ? [...p.orderTypes, t]
                    : p.orderTypes.filter((x: string) => x !== t),
                })
              }
            />
            {label(t)}
          </label>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Publish customer page
        </label>
        <button className="primary">
          Save changes <Check size={16} />
        </button>
      </form>
      <section>
        <div className="card">
          <div className="card-heading">
            <h2>Page preview</h2>
            <Badge>UNSAVED PREVIEW</Badge>
          </div>
          <div className="preview">
            <div className="business-avatar">{name[0]}</div>
            <h2>{name}</h2>
            <p>{p.description || "Your story goes here."}</p>
            <small>{p.address}</small>
            {p.orderEnabled && (
              <div className="preview-action">Explore menu →</div>
            )}
            {p.actions.map((a: Any, i: number) => (
              <div className="preview-action" key={i}>
                {a.label || "Action"} ↗
              </div>
            ))}
          </div>
        </div>
        <p className="muted">
          Publishing updates your page without changing its URL or QR.
        </p>
      </section>
    </div>
  );
}
function Catalogue({ l, done }: any) {
  const [error, setError] = useState(""),
    [edit, setEdit] = useState<Any | null>(null),
    [image, setImage] = useState("");
  return (
    <div className="two-columns">
      <section className="card">
        <div className="card-heading">
          <h2>Your offerings</h2>
          <Badge>{l.items.length} ITEMS</Badge>
        </div>
        {!l.items.length && (
          <Empty title="Something worth discovering">
            Add your menu items, products or services.
          </Empty>
        )}
        {l.items.map((item: Any) => (
          <div className="list-row" key={item.id}>
            {item.image && <img className="thumb" src={item.image} alt="" />}
            <div className="grow">
              <strong>{item.name}</strong>
              <small>
                {item.section} · {money(item.price_paise)}
              </small>
            </div>
            <Badge tone={item.available ? "green" : ""}>
              {item.available ? "Available" : "Sold out"}
            </Badge>
            <button
              className="text-button"
              onClick={() => {
                setEdit(item);
                setImage(item.image || "");
              }}
            >
              Edit
            </button>
          </div>
        ))}
        <h3>Categories</h3>
        {(l.categories || []).map((c: Any) => <div className="list-row" key={c.id}><div className="grow"><strong>{c.name}</strong><small>{c.available ? "Visible" : "Hidden"}</small></div><button className="text-button" onClick={() => { const name = prompt("Category name", c.name); if (name && name !== c.name) api(`/locations/${l.id}/menu/categories/${c.id}`, "PATCH", { name, description: c.description || "", displayOrder: c.display_order, enabled: true, available: true }).then(done).catch((e) => setError(e.message)); }}>Edit</button><button className="text-button danger" onClick={() => api(`/locations/${l.id}/menu/categories/${c.id}`, "DELETE").then(done).catch((e) => setError(e.message))}>Archive</button></div>)}
        <button className="secondary" onClick={() => { const name = prompt("New category name"); if (name) api(`/locations/${l.id}/menu/categories`, "POST", { name, displayOrder: (l.categories || []).length }).then(done).catch((e) => setError(e.message)); }}>Add category</button>
      </section>
      <form
        className="card"
        key={edit?.id || "new"}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          try {
            await api(
              `/locations/${l.id}/items${edit ? "/" + edit.id : ""}`,
              edit ? "PUT" : "POST",
              {
                name: f.get("name"),
                description: f.get("description"),
                section: f.get("section"),
                price_paise: Math.round(Number(f.get("price")) * 100),
                available: f.get("available") === "on",
                image: image || null,
                categoryId: f.get("categoryId") || null,
                discountedPricePaise: f.get("discountedPrice") ? Math.round(Number(f.get("discountedPrice")) * 100) : null,
                foodType: f.get("foodType") || "OTHER",
                featured: f.get("featured") === "on",
                stockStatus: f.get("available") === "on" ? "AVAILABLE" : "SOLD_OUT",
              },
            );
            setEdit(null);
            setImage("");
            form.reset();
            done();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <h2>{edit ? "Edit item" : "Add an item"}</h2>
        <ErrorBox error={error} />
        <Field title="Name" name="name" required defaultValue={edit?.name} />
        <Field
          title="Section"
          name="section"
          defaultValue={edit?.section || "Menu"}
          required
        />
        <label className="field"><span>Category</span><select name="categoryId" defaultValue={edit?.category_id || ""}><option value="">No category</option>{(l.categories || []).map((c: Any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <Field
          title="Description"
          name="description"
          defaultValue={edit?.description || ""}
        />
        <Field title="Discounted price (₹)" name="discountedPrice" type="number" min="0" step="0.01" defaultValue={edit?.discounted_price_paise ? edit.discounted_price_paise / 100 : ""} />
        <label className="field"><span>Food type</span><select name="foodType" defaultValue={edit?.food_type || "OTHER"}>{["VEG","NON_VEG","EGG","VEGAN","OTHER"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <Field
          title="Price (₹)"
          name="price"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={edit ? edit.price_paise / 100 : ""}
        />
        <Field
          title="Image URL (HTTPS)"
          value={image}
          onChange={(e: any) => setImage(e.target.value)}
        />
        <Field
          title="Or upload an image (up to 5 MB)"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e: any) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const data = new FormData();
              data.append("file", f);
              const res = await fetch(`/api/locations/${l.id}/upload`, {
                method: "POST",
                body: data,
                credentials: "include",
              });
              const out = await res.json();
              if (!res.ok) throw Error(out.error);
              setImage(out.url);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
        <label className="check">
          <input
            type="checkbox"
            name="available"
            defaultChecked={edit ? !!edit.available : true}
          />
          Available to order
        </label>
        <label className="check"><input type="checkbox" name="featured" defaultChecked={!!edit?.featured} /> Featured item</label>
        <div className="button-row">
          <button className="primary">Save item</button>
          {edit && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEdit(null);
                setImage("");
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
function Tables({ l }: any) {
  const { data, error, load } = usePoll(`/locations/${l.id}/tables`, 10000);
  const [team, setTeam] = useState<Any[]>([]), [assignees, setAssignees] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Any | null>(null);
  const [history, setHistory] = useState<Any | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => { api(`/tenants/${l.tenant_id}/staff`).then((rows) => setTeam((rows as Any[]).filter((member) => member.role !== "owner"))).catch(() => {}); }, [l.tenant_id]);
  useEffect(() => { if (!data?.tables?.length) return; Promise.all(data.tables.map(async (table: Any) => { try { const result = await api(`/locations/${l.id}/tables/${table.id}/assignees`); return [table.id, result.staff?.[0]?.id || ""] as const; } catch { return [table.id, ""] as const; } })).then((rows) => setAssignees(Object.fromEntries(rows))); }, [data?.tables, l.id]);
  async function assign(tableId: string, userId: string) { try { await api(`/locations/${l.id}/tables/${tableId}/assignees`, "PUT", { userIds: userId ? [userId] : [] }); setAssignees((current) => ({ ...current, [tableId]: userId })); } catch (e) { setFailure((e as Error).message); } }
  async function save(e: any) {
    e.preventDefault();
    try {
      await api(`/locations/${l.id}/tables`, "POST", { name });
      setName("");
      load();
    } catch (e) { setFailure((e as Error).message); }
  }
  async function toggle(t: Any) {
    try {
      await api(`/locations/${l.id}/tables/${t.id}`, "PATCH", { name: t.name, enabled: !t.enabled });
      load();
    } catch (e) { setFailure((e as Error).message); }
  }
  async function showHistory(t: Any) {
    setSelected(t);
    try { setHistory(await api(`/locations/${l.id}/tables/${t.id}/history`)); }
    catch (e) { setFailure((e as Error).message); }
  }
  return <div className="two-columns">
    <section className="card">
      <div className="card-heading"><div><Badge>RESTAURANT OPERATIONS</Badge><h2>Tables</h2></div><Badge>{data?.tables?.filter((t: Any) => t.enabled).length || 0} ACTIVE</Badge></div>
      <ErrorBox error={error || failure} />
      {!data?.tables?.length && <Empty title="Create your first table">Every table gets its own permanent QR context.</Empty>}
      {data?.tables?.map((t: Any) => <div className="list-row table-row" key={t.id}>
        <div className="grow"><strong>{t.name}</strong><small>{t.enabled ? "Active table QR" : "Disabled · QR unavailable"}</small></div>
        {l.role !== "staff" && <label className="table-assignee"><span>Orders to</span><select aria-label={`Assign orders for ${t.name}`} value={assignees[t.id] || ""} onChange={(e) => assign(t.id, e.target.value)}><option value="">Owner fallback</option>{team.map((member) => <option key={member.id} value={member.id}>{member.email}</option>)}</select></label>}
        <Badge tone={t.enabled ? "green" : ""}>{t.enabled ? "ACTIVE" : "OFF"}</Badge>
        <button className="text-button" onClick={() => showHistory(t)}>History</button>
        <button className="text-button" onClick={() => {
          const next = prompt("Table name", t.name);
          if (next && next !== t.name) api(`/locations/${l.id}/tables/${t.id}`, "PATCH", { name: next, enabled: !!t.enabled }).then(load).catch((e) => setFailure(e.message));
        }}><Pencil size={14} /> Rename</button>
        <button className="text-button" onClick={() => toggle(t)}>{t.enabled ? "Disable" : "Enable"}</button>
      </div>)}
      {selected && history && <div className="table-history card-soft">
        <div className="card-heading"><h3>{selected.name} history</h3><button className="text-button" onClick={() => {setSelected(null);setHistory(null);}}>Close</button></div>
        <strong>{history.today.length} orders today</strong>
        {history.orders.slice(0, 5).map((o: Any) => <div className="list-row" key={o.id}><span>#{o.publicOrderNumber}</span><Badge>{label(o.state)}</Badge><strong>{money(o.amount_paise)}</strong></div>)}
        {!history.orders.length && <p className="muted">No orders for this table yet.</p>}
      </div>}
    </section>
    <section className="card">
      <h2>Add a table</h2>
      <p>Use clear names such as Table 5, Cabin A or Rooftop 1. Printed table QRs keep their token when renamed.</p>
      <form onSubmit={save}><Field title="Table name" value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Table 1" required /><button className="primary"><Plus size={16} /> Add table</button></form>
      <h3>Table QR downloads</h3>
      {data?.tables?.filter((t: Any) => t.enabled).map((t: Any) => <div className="table-qr-row" key={t.id}><strong>{t.name}</strong><div className="button-row">
        <a className="button secondary" href={`/api/locations/${l.id}/qr?format=png&kind=table&tableId=${t.id}`} download>PNG</a>
        <a className="button secondary" href={`/api/locations/${l.id}/qr?format=svg&kind=table&tableId=${t.id}`} download>SVG</a>
        <button type="button" className="text-button" onClick={() => navigator.clipboard.writeText(t.url)}>Copy link</button>
      </div></div>)}
    </section>
  </div>;
}
const appearanceDefaults = { themePreset: "minimal", layoutPreset: "restaurant", primaryColor: "#174f43", secondaryColor: "#deedaf", backgroundColor: "#f6f7f4", textColor: "#202f2c", buttonColor: "#174f43", buttonTextColor: "#ffffff", logoUrl: null, coverUrl: null, actionOrder: [], hiddenActions: [] };
function CustomerDesigner({ l, done }: any) {
  const [p, setP] = useState({ ...l.profile });
  const [a, setA] = useState({ ...appearanceDefaults, ...(l.profile.appearance || {}) });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const actionKeys = ["menu", "pay", "review", "instagram", "facebook", "youtube", "linkedin", "x", "directions", "whatsapp", "call", "website"];
  const orderedKeys = [...(a.actionOrder || []), ...actionKeys.filter((x) => !(a.actionOrder || []).includes(x))];
  const set = (key: string, value: string) => setA((x: Any) => ({ ...x, [key]: value, themePreset: "custom" }));
  async function save(e: any) {
    e.preventDefault(); setError(""); setSaved(false);
    try {
      await updateLocation(l.id, { name: l.name, category: l.category, published: !!l.published, version: l.version, profile: { ...p, appearance: a } });
      setSaved(true); done();
    } catch (e) { setError((e as Error).message); }
  }
  async function upload(e: any, target: "logoUrl" | "coverUrl") {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const f = new FormData(); f.append("file", file);
      const res = await fetch(`/api/locations/${l.id}/upload`, { method: "POST", body: f, credentials: "include" });
      const out = await res.json(); if (!res.ok) throw Error(out.error);
      setA((x: Any) => ({ ...x, [target]: out.url, themePreset: "custom" }));
    } catch (e) { setError((e as Error).message); }
  }
  const presets: Any = {
    minimal: { backgroundColor: "#f6f7f4", textColor: "#202f2c", primaryColor: "#174f43", secondaryColor: "#deedaf", buttonColor: "#174f43", buttonTextColor: "#ffffff" },
    midnight: { backgroundColor: "#090b0c", textColor: "#f7faf8", primaryColor: "#d9f0a6", secondaryColor: "#1a2422", buttonColor: "#f7faf8", buttonTextColor: "#090b0c" },
    warm: { backgroundColor: "#fff8ed", textColor: "#3f2c20", primaryColor: "#a9552f", secondaryColor: "#f2d39b", buttonColor: "#a9552f", buttonTextColor: "#ffffff" },
    elegant: { backgroundColor: "#f9f8f5", textColor: "#252525", primaryColor: "#252525", secondaryColor: "#e6e1d7", buttonColor: "#252525", buttonTextColor: "#ffffff" },
    bold: { backgroundColor: "#fff", textColor: "#161616", primaryColor: "#101010", secondaryColor: "#f0d24f", buttonColor: "#101010", buttonTextColor: "#ffffff" },
  };
  function preset(value: string) { setA((x: Any) => ({ ...x, themePreset: value, ...(presets[value] || {}) })); }
  const previewStyle: any = { "--business-bg": a.backgroundColor, "--business-text": a.textColor, "--business-primary": a.primaryColor, "--business-secondary": a.secondaryColor, "--business-button": a.buttonColor, "--business-button-text": a.buttonTextColor };
  return <div className="two-columns">
    <form className="card" onSubmit={save}>
      <div className="card-heading"><div><span className="eyebrow">CUSTOMER EXPERIENCE</span><h2>Customer page</h2></div><a className="text-button" href={`/q/${l.publicId}`} target="_blank" rel="noreferrer">Preview as customer <ExternalLink size={14} /></a></div>
      <ErrorBox error={error} />{saved && <p role="status">Customer page updated without changing the QR.</p>}
      <label className="field"><span>Theme preset</span><select value={a.themePreset} onChange={(e) => preset(e.target.value)}>{["minimal","midnight","warm","elegant","bold","custom"].map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className="field"><span>Layout</span><select value={a.layoutPreset} onChange={(e) => setA((x: Any) => ({ ...x, layoutPreset: e.target.value }))}><option value="restaurant">Restaurant focus</option><option value="hero">Hero</option><option value="compact">Compact</option></select></label>
      <div className="color-grid">{[["backgroundColor","Background"],["textColor","Text"],["primaryColor","Primary"],["secondaryColor","Accent"],["buttonColor","Button"],["buttonTextColor","Button text"]].map(([key,title]) => <label className="color-field" key={key}><span>{title}</span><input type="color" value={a[key]} onChange={(e) => set(key, e.target.value)} /><code>{a[key]}</code></label>)}</div>
      <label className="field"><span>Business logo</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => upload(e, "logoUrl")} /></label>
      {a.logoUrl && <img className="logo-preview" src={a.logoUrl} alt="Business logo preview" />}
      <label className="field"><span>Cover image</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => upload(e, "coverUrl")} /></label>
      {a.coverUrl && <img className="cover-preview" src={a.coverUrl} alt="Business cover preview" />}
      <h3>Visible actions</h3>
      {[["menu","Menu"],["pay","Pay"],["review","Google Review"],["whatsapp","WhatsApp"],["call","Call"],["directions","Directions"],["website","Website"],["instagram","Instagram"],["facebook","Facebook"],["youtube","YouTube"]].map(([key,title]) => <label className="check" key={key}><input type="checkbox" checked={!a.hiddenActions.includes(key)} onChange={(e) => setA((x: Any) => ({ ...x, hiddenActions: e.target.checked ? x.hiddenActions.filter((v: string) => v !== key) : [...x.hiddenActions, key] }))} />{title}</label>)}
      <h3>Action order</h3>
      <div className="action-order-list">{orderedKeys.map((key, i) => <div className="list-row" key={key}><span>{label(key)}</span><div><button type="button" className="text-button" disabled={i === 0} onClick={() => { const next = [...orderedKeys]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setA((x: Any) => ({ ...x, actionOrder: next })); }}>↑</button><button type="button" className="text-button" disabled={i === orderedKeys.length - 1} onClick={() => { const next = [...orderedKeys]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; setA((x: Any) => ({ ...x, actionOrder: next })); }}>↓</button></div></div>)}</div>
      <p className="muted">Actions without configured URLs remain hidden on the customer page. Colors are controlled tokens; custom CSS is not accepted.</p>
      <button className="primary">Save customer experience <Check size={16} /></button>
    </form>
    <section className="card">
      <div className="card-heading"><h2>Live customer preview</h2><Badge>UNSAVED</Badge></div>
      <div className="customer-live-preview" style={previewStyle}>
        {a.logoUrl ? <img src={a.logoUrl} alt="" /> : <div className="business-avatar">{l.name[0]}</div>}
        <small>{label(l.category)} · Open now</small><h2>{l.name}</h2><p>{p.description || "Your business description appears here."}</p>
        {!a.hiddenActions.includes("menu") && <div className="preview-action primary-preview">View Menu <ArrowUpRight size={15} /></div>}
        <div className="preview-mini-grid">{!a.hiddenActions.includes("pay") && <div className="preview-action">Pay</div>}{!a.hiddenActions.includes("whatsapp") && <div className="preview-action">WhatsApp</div>}{!a.hiddenActions.includes("call") && <div className="preview-action">Call</div>}{!a.hiddenActions.includes("directions") && <div className="preview-action">Directions</div>}</div>
        {!a.hiddenActions.includes("review") && p.googleReviewUrl && <div className="preview-action">★ Leave a Review</div>}
        <small>Powered by 1QR Prime</small>
      </div>
      <p className="muted">This preview shares the same controlled appearance data used by the public QR hub.</p>
    </section>
  </div>;
}
function usePoll(path: string, delay = 4000) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [at, setAt] = useState<Date | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api(path));
      setError("");
      setAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    setData(null);
    load();
    const timer = setInterval(load, delay);
    return () => clearInterval(timer);
  }, [load, delay]);
  return { data, error, at, load };
}
const next: Record<string, string[]> = {
  submitted: ["accepted", "rejected", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
};
function Orders({ l }: any) {
  const { data, error, at, load } = usePoll(`/locations/${l.id}/orders`),
    { data: tableData } = usePoll(`/locations/${l.id}/tables`, 15000),
    [failure, setFailure] = useState(""),
    [sound, setSound] = useState(false),
    [filter, setFilter] = useState("active"),
    [tableFilter, setTableFilter] = useState("all");
  const seen = useRef<Set<string> | null>(null),
    ctx = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!data) return;
    const ids = new Set<string>(data.orders.map((o: Any) => o.id));
    if (
      sound &&
      seen.current &&
      [...ids].some((x) => !seen.current!.has(x)) &&
      ctx.current
    ) {
      const o = ctx.current.createOscillator(),
        g = ctx.current.createGain();
      o.connect(g);
      g.connect(ctx.current.destination);
      g.gain.value = 0.12;
      o.frequency.value = 660;
      o.start();
      o.stop(ctx.current.currentTime + 0.25);
    }
    seen.current = ids;
  }, [data, sound]);
  return (
    <>
      <div className="toolbar">
        <Badge tone={error ? "amber" : "green"}>
          {error ? "Reconnecting · retrying every 4s" : "Polling · connected"}
          {at && ` · ${at.toLocaleTimeString("en-IN")}`}
        </Badge>
        <div className="button-row">
          <button
            className="secondary"
            onClick={() => {
              if (!ctx.current) ctx.current = new AudioContext();
              ctx.current.resume();
              setSound(!sound);
            }}
          >
            <Bell size={16} />
            {sound ? "Sound on" : "Enable sound"}
          </button>
          <button className="secondary" onClick={load}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>
      <ErrorBox error={failure || error} />
      <div className="tabs">
        {["active", "submitted", "accepted", "preparing", "ready", "completed", "all"].map((x) => (
          <button
            key={x}
            className={filter === x ? "selected" : ""}
            onClick={() => setFilter(x)}
          >
            {label(x)} orders
          </button>
        ))}
      </div>
      <label className="field compact-filter"><span>Table</span><select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}><option value="all">All tables</option>{tableData?.tables?.map((t: Any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <div className="orders-grid">
        {data?.orders
          .filter(
            (o: Any) =>
              (filter === "all" ||
              (filter === "active" && !["completed", "rejected", "cancelled"].includes(o.state)) ||
              filter === o.state) &&
              (tableFilter === "all" || o.table_id === tableFilter),
          )
          .map((o: Any) => (
            <article className="card order-card" key={o.id}>
              <div className="card-heading">
                <h3>#{o.publicOrderNumber || o.id.slice(0, 8)}</h3>
                <Badge tone={o.state === "submitted" ? "amber" : "green"}>
                  {label(o.state)}
                </Badge>
              </div>
              <small>
                {label(o.order_type)} ·{" "}
                {o.tableName ? <strong className="order-table-label">{o.tableName}</strong> : "General QR · "}
                {new Date(o.created_at + "Z").toLocaleString("en-IN")}
              </small>
              {(o.customer_name || o.customer_phone) && <small>{o.customer_name || "Guest"}{o.customer_phone ? ` · ${o.customer_phone}` : ""}</small>}
              <div className="order-lines">
                {o.lines.map((line: Any) => (
                  <div key={line.itemId}>
                    <span>
                      {line.quantity} × {line.name}
                    </span>
                    <strong>{money(line.pricePaise * line.quantity)}</strong>
                  </div>
                ))}
              </div>
              {o.instructions && <p className="note">{o.instructions}</p>}
              <div className="list-row">
                <strong>{money(o.amount_paise)}</strong>
                <Badge>{label(o.payment_state)}</Badge>
              </div>
              <small>
                Method: {label(o.payment_method)}. Merchant confirmation is
                separate from provider verification.
              </small>
              <div className="button-row">
                {(next[o.state] || []).map((s, i) => (
                  <button
                    className={i === 0 ? "primary" : "secondary"}
                    key={s}
                    onClick={async () => {
                      try {
                        await api(
                          `/locations/${l.id}/orders/${o.id}/state`,
                          "POST",
                          { state: s, expectedState: o.state },
                        );
                        load();
                      } catch (e) {
                        setFailure((e as Error).message);
                        load();
                      }
                    }}
                  >
                    {label(s)}
                  </button>
                ))}
              </div>
              {o.payment_state === "pending" && l.role !== "staff" && (
                <button
                  className="text-button"
                  onClick={async () => {
                    const reason = prompt(
                      "After checking your bank/provider or receiving cash, record the evidence/reference. This is merchant confirmation, not provider verification.",
                    );
                    if (!reason) return;
                    try {
                      await api(
                        `/locations/${l.id}/orders/${o.id}/confirm-payment`,
                        "POST",
                        { reason },
                      );
                      load();
                    } catch (e) {
                      setFailure((e as Error).message);
                    }
                  }}
                >
                  Record received payment
                </button>
              )}
            </article>
          ))}
      </div>
      {data && !data.orders.length && (
        <section className="card">
          <Empty title="Ready for the next order">
            New orders will appear here as customers place them.
          </Empty>
        </section>
      )}
      <Requests l={l} />
    </>
  );
}
function Requests({ l }: any) {
  const { data, error, load } = usePoll(`/locations/${l.id}/requests`, 10000),
    [failure, setFailure] = useState("");
  return (
    <section className="card spaced">
      <h2>Enquiries & booking requests</h2>
      <ErrorBox error={failure || error} />
      {data?.length ? (
        data.map((r: Any) => (
          <div className="list-row" key={r.id}>
            <div className="grow">
              <strong>
                {r.name} · {r.contact}
              </strong>
              <p>{r.message}</p>
              <small>Request only · {r.state}</small>
            </div>
            {r.state === "new" && (
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await api(
                      `/locations/${l.id}/requests/${r.id}/close`,
                      "POST",
                    );
                    load();
                  } catch (e) {
                    setFailure((e as Error).message);
                  }
                }}
              >
                Mark handled
              </button>
            )}
          </div>
        ))
      ) : (
        <p className="muted">
          No requests yet. Requests never auto-confirm an appointment.
        </p>
      )}
    </section>
  );
}
function Payments({ l, emailVerified }: any) {
  const { data, error, load } = usePoll(`/locations/${l.id}/routes`, 15000),
    [failure, setFailure] = useState(""),
    [verificationRoute, setVerificationRoute] = useState<string | null>(null),
    [evidence, setEvidence] = useState("");
  async function act(path: string, body: Any = {}) {
    try {
      await api(`/locations/${l.id}/routes/${path}`, "POST", body);
      load();
    } catch (e) {
      setFailure((e as Error).message);
    }
  }
  return (
    <>
      <div className="note">
        <ShieldCheck />
        <span>
          <strong>Your destination. Your decision.</strong> Routes require
          independent verification before activation. Switching affects new
          attempts only; it cannot fix a customer’s bank or app failure.
        </span>
      </div>
      {!emailVerified && l.role === "owner" && (
        <div className="note">
          <ShieldCheck />
          <span>
            <strong>Verify your email to add payment destinations.</strong>{" "}
            Existing routes remain visible, but production blocks new payment
            destinations until the owner email is verified.
          </span>
        </div>
      )}
      <ErrorBox error={failure || error} />
      <div className="two-columns">
        <section className="card">
          <div className="card-heading">
            <h2>Payment destinations</h2>
            <button
              className="text-button"
              disabled={!data?.previousId}
              onClick={() => act("rollback")}
            >
              Rollback ↶
            </button>
          </div>
          {data?.routes.map((r: Any) => (
            <div
              className={`route-card ${r.state === "active" ? "route-active" : ""}`}
              key={r.id}
            >
              <div className="card-heading">
                <h3>{r.label}</h3>
                <Badge tone={r.state === "active" ? "green" : ""}>
                  {label(r.state)}
                </Badge>
              </div>
              <strong>{r.vpa}</strong>
              <p>{r.payee}</p>
              <small>
                Basic UPI · Automatic payment confirmation unavailable
              </small>
              <div className="button-row">
                {r.state === "draft" && l.role === "owner" && (
                  <button
                    className="secondary"
                    onClick={() => setVerificationRoute(r.id)}
                  >
                    Request verification
                  </button>
                )}
                {verificationRoute === r.id && (
                  <form
                    className="inline-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!evidence.trim()) return;
                      await act(`${r.id}/request-verification`, { evidence: evidence.trim() });
                      setEvidence("");
                      setVerificationRoute(null);
                    }}
                  >
                    <Field title="Verification reference" name="evidence" value={evidence} onChange={(e: any) => setEvidence(e.target.value)} placeholder="Reference checked ownership evidence" required />
                    <small>Do not include bank passwords, PINs or full account numbers.</small>
                    <div className="button-row">
                      <button className="primary" type="submit">Submit for review</button>
                      <button className="text-button" type="button" onClick={() => setVerificationRoute(null)}>Cancel</button>
                    </div>
                  </form>
                )}
                {r.state === "verified" && (
                  <button
                    className="primary"
                    onClick={() =>
                      act(`${r.id}/activate`, {
                        reason: "Merchant selected route",
                      })
                    }
                  >
                    Make active
                  </button>
                )}
                {r.state !== "active" &&
                  r.state !== "disabled" &&
                  l.role === "owner" && (
                    <button
                      className="text-button danger"
                      onClick={() => act(`${r.id}/disable`)}
                    >
                      Disable
                    </button>
                  )}
              </div>
            </div>
          ))}
          {!data?.routes.length && (
            <Empty title="Add your first destination">
              Start with a merchant UPI ID and request verification.
            </Empty>
          )}
        </section>
        {l.role === "owner" && (
          <form
            className="card"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!emailVerified) {
                setFailure("Verify your email before adding payment destinations.");
                return;
              }
              const form = e.currentTarget;
              try {
                await api(
                  `/locations/${l.id}/routes`,
                  "POST",
                  Object.fromEntries(new FormData(form)),
                );
                form.reset();
                load();
              } catch (e) {
                setFailure((e as Error).message);
              }
            }}
          >
            <h2>Add a destination</h2>
            <Field
              title="Label"
              name="label"
              placeholder="Primary business account"
              required
            />
            <Field
              title="Merchant UPI ID"
              name="vpa"
              placeholder="business@bank"
              required
            />
            <Field title="Payee name" name="payee" required />
            <p className="muted">
              New destinations are saved as drafts. Support must independently
              verify merchant ownership before activation.
            </p>
            <button className="primary" disabled={!emailVerified}>
              Submit payment destination <Plus size={16} />
            </button>
          </form>
        )}
      </div>
    </>
  );
}
function QrStudio({ l }: any) {
  const [kind, setKind] = useState("page");
  const publicUrl = `${browserOrigin}/q/${l.publicId}`;
  async function share() {
    if (navigator.share) await navigator.share({ title: l.name, text: "Scan to explore and order", url: publicUrl });
    else await navigator.clipboard.writeText(publicUrl);
  }
  function printCard() {
    const w = window.open("", "1qr-print-card", "width=600,height=760");
    if (!w) return;
    // Build the print document with DOM APIs. Business names are tenant-controlled
    // text and must never be interpolated into HTML written with document.write.
    w.document.title = `${l.name} · 1QR`;
    const style = w.document.createElement("style");
    style.textContent = "body{font-family:Arial;text-align:center;padding:40px;color:#174f43}img{width:420px;max-width:90vw}h1{font-size:32px}p{letter-spacing:2px;font-weight:bold}";
    const heading = w.document.createElement("h1");
    heading.textContent = l.name;
    const intro = w.document.createElement("p");
    intro.textContent = "SCAN TO EXPLORE";
    const image = w.document.createElement("img");
    image.src = `${location.origin}/api/locations/${encodeURIComponent(l.id)}/qr?format=svg&kind=page`;
    image.alt = "QR";
    const outro = w.document.createElement("p");
    outro.textContent = "Scan · Browse · Order";
    w.document.head.append(style);
    w.document.body.append(heading, intro, image, outro);
    w.document.close(); w.focus(); w.print();
  }
  return (
    <div className="two-columns">
      <section className="card qr-card">
        {localOrigin && <small className="qr-local-note">Local preview — this QR only works on this computer.</small>}
        {temporaryPreviewOrigin && <small className="qr-local-note">Preview link — use the production QR before printing.</small>}
        {!localOrigin && !temporaryPreviewOrigin && <Badge>READY FOR YOUR COUNTER</Badge>}
        <h2>{l.name}</h2>
        <p>
          {kind === "page"
            ? "Scan to explore, connect and order"
            : "Scan with a compatible UPI app to pay"}
        </p>
        {kind === "page" || l.active_route_id ? (
          <img
            className="qr-image"
            src={`/api/locations/${l.id}/qr?format=svg&kind=${kind}`}
            alt={`${l.name} ${kind} QR code`}
          />
        ) : (
          <Empty title="No active payment route">
            Verify and activate a destination first.
          </Empty>
        )}
        <Brand />
      </section>
      <section className="card">
        <h2>Your QR, made to last.</h2>
        <p>
          The business-page QR uses a stable URL. Update your details without
          reprinting.
        </p>
        <label className="field">
          <span>QR format</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="page">Business page · regular phone camera</option>
            <option value="payment">Payment only · UPI app</option>
          </select>
        </label>
        <div className="button-row">
          {["png", "svg"].map((f) => (
            <a
              className="button primary"
              key={f}
              href={`/api/locations/${l.id}/qr?format=${f}&kind=${kind}`}
              download
            >
              <Download size={17} />
              {f.toUpperCase()}
            </a>
          ))}
        </div>
        <div className="button-row">
          <button className="secondary" onClick={share}>{localOrigin ? "Copy local test link" : "Share / copy link"}</button>
          <button className="secondary" onClick={printCard}>Print card</button>
        </div>
        <p className="public-link"><strong>{localOrigin ? "Local test URL" : temporaryPreviewOrigin ? "Temporary preview URL" : "Public URL"}</strong><br />{publicUrl}</p>
        <h3>Print with confidence</h3>
        <ul>
          <li>PNG: 1200 × 1200 pixels. Print at 100 × 100 mm or larger.</li>
          <li>SVG: vector artwork for your printer.</li>
          <li>
            Keep the white border and black modules. Do not add a logo or reduce
            contrast.
          </li>
          <li>
            Test the final printed code on customer devices before putting it on
            display.
          </li>
        </ul>
        <div className="note">
          One QR opening different destinations by scanner is unverified. Use
          the business-page QR and its Pay action, or display a separate payment
          QR. Printed payment QRs do not change when routes switch.
        </div>
      </section>
    </div>
  );
}
function Analytics({ l }: any) {
  const { data, error } = usePoll(`/locations/${l.id}/analytics`, 30000);
  const kinds = [
    "qr_scan",
    "page_view",
    "action_tap",
    "menu_view",
    "cart_start",
    "order_submitted",
    "payment_attempt",
    "payment_verified",
  ];
  return (
    <>
      <ErrorBox error={error} />
      <div className="stats">
        {kinds.map((k) => (
          <Stat
            key={k}
            title={label(k)}
            value={
              data
                ?.filter((x: Any) => x.kind === k)
                .reduce((n: number, x: Any) => n + x.count, 0) || 0
            }
            note={
              k === "payment_verified"
                ? "Requires a verified provider integration"
                : "Aggregate recorded events"
            }
          />
        ))}
      </div>
      <div className="card">
        <h2>Clear signals, honest outcomes</h2>
        <p>
          Page events are approximate counts, not unique people. No
          fingerprinting is used. A QR-origin visit counts only when the page
          opens; direct UPI scans cannot be observed here. A payment attempt is
          not a completed payment.
        </p>
      </div>
    </>
  );
}
function Staff({ l }: any) {
  const { data, error, load } = usePoll(`/tenants/${l.tenant_id}/staff`, 30000),
    [failure, setFailure] = useState(""), [invitations, setInvitations] = useState<Any[]>([]);
  const loadInvitations = useCallback(() => api(`/tenants/${l.tenant_id}/staff/invitations`).then((value) => setInvitations(value as Any[])).catch((e) => setFailure((e as Error).message)), [l.tenant_id]);
  useEffect(() => { loadInvitations(); }, [loadInvitations]);
  return (
    <div className="two-columns">
      <section className="card">
        <h2>Active members</h2>
        <p className="muted">Manage who can access this business.</p>
        <ErrorBox error={failure || error} />
        {data?.map((u: Any) => (
          <div className="list-row" key={u.id}>
            <div className="grow">
              <strong>{u.email}</strong>
              <small>{u.role}</small>
            </div>
            {u.role !== "owner" && (
              <button
                className="text-button danger"
                onClick={async () => {
                  try {
                    await api(
                      `/tenants/${l.tenant_id}/staff/${u.id}`,
                      "DELETE",
                    );
                    load();
                  } catch (e) {
                    setFailure((e as Error).message);
                  }
                }}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </section>
      <section className="card">
        <h2>Pending invitations</h2>
        {!invitations.length && <Empty title="No pending invitations">Invite a trusted teammate to help operate this business.</Empty>}
        {invitations.filter((x) => !x.accepted_at && !x.revoked_at).map((invite) => <div className="list-row" key={invite.id}><div className="grow"><strong>{invite.name}</strong><small>{invite.email} · {label(invite.role)} · expires {new Date(invite.expires_at).toLocaleDateString()}</small></div><button className="text-button danger" onClick={async () => { try { await api(`/tenants/${l.tenant_id}/staff/invitations/${invite.id}/revoke`, "POST"); loadInvitations(); } catch (e) { setFailure((e as Error).message); } }}>Revoke</button></div>)}
      </section>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(
              `/tenants/${l.tenant_id}/staff/invitations`,
              "POST",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
            load();
          } catch (e) {
            setFailure((e as Error).message);
          }
        }}
      >
        <h2>Invite staff</h2>
        <p>Send a one-time invitation link. It expires after 72 hours.</p>
        <Field title="Name" name="name" required />
        <Field title="Email" type="email" name="email" required />
        <label className="field">
          <span>Permission</span>
          <select name="role">
            <option value="staff">Staff · orders and enquiries</option>
            <option value="manager">
              Manager · pages, orders and route switching
            </option>
          </select>
        </label>
        <small>
          Only owners control billing, team access and destination
          configuration.
        </small>
        <button className="primary">Send invitation</button>
      </form>
    </div>
  );
}
function SettingsPage({ tenant, go, refresh }: any) {
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  return (
    <div className="two-columns">
      <section className="card">
        <Badge>{label(tenant.billing_state)}</Badge>
        <h2>{tenant.plan_name}</h2>
        {tenant.plan_price_paise ? <p className="plan-summary-price">{money(tenant.plan_price_paise)} <small>/ month</small></p> : null}
        <p>{tenant.entitlements.staff} staff seats included</p>
        <button className="primary" onClick={() => go("new")}>Add a location</button>
        <button
          className="secondary"
          onClick={async () => {
            try {
              await api("/auth/request-verification", "POST");
              setNotice("Verification email sent. Check your inbox (and spam folder) for the verification link.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Verify email address
        </button>
        <h3>Your data</h3>
        <a
          className="button secondary"
          href="/api/account/export"
          download="1qr-export.json"
        >
          Export account data <Download size={16} />
        </a>
        <p>
          Deleting an owner account removes their locations, public pages, menus
          and order records. Restricted audit records and expiring backups are
          retained under the privacy policy.
        </p>
        <button
          className="text-button danger"
          onClick={async () => {
            const password = prompt(
              "To permanently delete your account and owned businesses, enter your password.",
            );
            if (
              !password ||
              !confirm(
                "Delete permanently? Printed business QR codes will stop resolving.",
              )
            )
              return;
            try {
              await api("/account/delete", "POST", {
                password,
                confirmation: "DELETE",
              });
              refresh();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Delete my account
        </button>
        <ErrorBox error={error} />
        {notice && <div className="success" role="status">{notice}</div>}
      </section>
      <section className="card">
        <h2>Built around your business</h2>
        <p>
          Your public business page remains available when a subscription
          expires. Paid management features may be restricted, while existing
          orders can still be handled.
        </p>
        <a href="/privacy">Privacy & retention</a>
      </section>
    </div>
  );
}
function Admin() {
  const [accounts, setAccounts] = useState<Any[]>([]),
    [selected, setSelected] = useState<Any | null>(null),
    [error, setError] = useState(""),
    [plans, setPlans] = useState<Any[]>([]),
    [leads, setLeads] = useState<Any[]>([]),
    [billingPayments, setBillingPayments] = useState<Any[]>([]),
    [billingStatus, setBillingStatus] = useState(""),
    [billingQuery, setBillingQuery] = useState("");
  async function detail(id: string) {
    try {
      setSelected(await api(`/admin/tenants/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    api("/admin/accounts?q=")
      .then((value) => setAccounts(value as Any[]))
      .catch((e) => setError(e.message));
    api("/admin/plans")
      .then((value) => setPlans(value as Any[]))
      .catch((e) => setError(e.message));
    api("/admin/sales-leads")
      .then((value) => setLeads(value as Any[]))
      .catch((e) => setError(e.message));
    api("/admin/billing-payments")
      .then((value) => setBillingPayments(value as Any[]))
      .catch((e) => setError(e.message));
  }, []);
  async function refreshBilling() {
    try {
      const query = new URLSearchParams();
      if (billingStatus) query.set("status", billingStatus);
      if (billingQuery.trim()) query.set("q", billingQuery.trim());
      setBillingPayments(await api(`/admin/billing-payments${query.toString() ? `?${query}` : ""}`) as Any[]);
    } catch (e) { setError((e as Error).message); }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">OPERATIONS · AUDITED</span>
          <h1>Admin overview</h1>
          <p>Keep the platform healthy, accounts clear and merchant support moving.</p>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="admin-metrics">
        <div><small>Accounts</small><strong>{accounts.length}</strong><span>Loaded results</span></div>
        <div><small>Sales leads</small><strong>{leads.filter((lead) => lead.status === "NEW").length}</strong><span>Need attention</span></div>
        <div><small>Pending payments</small><strong>{billingPayments.filter((payment) => payment.status === "CREATED").length}</strong><span>Awaiting verification</span></div>
        <div><small>Active plans</small><strong>{plans.filter((plan) => plan.active).length}</strong><span>Catalog entries</span></div>
      </div>
      <form
        className="search-form card"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const q = new FormData(e.currentTarget).get("q");
            setAccounts(
              (await api(`/admin/accounts?q=${encodeURIComponent(String(q))}`)) as Any[],
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <Field title="Business or owner email" name="q" />
        <button className="primary">
          <Search size={16} />
          Find account
        </button>
      </form>
      <section className="card admin-operations-section">
        <div className="section-heading"><div><Badge>OPERATIONS</Badge><h2>Sales leads</h2><p>Unsupported businesses waiting for a tailored conversation.</p></div></div>
        {leads.length ? leads.map((lead) => <div className="list-row" key={lead.id}><div className="grow"><strong>{lead.business_name}</strong><small>{label(lead.category)} · {lead.email} · {lead.city}</small></div><Badge tone={lead.status === "NEW" ? "amber" : "green"}>{lead.status}</Badge><select aria-label={`Update ${lead.business_name} status`} value={lead.status} onChange={async (e) => { await api(`/admin/sales-leads/${lead.id}`, "PATCH", { status: e.target.value }); setLeads((current) => current.map((x) => x.id === lead.id ? { ...x, status: e.target.value } : x)); }}><option>NEW</option><option>CONTACTED</option><option>QUALIFIED</option><option>CONVERTED</option><option>CLOSED</option></select></div>) : <Empty title="No sales leads yet">Custom-category requests will appear here.</Empty>}
      </section>
      <section className="card admin-operations-section">
        <div className="section-heading"><div><Badge>REVENUE OPERATIONS</Badge><h2>Billing</h2><p>Server-verified Prime payments. Provider secrets and raw payloads are never displayed.</p></div></div>
        <form className="admin-filter-row" onSubmit={(e) => { e.preventDefault(); void refreshBilling(); }}>
          <Field title="Search merchant, business or order" value={billingQuery} onChange={(e: any) => setBillingQuery(e.target.value)} />
          <label className="field"><span>Status</span><select value={billingStatus} onChange={(e) => setBillingStatus(e.target.value)}><option value="">All statuses</option><option>CREATED</option><option>VERIFIED</option><option>FAILED</option><option>CANCELLED</option></select></label>
          <button className="secondary" type="submit">Filter payments</button>
        </form>
        {billingPayments.length ? <div className="admin-billing-table"><div className="admin-billing-head"><span>Merchant / business</span><span>Plan</span><span>Amount</span><span>Status</span><span>Created</span></div>{billingPayments.map((payment) => <div className="admin-billing-row" key={payment.id}><div><strong>{payment.email}</strong><small>{payment.business_name || payment.tenant_name} · {label(payment.category || "")}</small></div><span>{payment.plan_name || "Prime"}</span><span>{money(payment.amount_paise)} {payment.currency}</span><Badge tone={payment.status === "VERIFIED" ? "green" : payment.status === "FAILED" ? "red" : "amber"}>{payment.status}</Badge><small>{new Date(payment.created_at).toLocaleString()}</small></div>)}</div> : <Empty title="No billing records yet">Verified Prime payments will appear here.</Empty>}
      </section>
      <div className="two-columns">
        <section className="card admin-account-results">
          <div className="section-heading"><div><span className="eyebrow">DIRECTORY</span><h2>Accounts</h2><p>Search a merchant to open a privacy-safe account detail.</p></div></div>
          {accounts.map((a) => (
            <button className="step" key={a.id} onClick={() => detail(a.id)}>
              <span>
                <strong>{a.name}</strong>
                <small>
                  {a.email} · {a.billing_state}
                </small>
              </span>
              <ChevronRight />
            </button>
          ))}
          {!accounts.length && <Empty title="Search for an account">Account results will appear here.</Empty>}
        </section>
        {selected && (
          <section className="card">
            <div className="card-heading">
              <div><h2>{selected.tenant.name}</h2><p>Account detail and operational history</p></div>
              <button className="text-button" onClick={() => setSelected(null)}>Close</button>
            </div>
            <p>
              {selected.tenant.plan_name} · {selected.tenant.plan_price_paise ? money(selected.tenant.plan_price_paise) + " / month" : "Custom"} · {selected.tenant.billing_state}
            </p>
            <div className="admin-billing-summary"><strong>Billing</strong><small>Reference {selected.tenant.plan_original_price_paise ? money(selected.tenant.plan_original_price_paise) + " / month" : "—"} · {selected.tenant.plan_currency || "INR"}</small><small>Staff seats {selected.staff?.filter((member: Any) => member.role !== "owner").length || 0} / {selected.tenant.plan_max_staff || 0}</small>{(selected.billingPayments || []).map((payment: Any) => <small key={payment.id}>{payment.provider} · {payment.status} · {money(payment.amount_paise)} · {payment.verified_at ? `verified ${new Date(payment.verified_at).toLocaleDateString()}` : "not verified"}</small>)}</div>
            <div className="admin-detail-grid">
              <div><small>LOCATIONS</small><strong>{selected.locations?.length || 0}</strong></div>
              <div><small>STAFF</small><strong>{selected.staff?.length || 0}</strong></div>
              <div><small>LOGIN EVENTS</small><strong>{selected.loginHistory?.length || 0}</strong></div>
            </div>
            <h3>Businesses & locations</h3>
            {(selected.locations || []).map((location: Any) => <div className="list-row" key={location.id}><div className="grow"><strong>{location.name}</strong><small>{label(location.category)} · {location.public_id || location.publicId || "No public ID"}</small></div><Badge tone={location.published ? "green" : ""}>{location.published ? "LIVE" : "DRAFT"}</Badge></div>)}
            <h3>Team</h3>
            {(selected.staff || []).map((member: Any) => <div className="list-row" key={member.id}><div className="grow"><strong>{member.email}</strong><small>{label(member.role)} · {member.last_active_at ? `last active ${new Date(member.last_active_at).toLocaleDateString()}` : "No activity recorded"}</small></div></div>)}
            <h3>Login history</h3>
            {(selected.loginHistory || []).slice(0, 8).map((event: Any) => <div className="list-row" key={event.id}><div className="grow"><strong>{event.success ? "Successful login" : "Failed login"}</strong><small>{new Date(event.created_at).toLocaleString()} · {event.client_type} · {event.platform || "unknown"}</small></div></div>)}
            <h3>Routes</h3>
            {selected.routes.map((r: Any) => (
              <div className="route-card" key={r.id}>
                <strong>
                  {r.label} · {String(r.vpa || "").replace(/^(.{2}).*(@.*)$/, "$1••••$2")}
                </strong>
                <p>{label(r.state)}</p>
                <small>Submitted evidence: {r.evidence}</small>
                {r.state === "verification_pending" && (
                  <button
                    className="secondary"
                    onClick={async () => {
                      const evidence = prompt(
                        "Record independently checked ownership and payee evidence, date, reference, and approved verification procedure. Do not approve based only on the merchant’s assertion.",
                      );
                      if (!evidence) return;
                      try {
                        await api(`/admin/routes/${r.id}/verify`, "POST", {
                          evidence,
                        });
                        detail(selected.tenant.id);
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Record independent verification
                  </button>
                )}
              </div>
            ))}
            <h3>Plan administration</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api(
                    `/admin/tenants/${selected.tenant.id}/billing`,
                    "POST",
                    Object.fromEntries(new FormData(e.currentTarget)),
                  );
                  detail(selected.tenant.id);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <label className="field">
                <span>Plan</span>
                <select name="planId">
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>State</span>
                <select name="state">
                  {["free", "active", "grace", "expired", "suspended"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </label>
              <Field
                title="Reason / external reference"
                name="reason"
                minLength={10}
                required
              />
              <button className="secondary">Update entitlement</button>
            </form>
            <h3>Abuse reports</h3>
            {selected.reports.map((r: Any) => (
              <div className="list-row" key={r.id}>
                <p>
                  {r.message} · {r.state}
                </p>
                {r.state === "open" && (
                  <button
                    className="secondary"
                    onClick={async () => {
                      const reason = prompt("Resolution reason");
                      if (!reason) return;
                      const unpublish = confirm(
                        "Unpublish the reported business page? Cancel leaves it published.",
                      );
                      try {
                        await api(`/admin/reports/${r.id}/resolve`, "POST", {
                          reason,
                          unpublish,
                        });
                        detail(selected.tenant.id);
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Resolve
                  </button>
                )}
              </div>
            ))}
            <h3>Support notes</h3>
            {selected.notes.map((n: Any) => (
              <p key={n.id}>{n.note}</p>
            ))}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api(
                    `/admin/tenants/${selected.tenant.id}/notes`,
                    "POST",
                    Object.fromEntries(new FormData(e.currentTarget)),
                  );
                  detail(selected.tenant.id);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Field
                title="Add note (no credentials or health data)"
                name="note"
                required
              />
              <button className="secondary">Save note</button>
            </form>
            <details>
              <summary>Audit trail ({selected.audit.length})</summary>
              {selected.audit.map((a: Any) => (
                <p key={a.id}>
                  <small>
                    {a.created_at} · {a.action} · {a.actor_id}
                  </small>
                </p>
              ))}
            </details>
          </section>
        )}
      </div>
    </>
  );
}
function Customer({ slug, initialView = "hub" }: { slug: string; initialView?: "hub" | "menu" | "pay" }) {
  const [b, setB] = useState<Any | null>(null),
    [view, setView] = useState<"hub" | "menu" | "pay">(initialView),
    [error, setError] = useState(""),
    [cart, setCart] = useState<Record<string, number>>(() =>
      JSON.parse(localStorage.getItem(`cart:${slug}`) || "{}"),
    ),
    [order, setOrder] = useState<Any | null>(() =>
      JSON.parse(localStorage.getItem(`order:${slug}`) || "null"),
    ),
    [busy, setBusy] = useState(false),
    [instructions, setInstructions] = useState(""),
    [type, setType] = useState("takeaway"),
    [customerName, setCustomerName] = useState(""),
    [customerPhone, setCustomerPhone] = useState(""),
    [deliveryAddress, setDeliveryAddress] = useState(""),
    [landmark, setLandmark] = useState(""),
    [search, setSearch] = useState(""),
    [menuSection, setMenuSection] = useState("all"),
    [foodFilter, setFoodFilter] = useState("all"),
    [customizations, setCustomizations] = useState<Record<string, Any>>({}),
    [configItem, setConfigItem] = useState<Any | null>(null),
    [configVariant, setConfigVariant] = useState(""),
    [configModifiers, setConfigModifiers] = useState<string[]>([]),
    [method, setMethod] = useState("counter"),
    [payment, setPayment] = useState<Any | null>(null),
    [connection, setConnection] = useState(""),
    [pending, setPending] = useState(
      () => !!localStorage.getItem(`pending:${slug}`),
    ),
    [quickPayAmount, setQuickPayAmount] = useState("");
  const loaded = useRef(false);
  const tableQuery = () => window.location.search || "";
  const event = (kind: string) =>
    api(`/public/${slug}/events`, "POST", { kind }).catch(() => {});
  function navigate(next: "hub" | "menu" | "pay") {
    const path = (next === "hub" ? `/q/${encodeURIComponent(slug)}` : `/q/${encodeURIComponent(slug)}/${next}`) + tableQuery();
    window.history.pushState({}, "", path);
    setView(next);
    if (next === "menu") event("menu_view");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  useEffect(() => {
    const onPop = () => {
      const part = location.pathname.split("/").filter(Boolean)[2];
      setView(part === "menu" ? "menu" : part === "pay" ? "pay" : "hub");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    api(`/public/${slug}${window.location.search}`)
      .then((x) => {
        setB(x);
        setType(x.profile.orderTypes[0]);
        setMethod(x.profile.payAtCounter ? "counter" : "upi");
        document.title = `${x.name} · 1QR Prime`;
        if (!loaded.current) {
          loaded.current = true;
          event("page_view");
          event("landing_view");
          if (["qr", "table-qr"].includes(new URLSearchParams(location.search).get("source") || ""))
            event("qr_scan");
          if (initialView === "menu") {
            event("menu_click");
            if (x.items.length) event("menu_view");
          }
        }
      })
      .catch((e) => setError(e.message));
  }, [slug, initialView]);
  useEffect(() => {
    localStorage.setItem(`cart:${slug}`, JSON.stringify(cart));
  }, [cart, slug]);
  useEffect(() => {
    if (!order) return;
    let mounted = true;
    const poll = async () => {
      try {
        const next = await api(
          `/orders/${order.id}`,
          "GET",
          undefined,
          order.accessToken,
        );
        if (mounted) {
          setOrder((o: Any) => ({ ...o, ...next }));
          setConnection("Status up to date");
        }
      } catch {
        if (mounted)
          setConnection("Offline · reconnecting. Your order is saved.");
      }
    };
    poll();
    const timer = setInterval(poll, 4000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [order?.id, slug]);
  useEffect(() => {
    if (order) localStorage.setItem(`order:${slug}`, JSON.stringify(order));
  }, [order, slug]);
  const lines = b?.items.filter((i: Any) => cart[i.id] > 0) || [],
    total = lines.reduce(
      (sum: number, i: Any) => sum + i.price_paise * cart[i.id],
      0,
    );
  function change(i: Any, delta: number) {
    if (pending) return;
    if (!Object.values(cart).some(Boolean) && delta > 0) event("cart_start");
    setCart({
      ...cart,
      [i.id]: Math.min(20, Math.max(0, (cart[i.id] || 0) + delta)),
    });
  }
  function openItem(i: Any) {
    if (i.variants?.length || i.modifierGroups?.length) {
      setConfigItem(i);
      setConfigVariant(i.variants?.[0]?.id || "");
      setConfigModifiers([]);
    } else change(i, 1);
  }
  function addConfigured() {
    if (!configItem) return;
    const selected = configItem.modifierGroups?.flatMap((g: Any) => g.modifiers.filter((m: Any) => configModifiers.includes(m.id)).map((m: Any) => m.id)) || [];
    setCustomizations({ ...customizations, [configItem.id]: { variantId: configVariant || undefined, modifierIds: selected } });
    change(configItem, 1);
    setConfigItem(null);
  }
  async function submit() {
    if (!b) return;
    setBusy(true);
    setError("");
    const saved = localStorage.getItem(`pending:${slug}`);
    const body = saved
      ? JSON.parse(saved)
      : {
          idempotencyKey: crypto.randomUUID(),
          lines: lines.map((i: Any) => ({
            itemId: i.id,
            quantity: cart[i.id],
            ...(customizations[i.id] || {}),
          })),
          instructions,
          orderType: type,
          paymentMethod: method,
          tableId: b.table?.id,
          tableToken: b.table?.publicToken,
          customerName,
          customerPhone,
          deliveryAddress,
          landmark,
        };
    localStorage.setItem(`pending:${slug}`, JSON.stringify(body));
    setPending(true);
    try {
      const o = await api(`/public/${slug}/orders`, "POST", body);
      setOrder(o);
      setCart({});
      localStorage.removeItem(`pending:${slug}`);
      setPending(false);
    } catch (e) {
      setError(
        (e as Error).message +
          " Use Retry to recover this exact order before starting another.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function pay(amount?: number, linkedOrder = false) {
    try {
      const key = `payment:${linkedOrder && order ? order.id : slug}`;
      let paymentKey = sessionStorage.getItem(key);
      if (!paymentKey) {
        paymentKey = crypto.randomUUID();
        sessionStorage.setItem(key, paymentKey);
      }
      const p = await api(
        linkedOrder && order ? `/orders/${order.id}/payments` : `/public/${slug}/payments`,
        "POST",
        { idempotencyKey: paymentKey, ...(amount ? { amountPaise: amount } : {}) },
        order?.accessToken,
      );
      setPayment(p);
      event("payment_click");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const menuBusiness = !!b?.capabilities?.menu;
  const appearance = { ...appearanceDefaults, ...(b?.profile?.appearance || {}) };
  const menuSections = b ? [...new Set<string>(b.items.map((i: Any) => i.section).filter(Boolean))] : [];
  const hiddenActions = appearance.hiddenActions || [];
  const phone = b?.profile.phone?.trim();
  const whatsapp = b?.profile.whatsappNumber?.trim() || phone;
  const directions = b?.profile.directionsUrl || (b?.profile.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.profile.address)}` : "");
  const external = (kind: string, url: string, labelText: string, Icon: any, className = "") => (
    <a className={`hub-action ${className}`.trim()} href={url} target="_blank" rel="noopener noreferrer" onClick={() => event(kind)}>
      <Icon size={20} aria-hidden="true" /><span>{labelText}</span><ArrowUpRight size={16} aria-hidden="true" />
    </a>
  );
  if (!b)
    return (
      <div className="customer-wrap">
        <Brand />
        <ErrorBox error={error} />
        {!error && <p>Opening the business page…</p>}
      </div>
    );
  return (
    <div className="customer-wrap customer-branded" style={{ "--business-bg": appearance.backgroundColor, "--business-text": appearance.textColor, "--business-primary": appearance.primaryColor, "--business-secondary": appearance.secondaryColor, "--business-button": appearance.buttonColor, "--business-button-text": appearance.buttonTextColor } as any}>
      <header className="customer-top">
        <a href={`/q/${encodeURIComponent(slug)}`} className="customer-brand-link" aria-label={`Back to ${b.name}`}><Brand /></a>
        <div className="customer-top-actions">
          {view === "menu" && <button className="customer-top-button" aria-label="Search menu" onClick={() => document.querySelector<HTMLInputElement>(".customer-menu-search")?.focus()}><Search size={18} /></button>}
          {lines.length > 0 && <button className="customer-top-button customer-top-cart" aria-label={`${lines.length} items in cart`} onClick={() => document.querySelector<HTMLElement>(".customer-cart-panel")?.scrollIntoView({ behavior: "smooth", block: "center" })}><ShoppingBag size={18} /><span>{lines.reduce((sum: number, i: Any) => sum + cart[i.id], 0)}</span></button>}
        </div>
      </header>
      <div className="customer-hero">
        {appearance.coverUrl && <div className="customer-cover"><img className="business-cover" src={appearance.coverUrl} alt="" /></div>}
        <div className="customer-hero-content">
          {appearance.logoUrl ? <img className="business-logo" src={appearance.logoUrl} alt={`${b.name} logo`} /> : <div className="business-avatar">{b.name[0]}</div>}
          <div className="customer-identity">
            <Badge>{label(b.category)}</Badge>
            <h1>{b.name}</h1>
            {b.profile.description && <p>{b.profile.description}</p>}
            <div className="customer-meta">
              {b.profile.manualClosed ? <span className="customer-status closed"><i /> Currently closed</span> : <span className="customer-status"><i /> Open now</span>}
              {b.profile.address && <span><MapPin size={14} />{b.profile.address}</span>}
              {b.profile.hours && <span><Clock size={14} />{b.profile.hours}</span>}
            </div>
          </div>
          {b.table && <p className="table-context">Ordering for <strong>{b.table.name}</strong></p>}
        </div>
      </div>
      <ErrorBox error={error} />
      {view === "hub" && (
        <>
          <section className="hub-actions-flow" aria-label="Business actions">
            {b.profile.manualClosed && <div className="closed-banner"><strong>Currently Closed</strong><span>You can browse the menu, but ordering is temporarily unavailable.</span></div>}
            {(() => {
              const configured = [
                menuBusiness && !hiddenActions.includes("menu") && { type: "menu", node: <button className="menu-primary" onClick={() => { event("menu_click"); navigate("menu"); }}><span className="hub-icon"><Utensils size={23} aria-hidden="true" /></span><span><strong>View Menu</strong><small>Browse dishes, customise items and order</small></span><ArrowUpRight size={20} /></button> },
                b.paymentAvailable && !hiddenActions.includes("pay") && { type: "pay", node: <button className="hub-action hub-pay" onClick={() => { event("pay_click"); navigate("pay"); }}><Wallet size={20} /><span>Pay now</span><ArrowUpRight size={16} /></button> },
                b.profile.googleReviewUrl && !hiddenActions.includes("review") && { type: "review", node: <div className="review-cta"><div><Star size={24} fill="currentColor" /><span><strong>Enjoyed your experience?</strong><small>Help others discover us.</small></span></div>{external("review_click", b.profile.googleReviewUrl, "Leave a Google Review", Star)}</div> },
                b.profile.instagramUrl && !hiddenActions.includes("instagram") && { type: "instagram", node: external("instagram_click", b.profile.instagramUrl, "Instagram", Globe, "social-action") },
                b.profile.facebookUrl && !hiddenActions.includes("facebook") && { type: "facebook", node: external("facebook_click", b.profile.facebookUrl, "Facebook", Globe, "social-action") },
                b.profile.youtubeUrl && !hiddenActions.includes("youtube") && { type: "youtube", node: external("youtube_click", b.profile.youtubeUrl, "YouTube", Globe, "social-action") },
                b.profile.linkedinUrl && !hiddenActions.includes("linkedin") && { type: "linkedin", node: external("linkedin_click", b.profile.linkedinUrl, "LinkedIn", Globe, "social-action") },
                b.profile.xUrl && !hiddenActions.includes("x") && { type: "x", node: external("x_click", b.profile.xUrl, "X / Twitter", Globe, "social-action") },
                directions && !hiddenActions.includes("directions") && { type: "directions", node: external("directions_click", directions, "Directions", Navigation) },
                whatsapp && !hiddenActions.includes("whatsapp") && { type: "whatsapp", node: external("whatsapp_click", `https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Hi, I found you through 1QR.")}`, "WhatsApp", MessageCircle) },
                phone && !hiddenActions.includes("call") && { type: "call", node: <a className="hub-action" href={`tel:${phone}`} onClick={() => event("call_click")}><Phone size={20} /><span>Call</span><ArrowUpRight size={16} /></a> },
                b.profile.websiteUrl && !hiddenActions.includes("website") && { type: "website", node: external("website_click", b.profile.websiteUrl, "Website", Globe) },
              ].filter(Boolean) as { type: string; node: React.ReactNode }[];
              const configuredOrder = [...(appearance.actionOrder || []), ...configured.map((x) => x.type).filter((x) => !(appearance.actionOrder || []).includes(x))];
              return configuredOrder.map((type) => configured.find((x) => x.type === type)?.node || null);
            })()}
            {b.profile.actions.map((a: Any, i: number) => <a className="hub-action" href={a.url} rel="noopener noreferrer" target="_blank" onClick={() => event("action_tap")} key={i}><LinkIcon size={18} /><span>{a.label}</span><ArrowUpRight size={16} /></a>)}
          </section>
        </>
      )}
      {view !== "hub" && <button className="hub-back" onClick={() => navigate("hub")}><ArrowLeft size={17} /> {b.name}</button>}
      {view === "pay" && b.paymentAvailable && (
        <section className="card quick-pay">
          <Badge>QUICK PAY</Badge><h2>Pay {b.name}</h2><p>Enter an amount, then choose your preferred UPI app.</p>
          <label className="field"><span>Amount</span><input inputMode="decimal" placeholder="₹ 0" value={quickPayAmount} onChange={(e) => setQuickPayAmount(e.target.value)} /></label>
          <button className="primary wide" disabled={!Number(quickPayAmount) || Number(quickPayAmount) <= 0} onClick={() => pay(Math.round(Number(quickPayAmount) * 100))}><Wallet size={18} /> Continue to payment</button>
          <small>Opening a payment app does not confirm payment. Check the payee and amount.</small>
        </section>
      )}
      {view === "menu" && menuBusiness && !b.profile.manualClosed && (
        <div className="customer-menu-tools">
          <div className="customer-menu-search-wrap"><Search size={18} /><input className="customer-menu-search" aria-label="Search menu" placeholder="Search the menu" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="customer-category-row" role="tablist" aria-label="Menu categories">
            <button role="tab" aria-selected={menuSection === "all"} className={menuSection === "all" ? "selected" : ""} onClick={() => setMenuSection("all")}>All</button>
            {menuSections.map((section) => <button role="tab" aria-selected={menuSection === section} className={menuSection === section ? "selected" : ""} key={section} onClick={() => setMenuSection(section)}>{section}</button>)}
          </div>
          <div className="filter-row customer-food-filter" role="group" aria-label="Food filters">
            {[["all", "All"], ["VEG", "Veg"], ["NON_VEG", "Non-veg"], ["VEGAN", "Vegan"]].map(([value, text]) => <button key={value} className={foodFilter === value ? "selected" : "secondary"} onClick={() => setFoodFilter(value)}>{text}</button>)}
          </div>
        </div>
      )}
      {payment && (
        <section className="card">
          <h2>Continue to your UPI app</h2>
          <p>
            Pay {payment.snapshot.payee} · {payment.snapshot.vpa}
          </p>
          {payment.snapshot.amountPaise != null && (
            <strong>{money(payment.snapshot.amountPaise)}</strong>
          )}
          <a className="button primary" href={payment.snapshot.uri}>
            Open UPI payment
          </a>
          <p className="muted">
            If no app opens, use your UPI app to pay this ID. Check the payee
            name and amount. Returning here does not confirm payment.
          </p>
          <Badge>Confirmation pending</Badge>
        </section>
      )}
      {order ? (
        <section className="card spaced">
          <div className="card-heading">
            <div>
              <Badge>YOUR ORDER</Badge>
              <h2>#{order.id.slice(0, 8)}</h2>
            </div>
            <Badge tone="green">{label(order.state)}</Badge>
          </div>
          <p>
            {order.state === "submitted"
              ? "Received. Waiting for the business to accept your order."
              : `Your order is ${label(order.state)}.`}
          </p>
          <div role="status" className="muted">
            {connection}
          </div>
          {order.lines.map((i: Any) => (
            <div className="list-row" key={i.itemId}>
              <span>
                {i.quantity} × {i.name}
              </span>
              <strong>{money(i.pricePaise * i.quantity)}</strong>
            </div>
          ))}
          <div className="list-row">
            <strong>Total {money(order.amount_paise)}</strong>
            <Badge>{label(order.payment_state)}</Badge>
          </div>
          {order.payment_state === "pending" &&
            order.payment_method === "upi" &&
            !["completed", "cancelled", "rejected"].includes(order.state) && (
              <button className="primary" onClick={() => pay(undefined, true)}>
                Continue to payment
              </button>
            )}
          <small>
            Keep this browser to recover your order. Payment remains pending
            until confirmed. Contact the business if you need to change or
            cancel.
          </small>
          {["completed", "cancelled", "rejected"].includes(order.state) && (
            <button
              className="secondary"
              onClick={() => {
                setOrder(null);
                setPayment(null);
                localStorage.removeItem(`order:${slug}`);
              }}
            >
              Start another order
            </button>
          )}
        </section>
      ) : (
        <>
      {view === "menu" && b.items.length > 0 && (
            <section className="customer-menu">
              <div className="section-title">
                <h2>
                  {b.category === "restaurant"
                    ? "Fresh from our menu"
                    : b.category === "retail"
                      ? "Explore our collection"
                      : "Our services"}
                </h2>
                <span>{b.items.length} offerings</span>
              </div>
              {[...new Set<string>(b.items.map((i: Any) => i.section))].filter((section) => menuSection === "all" || section === menuSection).map(
                (section) => (
                  <section key={section}>
                    <h3 className="menu-section">{section}</h3>
                    {b.items
                      .filter((i: Any) => i.section === section && (!search || `${i.name} ${i.description} ${(i.tags || []).join(" ")}`.toLowerCase().includes(search.toLowerCase())) && (foodFilter === "all" || i.food_type === foodFilter))
                      .map((i: Any) => (
                        <article
                          className={`menu-item customer-menu-item ${!i.available ? "sold-out" : ""}`}
                          key={i.id}
                        >
                          {i.image && (
                            <img src={i.image} alt={i.name} loading="lazy" />
                          )}
                          <div className="grow">
                            <h3>{i.name}</h3>
                            <p>{i.description}</p>
                              <strong>{money(i.discounted_price_paise ?? i.price_paise)}</strong>
                              {i.discounted_price_paise != null && <del>{money(i.price_paise)}</del>}
                              {i.food_type && i.food_type !== "OTHER" && <Badge tone={i.food_type === "NON_VEG" ? "amber" : "green"}>{label(i.food_type)}</Badge>}
                            {!i.available && <Badge>Unavailable</Badge>}
                          </div>
                          {b.profile.orderEnabled && (
                            <div className="quantity">
                              <button
                                aria-label={`Remove ${i.name}`}
                                disabled={!cart[i.id] || pending}
                                onClick={() => change(i, -1)}
                              >
                                −
                              </button>
                              <span aria-live="polite">{cart[i.id] || 0}</span>
                              <button
                                aria-label={`Add ${i.name}`}
                                disabled={!i.available || pending}
                                onClick={() => openItem(i)}
                              >
                                +
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                  </section>
                ),
              )}
            </section>
          )}
      {view === "menu" && lines.length > 0 && !pending && <button className="customer-cart-bar" onClick={() => document.querySelector<HTMLElement>(".customer-cart-panel")?.scrollIntoView({ behavior: "smooth", block: "center" })}><span className="cart-count">{lines.reduce((sum: number, i: Any) => sum + cart[i.id], 0)}</span><span><strong>{lines.length === 1 ? "1 item" : `${lines.length} items`}</strong><small>Ready to review</small></span><b>{money(total)}</b><ArrowUpRight size={18} /></button>}
      {view === "menu" && (lines.length > 0 || pending) && (
            <section className="card cart customer-cart-panel">
              <h2>Your order</h2>
              {lines.map((i: Any) => (
                <div className="list-row" key={i.id}>
                  <span>
                    {cart[i.id]} × {i.name}
                  </span>
                  <strong>{money(i.price_paise * cart[i.id])}</strong>
                </div>
              ))}
              <Field
                title="Special instructions (optional)"
                value={instructions}
                maxLength={300}
                disabled={pending}
                onChange={(e: any) => setInstructions(e.target.value)}
              />
              {type !== "dine_in" && <Field title="Name" value={customerName} disabled={pending} onChange={(e: any) => setCustomerName(e.target.value)} />}
              {type !== "dine_in" && <Field title="Phone number" inputMode="tel" value={customerPhone} disabled={pending} onChange={(e: any) => setCustomerPhone(e.target.value)} />}
              {type === "delivery" && <>
                <Field title="Delivery address" value={deliveryAddress} disabled={pending} onChange={(e: any) => setDeliveryAddress(e.target.value)} />
                <Field title="Landmark (optional)" value={landmark} disabled={pending} onChange={(e: any) => setLandmark(e.target.value)} />
              </>}
              {b.table && <p className="table-context">Ordering for <strong>{b.table.name}</strong></p>}
              <label className="field">
                <span>Order type</span>
                <select
                  disabled={pending}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {b.profile.orderTypes.map((t: string) => (
                    <option value={t} key={t}>
                      {label(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Payment method</span>
                <select
                  disabled={pending}
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {b.profile.payAtCounter && (
                    <option value="counter">Pay at counter</option>
                  )}
                  {b.paymentAvailable && (
                    <option value="upi">UPI · confirmation pending</option>
                  )}
                </select>
              </label>
              <button
                className="primary wide"
                  disabled={
                    busy || b.profile.manualClosed || (!b.profile.payAtCounter && !b.paymentAvailable)
                  }
                onClick={submit}
              >
                {busy
                  ? "Sending…"
                  : pending
                    ? "Retry / recover order"
                    : `Submit order · ${money(total)}`}
              </button>
              <small>
                Orders require merchant acceptance. Retries use the same order
                reference.
              </small>
              {pending && (
                <button
                  className="text-button"
                  onClick={() => {
                    if (
                      confirm(
                        "Only clear this if the previous request was rejected. If a connection failed, retry first to avoid ordering twice.",
                      )
                    ) {
                      localStorage.removeItem(`pending:${slug}`);
                      setPending(false);
                    }
                  }}
                >
                  Edit after rejected request
                </button>
              )}
            </section>
          )}
        </>
      )}
      {configItem && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Configure ${configItem.name}`}>
          <div className="config-sheet card">
            <div className="card-heading"><div><Badge>CHOOSE OPTIONS</Badge><h2>{configItem.name}</h2></div><button className="text-button" onClick={() => setConfigItem(null)}>Close</button></div>
            {configItem.variants?.length > 0 && <fieldset><legend>Size / variant *</legend>{configItem.variants.map((v: Any) => <label className="choice" key={v.id}><input type="radio" name="variant" checked={configVariant === v.id} onChange={() => setConfigVariant(v.id)} />{v.name}<strong>{money(v.price_paise)}</strong></label>)}</fieldset>}
            {configItem.modifierGroups?.map((g: Any) => <fieldset key={g.id}><legend>{g.name} {g.required ? "*" : ""}</legend>{g.modifiers.map((m: Any) => <label className="choice" key={m.id}><input type={g.max_selection === 1 ? "radio" : "checkbox"} name={g.id} checked={configModifiers.includes(m.id)} onChange={(e) => setConfigModifiers(e.target.checked ? [...configModifiers, m.id] : configModifiers.filter((id) => id !== m.id))} />{m.name}<strong>+{money(m.price_paise)}</strong></label>)}</fieldset>)}
            <button className="primary wide" onClick={addConfigured}>Add to cart</button>
          </div>
        </div>
      )}
      {b.profile.requestEnabled && (
        <RequestForm slug={slug} clinic={b.category === "clinic"} />
      )}
      <footer className="customer-footer">
        <p>No app. No account. Just your local business.</p>
        <span>
          Connected by <strong>1QR Prime</strong>
        </span>
        <div>
          <a href="/privacy">Privacy</a>
          <button
            className="text-button"
            onClick={async () => {
              const message = prompt(
                "Describe the issue with this business page. Do not include sensitive information.",
              );
              if (!message) return;
              try {
                await api(`/public/${slug}/report`, "POST", { message });
                alert("Report received. Thank you.");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Report this page
          </button>
        </div>
      </footer>
    </div>
  );
}
function RequestForm({ slug, clinic }: any) {
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  return (
    <form
      className="card spaced"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(
            `/public/${slug}/requests`,
            "POST",
            Object.fromEntries(new FormData(e.currentTarget)),
          );
          setMessage(
            "Request received. The business will contact you to confirm availability.",
          );
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <h2>Let’s get in touch</h2>
      <p>
        Send an enquiry or request a visit. This is not a confirmed booking.
        {clinic
          ? " Do not include symptoms, medical history or health information."
          : ""}
      </p>
      <ErrorBox error={error} />
      {message ? (
        <p role="status">{message}</p>
      ) : (
        <>
          <Field title="Your name" name="name" required maxLength={80} />
          <Field
            title="Phone or email"
            name="contact"
            required
            maxLength={100}
          />
          <Field
            title={clinic ? "Preferred day / time only" : "Your request"}
            name="message"
            required
            minLength={3}
            maxLength={300}
          />
          <button className="primary">
            Send request <ArrowUpRight size={16} />
          </button>
        </>
      )}
    </form>
  );
}
function Policy({ support }: any) {
  return (
    <div className="customer-wrap">
      <Brand />
      <section className="card spaced">
        <h1>{support ? "Help & support" : "Your privacy matters"}</h1>
        {support ? (
          <>
            <p>
              For an order, booking or payment issue, contact the business shown
              on its customer page. A UPI handoff does not prove receipt; the
              merchant must check their bank or payment provider.
            </p>
            <p>
              For account support, use your deployment operator’s published
              support contact. This development build does not yet have a public
              support service.
            </p>
            <h2>Delete or export your account</h2>
            <p>
              Sign in, open Account & plan, and select Export account data or
              Delete my account. Deletion requires your password and removes
              businesses you own.
            </p>
            <a className="button primary" href="/">
              Open merchant console
            </a>
          </>
        ) : (
          <>
            <p>
              1QR Prime stores merchant account details, public business
              profiles, menus, orders, payment-route references, enquiries and
              operational audit records. Customers do not need accounts.
            </p>
            <h2>Payments and analytics</h2>
            <p>
              We never request a UPI PIN or bank password. Payment apps and
              external links have their own privacy policies. Analytics are
              aggregate event counts, without fingerprinting or advertising
              trackers.
            </p>
            <h2>Device storage and notifications</h2>
            <p>
              Customer carts and recovery references stay in this browser.
              Merchant sessions use protected cookies or native secure storage.
              Push tokens are collected only after notification permission.
            </p>
            <h2>Retention and deletion</h2>
            <p>
              Active order and enquiry data are retained for up to 90 days;
              aggregate analytics for 13 months. Restricted audit records are
              retained for 365 days. Backups expire after 30 days under the
              deployment retention procedure. Account owners can export data and
              delete their account in Account & plan.
            </p>
            <h2>Deployment notice</h2>
            <p>
              This is a development policy draft. Before public launch the
              operator must publish its legal identity, contact, processors,
              hosting region and applicable rights process. Do not use this
              build to collect live customer data until those details are
              complete.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
function Recovery({ mode }: any) {
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="customer-wrap">
      <Brand />
      <form
        className="card spaced"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.currentTarget));
          try {
            await api(
              `/auth/${mode}`,
              "POST",
              mode === "recovery"
                ? data
                : { ...data, token: location.hash.slice(1) },
            );
            history.replaceState(null, "", location.pathname);
            setMessage(
              mode === "recovery"
                ? "If the account exists, an email has been sent."
                : mode === "verify"
                  ? "Email verified."
                  : "Password updated. Sign in with your new password.",
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <h1>
          {mode === "recovery"
            ? "Recover your account"
            : mode === "reset"
              ? "Reset your password"
              : "Verify your email"}
        </h1>
        <ErrorBox error={error} />
        {message ? (
          <p role="status">{message}</p>
        ) : (
          <>
            {mode === "recovery" && (
              <Field title="Account email" type="email" name="email" required />
            )}
            {mode === "reset" && (
              <Field
                title="New password"
                type="password"
                name="password"
                minLength={12}
                required
              />
            )}
            <button className="primary">
              {mode === "verify" ? "Confirm email" : "Continue"}
            </button>
          </>
        )}
        <p>
          <a href="/">Back to sign in</a>
        </p>
      </form>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
