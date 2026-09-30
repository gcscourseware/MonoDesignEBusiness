import { and, eq } from "drizzle-orm";
import { demoCategories, demoDesigners, demoPlans, demoPortfolio, demoServices } from "../../shared/demo-data";
import { categories, designerProfiles, portfolioProjects, services, subscriptionPlans } from "../../drizzle/schema";
import { getDb } from "../db";

type SeoPage = { title: string; description: string; body: string; noindex?: boolean; missing?: boolean; person?: { name: string; jobTitle: string; addressLocality?: string; addressCountry?: string } };
const esc = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const textArray = (value: string | null | undefined): string[] => { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } };
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
const pageShell = (heading: string, intro: string, content = "") => `<main><p>MONO DESIGN AGENCY</p><h1>${esc(heading)}</h1><p>${esc(intro)}</p>${content}</main>`;
const listItems = (items: Array<{ href: string; title: string; detail?: string }>) => `<ul>${items.map(item => `<li><a href="${esc(item.href)}">${esc(item.title)}</a>${item.detail ? ` — ${esc(item.detail)}` : ""}</li>`).join("")}</ul>`;

async function publicDesigners() {
  try { const db = await getDb(); if (db) { const rows = await db.select().from(designerProfiles).where(eq(designerProfiles.status, "approved")); if (rows.length) return rows; } } catch { /* demo content keeps the public preview useful while a database is unavailable */ }
  return demoDesigners.map((item, index) => ({ ...item, id: index + 1, rating: item.ratingTenths / 10, available: true, verified: true }));
}
async function publicServices() {
  try { const db = await getDb(); if (db) { const rows = await db.select().from(services).where(eq(services.status, "published")); if (rows.length) return rows; } } catch { /* use curated preview data */ }
  return demoServices.map((item, index) => ({ ...item, id: index + 1, designerId: index % demoDesigners.length + 1 }));
}
async function getSeoPage(pathname: string): Promise<SeoPage> {
  if (pathname === "/") {
    const people = await publicDesigners(); const offerings = await publicServices();
    return { title: "MONO DESIGN AGENCY — Great work, great designers", description: "Discover talented designers, explore standout portfolios, and find the creative partner your next big idea deserves.", body: pageShell("Where great ideas meet great designers.", "Discover talented designers, explore standout portfolios, and get thoughtful design services for projects of every size.", `${listItems([{ href: "/designers", title: "Find a designer" }, { href: "/services", title: "Explore design services" }, { href: "/pricing", title: "Compare membership plans" }, { href: "/how-it-works", title: "How Mono works" }])}<h2>Designers to know</h2>${listItems(people.slice(0, 8).map(person => ({ href: `/designer/${encodeURIComponent(person.slug)}`, title: person.name, detail: person.title })))}<h2>Creative services</h2>${listItems(offerings.slice(0, 8).map((service: any) => ({ href: `/service/${service.id}`, title: service.title, detail: money(service.priceCents) })))}<h2>Designed for individuals, businesses and agencies</h2><p>Discover, explore, connect and create in one considered creative marketplace.</p>`) };
  }
  if (pathname === "/designers") {
    const people = await publicDesigners();
    return { title: "Find Professional Designers | Mono Design", description: "Find professional brand, graphic, web and product designers by specialty, rating, location and budget.", body: pageShell("Find your creative person.", "Search independent designers by specialty, skills, tools, experience, rating and budget.", listItems(people.map(person => ({ href: `/designer/${encodeURIComponent(person.slug)}`, title: person.name, detail: `${person.title} · ${person.location} · ${Number("rating" in person ? person.rating : person.ratingTenths / 10).toFixed(1)} stars` })))) };
  }
  const designerMatch = pathname.match(/^\/designer\/([A-Za-z0-9_-]+)$/);
  if (designerMatch) {
    const slug = decodeURIComponent(designerMatch[1]);
    let person: any = null; let portfolio: any[] = []; let offerings: any[] = [];
    try { const db = await getDb(); if (db) { const [row] = await db.select().from(designerProfiles).where(and(eq(designerProfiles.slug, slug), eq(designerProfiles.status, "approved"))).limit(1); if (row) { person = row; [portfolio, offerings] = await Promise.all([db.select().from(portfolioProjects).where(and(eq(portfolioProjects.designerId, row.id), eq(portfolioProjects.status, "published"))), db.select().from(services).where(and(eq(services.designerId, row.id), eq(services.status, "published")))]); } } } catch { /* use seed content if available */ }
    if (!person) { const fallback = demoDesigners.find(item => item.slug === slug); if (fallback) { person = fallback; portfolio = demoPortfolio.filter(item => item.designerSlug === slug); offerings = demoServices.filter(item => item.designerSlug === slug); } }
    if (!person) return { title: "Designer not found | Mono", description: "This designer profile is not available.", body: pageShell("Designer not found.", "This public designer profile could not be found.", '<p><a href="/designers">Browse all designers</a></p>'), noindex: true, missing: true };
    const biography = String(person.bio || "Explore selected creative work, services and client reviews from this independent designer.");
    const title = `Hire ${person.name}, ${person.title} | Mono`;
    const location = String(person.location || "Independent designer");
    const projectLinks = portfolio.slice(0, 12).map(item => ({ href: `/designer/${encodeURIComponent(slug)}`, title: item.title, detail: item.category }));
    const serviceLinks = offerings.slice(0, 12).map(item => ({ href: `/service/${item.id || demoServices.findIndex(service => service.slug === item.slug) + 1}`, title: item.title, detail: money(item.priceCents) }));
    return { title, description: `${person.name} is a ${person.title.toLowerCase()} in ${location}. Explore selected work, services and client reviews.`, person: { name: person.name, jobTitle: person.title, addressLocality: location }, body: pageShell(`${person.name} — ${person.title}`, biography, `<p>${esc(location)} · ${Number(person.yearsExperience || 0)} years' experience · ${Number(person.rating ?? Number(person.ratingTenths || 0) / 10).toFixed(1)} / 5</p><h2>Selected portfolio</h2>${listItems(projectLinks)}<h2>Available services</h2>${listItems(serviceLinks)}<p><a href="/login">Contact this designer</a></p>`) };
  }
  if (pathname === "/services") {
    const offerings = await publicServices();
    return { title: "Creative Design Services & Packages | Mono", description: "Explore clear, professionally scoped branding, logo, web, social, packaging and presentation design services.", body: pageShell("Good design, ready to go.", "Explore thoughtful creative services with clear scope, delivery times and starting prices.", listItems(offerings.map((service: any, index: number) => ({ href: `/service/${service.id || index + 1}`, title: service.title, detail: `${service.category || "Creative design"} · from ${money(service.priceCents)}` })))) };
  }
  const serviceMatch = pathname.match(/^\/service\/(\d+)$/);
  if (serviceMatch) {
    const id = Number(serviceMatch[1]); let service: any = null; let designer: any = null;
    try { const db = await getDb(); if (db) { const [row] = await db.select().from(services).where(and(eq(services.id, id), eq(services.status, "published"))).limit(1); if (row) { service = row; const [person] = await db.select().from(designerProfiles).where(and(eq(designerProfiles.id, row.designerId), eq(designerProfiles.status, "approved"))).limit(1); designer = person; } } } catch { /* use curated demo content below */ }
    if (!service) { const fallback = demoServices[id - 1]; if (fallback) { service = { ...fallback, id }; designer = demoDesigners.find(person => person.slug === fallback.designerSlug); } }
    if (!service) return { title: "Service not found | Mono", description: "This design service is not available.", body: pageShell("Service not found.", "This creative service could not be found.", '<p><a href="/services">Browse available services</a></p>'), noindex: true, missing: true };
    const title = `${service.title} — ${service.category || "Design service"} | Mono`;
    return { title, description: String(service.description || `A professionally scoped ${service.category || "design"} service by an independent creative.`), body: pageShell(service.title, String(service.description || "A thoughtful, professionally scoped design service."), `<p>${esc(service.category || "Creative service")} · from ${money(service.priceCents)} · ${Number(service.deliveryDays || 5)} day delivery · ${Number(service.revisions || 0)} revisions</p><h2>Included in this service</h2>${listItems(textArray(service.deliverables).map(item => ({ href: "/services", title: item })))}<p>Created by <a href="/designer/${encodeURIComponent(designer?.slug || "")}">${esc(designer?.name || "Independent designer")}</a>.</p><p><a href="/cart">Add this service to your project cart</a></p>`) };
  }
  if (pathname === "/categories") {
    let names = demoCategories; try { const db = await getDb(); if (db) { const rows = await db.select().from(categories); if (rows.length) names = rows.map(row => row.name); } } catch { /* retain curated categories */ }
    return { title: "Design Categories | Mono Design Agency", description: "Browse professional designers by category, including branding, logo, graphic, UI/UX, web, packaging and motion design.", body: pageShell("Different skills. One good place.", "Explore design categories and meet specialists who make them their practice.", listItems(names.map(name => ({ href: `/designers?category=${encodeURIComponent(name)}`, title: name })))) };
  }
  if (pathname === "/pricing") {
    let plans: any[] = demoPlans; try { const db = await getDb(); if (db) { const rows = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)); if (rows.length) plans = rows; } } catch { /* retain plan content */ }
    return { title: "Mono Design Plans & Pricing | Mono", description: "Compare Mono Basic, Mono Business and Mono Agency plans with transparent monthly and annual membership options.", body: pageShell("Good work. Your way.", "Start simply and scale when your creative workflow needs more room.", listItems(plans.map(plan => ({ href: "/register", title: plan.name, detail: `${money(plan.monthlyPriceCents)} per month · ${String(plan.audience)}` })))) };
  }
  if (pathname === "/how-it-works") return { title: "How Mono Design Works | Mono", description: "Discover independent designers, explore portfolios, connect with a clear brief and create great work together.", body: pageShell("From what if? to that's the one.", "Discover, explore, connect and create in one clear creative workflow.", "<ol><li>Discover designers by skills, services, rating and budget.</li><li>Explore portfolios, services, ratings and previous work.</li><li>Connect through a message or customized quotation.</li><li>Create, manage the project and receive your final design.</li></ol><p><a href=\"/designers\">Find a designer</a></p>") };
  if (pathname === "/become-a-designer") return { title: "Become a Mono Design Partner | Mono", description: "Build your designer profile, share selected work, publish services and meet thoughtful creative clients.", body: pageShell("A place for your practice.", "Meet thoughtful clients, share work you are proud of and build a creative business that feels like yours.", "<p>Build your profile, share your portfolio and list clear design services.</p><p><a href=\"/register?type=designer\">Create a designer account</a></p>") };
  const privateOrAuth = ["/login", "/register", "/onboarding", "/cart", "/checkout", "/dashboard", "/client/dashboard", "/designer/dashboard", "/admin/dashboard", "/orders", "/projects", "/messages", "/quotes", "/notifications", "/settings", "/404"].includes(pathname) || pathname.startsWith("/project/");
  if (privateOrAuth) return { title: "Your Mono workspace | Mono", description: "Sign in to manage your creative projects, account and conversations.", body: pageShell("Your Mono workspace.", "Sign in to manage your projects, account and conversations.", '<p><a href="/login">Sign in securely</a></p>'), noindex: true };
  return { title: "Page not found | Mono", description: "This Mono Design Agency page could not be found.", body: pageShell("Page not found.", "The page you are looking for does not exist.", '<p><a href="/">Return to Mono Design Agency</a></p>'), noindex: true, missing: true };
}

export async function renderSeoIndex(requestUrl: string, template: string): Promise<{ html: string; status: number; cacheControl: string }> {
  const parsed = new URL(requestUrl, "https://mono.invalid");
  const page = await getSeoPage(parsed.pathname);
  const originValue = process.env.PUBLIC_SITE_URL;
  let publicOrigin: URL | null = null;
  try { if (originValue) { const candidate = new URL(originValue); if (candidate.protocol === "https:") publicOrigin = new URL(candidate.origin); } } catch { /* omit canonical and absolute social URLs until configured */ }
  const title = page.title.slice(0, 60);
  const description = page.description.slice(0, 160);
  const keywords = "design agency, creative marketplace, freelance designers, brand design, graphic design, logo design";
  const tags = [
    `<meta name="description" content="${esc(description)}" />`,
    `<meta name="keywords" content="${keywords}" />`,
    `<meta name="robots" content="${page.noindex || page.missing ? "noindex, nofollow" : "index, follow"}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    '<meta property="og:site_name" content="MONO DESIGN AGENCY" />',
    '<meta property="og:type" content="website" />',
    `<meta name="twitter:card" content="${publicOrigin ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    publicOrigin ? `<link rel="canonical" href="${esc(new URL(parsed.pathname, publicOrigin).toString())}" />` : "",
    publicOrigin ? `<meta property="og:url" content="${esc(new URL(parsed.pathname, publicOrigin).toString())}" />` : "",
    publicOrigin ? `<meta property="og:image" content="${esc(new URL("/mono-mark.png", publicOrigin).toString())}" />` : "",
    publicOrigin ? `<meta name="twitter:image" content="${esc(new URL("/mono-mark.png", publicOrigin).toString())}" />` : "",
  ].filter(Boolean).join("\n    ");
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*\/?\s*>/i, "")
    .replace(/<meta\s+name="keywords"[^>]*\/?\s*>/i, "")
    .replace(/<meta\s+name="robots"[^>]*\/?\s*>/i, "")
    .replace(/<meta\s+property="og:(?:title|description|site_name|type|url|image)"[^>]*\/?\s*>/gi, "")
    .replace(/<meta\s+name="twitter:(?:card|title|description|image)"[^>]*\/?\s*>/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*\/?\s*>/gi, "")
    .replace(/<link\s+rel="icon"[^>]*\/?\s*>/i, '<link rel="icon" type="image/png" href="/mono-mark.png" />')
    .replace("</head>", `${tags}\n  </head>`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/i, `<noscript>${page.body}</noscript>`);
  if (publicOrigin && parsed.pathname === "/") {
    const structured = { "@context": "https://schema.org", "@type": "Organization", name: "MONO DESIGN AGENCY", url: publicOrigin.origin, logo: new URL("/mono-mark.png", publicOrigin).toString(), description };
    html = html.replace("</head>", `<script type="application/ld+json">${JSON.stringify(structured).replaceAll("<", "\\u003c")}</script>\n  </head>`);
  }
  return { html, status: page.missing ? 404 : 200, cacheControl: page.noindex || page.missing ? "private, no-store" : "no-cache" };
}
