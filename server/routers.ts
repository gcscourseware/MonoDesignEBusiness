import { COOKIE_NAME } from "@shared/const";
import { demoCategories, demoDesigners, demoPlans, demoServices } from "../shared/demo-data";
import { and, asc, count, desc, eq, inArray, like, or } from "drizzle-orm";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { storagePut } from "./storage";
import {
  agencyClients, categories, clientMembers, clientProfiles, designerProfiles, designerReports, designerSkills, disputes, favorites, listingViews, messages, notifications, orderItems, orders,
  payments, portfolioProjects, projectFiles, projects, quotes, reviews, services, servicePackages, skills,
  subscriptionPlans, subscriptions, users,
} from "../drizzle/schema";

const jsonArray = (value: string | null | undefined): string[] => {
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; }
  catch { return []; }
};
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160);
const money = z.number().int().min(0).max(50_000_000);
const storedAssetSchema = z.object({ key: z.string().min(1).max(400), url: z.string().startsWith("/manus-storage/").max(700), fileName: z.string().min(1).max(240), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), byteSize: z.number().int().positive().max(8 * 1024 * 1024) });
const assetListSchema = z.array(storedAssetSchema).max(5).optional();

async function verifyOwnedAssets(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number, assets: z.infer<typeof assetListSchema>, scope: "enquiry" | "quote" | "portfolio" | "profile") {
  if (!assets?.length) return [];
  const rows = await db.select().from(projectFiles).where(and(eq(projectFiles.uploadedBy, userId), inArray(projectFiles.objectKey, assets.map(asset => asset.key))));
  if (rows.length !== assets.length || rows.some(row => row.projectId !== null || !row.objectKey.startsWith(`mono/${scope}/${userId}/`) || (["portfolio", "profile"].includes(scope) && row.contentType === "application/pdf"))) throw new Error("Remove any file that was not uploaded for this account and purpose");
  for (const asset of assets) if (!rows.some(row => row.objectKey === asset.key && row.url === asset.url && row.fileName === asset.fileName && row.contentType === asset.contentType && row.byteSize === asset.byteSize)) throw new Error("Reference file details did not match the stored upload");
  return assets;
}

async function verifyOwnedStoredImageUrl(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number, url: string, allowedScopes: Array<"portfolio" | "profile">) {
  if (!url.startsWith("/manus-storage/")) return;
  const [asset] = await db.select().from(projectFiles).where(and(eq(projectFiles.url, url), eq(projectFiles.uploadedBy, userId))).limit(1);
  if (!asset || asset.projectId !== null || asset.contentType === "application/pdf" || !allowedScopes.some(scope => asset.objectKey.startsWith(`mono/${scope}/${userId}/`))) throw new Error("Choose an image uploaded to your own Mono profile or portfolio storage");
}

function presentDesigner(row: typeof designerProfiles.$inferSelect) {
  return {
    id: row.id, name: row.name, slug: row.slug, title: row.title, location: row.location, bio: row.bio,
    yearsExperience: row.yearsExperience, hourlyRateCents: row.hourlyRateCents,
    rating: row.ratingTenths / 10, ratingTenths: row.ratingTenths, reviewCount: row.reviewCount,
    completedProjects: row.completedProjects, available: row.available, verified: row.verified,
    avatarUrl: row.avatarUrl, skills: jsonArray(row.skills), categories: jsonArray(row.categories),
    tools: jsonArray(row.tools), languages: jsonArray(row.languages),
  };
}

async function designerProfileForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(designerProfiles).where(eq(designerProfiles.userId, userId)).limit(1);
  return rows[0];
}

async function clientProfileForUser(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number) {
  const [owned] = await db.select().from(clientProfiles).where(eq(clientProfiles.userId, userId)).limit(1);
  if (owned) return owned;
  const [membership] = await db.select({ clientProfileId: clientMembers.clientProfileId }).from(clientMembers).where(eq(clientMembers.userId, userId)).limit(1);
  if (!membership) return undefined;
  const [profile] = await db.select().from(clientProfiles).where(eq(clientProfiles.id, membership.clientProfileId)).limit(1);
  return profile;
}

async function accessibleClientUserIds(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, profile: typeof clientProfiles.$inferSelect) {
  const members = await db.select({ userId: clientMembers.userId }).from(clientMembers).where(eq(clientMembers.clientProfileId, profile.id));
  return [...new Set([profile.userId, ...members.map(item => item.userId)].filter((id): id is number => typeof id === "number"))];
}

async function canManageClientProfile(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, profile: typeof clientProfiles.$inferSelect, userId: number) {
  if (profile.userId === userId) return true;
  const [membership] = await db.select().from(clientMembers).where(and(eq(clientMembers.clientProfileId, profile.id), eq(clientMembers.userId, userId))).limit(1);
  return membership?.role === "owner" || membership?.role === "admin";
}

const publicRouter = router({
  categories: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return demoCategories.map((name, index) => ({ id: index + 1, name, slug: slugify(name) }));
    return db.select().from(categories);
  }),
  designers: publicProcedure.input(z.object({ query: z.string().max(120).optional(), category: z.string().max(100).optional(), serviceType: z.string().max(100).optional(), location: z.string().max(100).optional(), software: z.string().max(100).optional(), maxRate: z.number().int().nonnegative().optional(), minRating: z.number().min(0).max(5).optional(), minExperience: z.number().int().min(0).max(80).optional(), maxDeliveryDays: z.number().int().min(1).max(365).optional(), available: z.boolean().optional(), sort: z.enum(["recommended", "rating", "reviews", "newest", "price-low", "price-high"]).optional() }).optional()).query(async ({ input }) => {
    const db = await getDb();
    const rows = db ? await db.select().from(designerProfiles).where(eq(designerProfiles.status, "approved")) : [];
    let result = rows.length ? rows.map(presentDesigner) : demoDesigners.map((item, index) => ({ ...item, id: index + 1, rating: item.ratingTenths / 10, available: true, verified: true }));
    const [listingRows, categoryRows] = db ? await Promise.all([db.select().from(services).where(eq(services.status, "published")), db.select().from(categories)]) : [[], []];
    const categoryNames = new Map(categoryRows.map(item => [item.id, item.name]));
    const serviceInfo = (designer: typeof result[number]) => rows.length
      ? listingRows.filter(listing => listing.designerId === designer.id).map(listing => ({ category: categoryNames.get(listing.categoryId ?? -1) || "", text: `${listing.title} ${listing.description} ${jsonArray(listing.tags).join(" ")}`, deliveryDays: listing.deliveryDays }))
      : demoServices.filter(listing => listing.designerSlug === designer.slug).map(listing => ({ category: listing.category, text: `${listing.title} ${listing.description} ${listing.tags.join(" ")}`, deliveryDays: listing.deliveryDays }));
    const query = input?.query?.trim().toLowerCase();
    const category = (input?.category || input?.serviceType)?.trim().toLowerCase();
    if (query) result = result.filter(item => [item.name, item.title, item.location, item.bio, ...item.skills, ...item.categories, ...item.tools, ...serviceInfo(item).map(service => service.text)].join(" ").toLowerCase().includes(query));
    if (category) result = result.filter(item => item.categories.some(value => value.toLowerCase() === category) || item.skills.some(value => value.toLowerCase() === category) || serviceInfo(item).some(service => service.category.toLowerCase() === category || service.text.toLowerCase().includes(category)));
    if (input?.maxRate !== undefined) result = result.filter(item => item.hourlyRateCents <= input.maxRate! * 100);
    if (input?.minRating !== undefined) result = result.filter(item => item.rating >= input.minRating!);
    if (input?.minExperience !== undefined) result = result.filter(item => item.yearsExperience >= input.minExperience!);
    if (input?.location?.trim()) result = result.filter(item => item.location.toLowerCase().includes(input.location!.trim().toLowerCase()));
    if (input?.software?.trim()) result = result.filter(item => item.tools.some(tool => tool.toLowerCase().includes(input.software!.trim().toLowerCase())));
    if (input?.available !== undefined) result = result.filter(item => item.available === input.available);
    if (input?.maxDeliveryDays !== undefined) result = result.filter(item => serviceInfo(item).some(service => service.deliveryDays <= input.maxDeliveryDays!));
    switch (input?.sort) {
      case "rating": result.sort((a, b) => b.rating - a.rating); break;
      case "reviews": result.sort((a, b) => b.reviewCount - a.reviewCount); break;
      case "price-low": result.sort((a, b) => a.hourlyRateCents - b.hourlyRateCents); break;
      case "price-high": result.sort((a, b) => b.hourlyRateCents - a.hourlyRateCents); break;
      case "newest": result.reverse(); break;
      default: result.sort((a, b) => b.rating * Math.log1p(b.reviewCount) - a.rating * Math.log1p(a.reviewCount));
    }
    return result;
  }),
  designerBySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(180) })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return demoDesigners.find(item => item.slug === input.slug) ?? null;
    const rows = await db.select().from(designerProfiles).where(and(eq(designerProfiles.slug, input.slug), eq(designerProfiles.status, "approved"))).limit(1);
    if (!rows[0]) return null;
    const profile = rows[0];
    await db.insert(listingViews).values({ designerId: profile.id });
    const portfolioRows = await db.select().from(portfolioProjects).where(and(eq(portfolioProjects.designerId, profile.id), eq(portfolioProjects.status, "published"))).orderBy(asc(portfolioProjects.sortOrder), desc(portfolioProjects.createdAt));
    const portfolio = portfolioRows.map(item => ({ ...item, images: jsonArray(item.images), skills: jsonArray(item.skills), tools: jsonArray(item.tools) }));
    const listings = await db.select().from(services).where(and(eq(services.designerId, profile.id), eq(services.status, "published")));
    const packageRows = await db.select().from(servicePackages);
    const publicListings = listings.map(item => ({ ...item, deliverables: jsonArray(item.deliverables), tags: jsonArray(item.tags), addOns: (() => { try { return JSON.parse(item.addOns || "[]"); } catch { return []; } })(), packages: packageRows.filter(pkg => pkg.serviceId === item.id) }));
    const designerReviews = await db.select().from(reviews).where(and(eq(reviews.designerId, profile.id), eq(reviews.isReported, false))).orderBy(desc(reviews.createdAt)).limit(8);
    return { ...presentDesigner(profile), portfolio, services: publicListings, reviews: designerReviews };
  }),
  services: publicProcedure.input(z.object({ query: z.string().max(120).optional(), category: z.string().max(100).optional() }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return demoServices.map((service, index) => ({ ...service, id: index + 1, designer: demoDesigners.find(designer => designer.slug === service.designerSlug) }));
    const [listings, profiles, packages] = await Promise.all([db.select().from(services).where(eq(services.status, "published")), db.select().from(designerProfiles).where(eq(designerProfiles.status, "approved")), db.select().from(servicePackages)]);
    const byDesigner = new Map(profiles.map(row => [row.id, presentDesigner(row)]));
    let result = listings.map(item => ({ ...item, deliverables: jsonArray(item.deliverables), tags: jsonArray(item.tags), addOns: (() => { try { const parsed = JSON.parse(item.addOns || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })(), designer: byDesigner.get(item.designerId), packages: packages.filter(pkg => pkg.serviceId === item.id).map(pkg => ({ ...pkg, deliverables: jsonArray(pkg.deliverables) })) }));
    const query = input?.query?.trim().toLowerCase();
    const category = input?.category?.trim().toLowerCase();
    if (query) result = result.filter(item => `${item.title} ${item.description} ${item.designer?.name ?? ""} ${item.tags.join(" ")}`.toLowerCase().includes(query));
    if (category) result = result.filter(item => item.tags.some(tag => tag.toLowerCase() === category) || item.title.toLowerCase().includes(category));
    return result;
  }),
  serviceById: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const [service] = await db.select().from(services).where(and(eq(services.id, input.id), eq(services.status, "published"))).limit(1);
    if (!service) return null;
    const [designer] = await db.select().from(designerProfiles).where(and(eq(designerProfiles.id, service.designerId), eq(designerProfiles.status, "approved"))).limit(1);
    if (!designer) return null;
    await db.insert(listingViews).values({ serviceId: service.id, designerId: designer.id });
    const [category] = service.categoryId ? await db.select().from(categories).where(eq(categories.id, service.categoryId)).limit(1) : [];
    const packages = await db.select().from(servicePackages).where(eq(servicePackages.serviceId, service.id));
    return { ...service, category: category?.name || jsonArray(service.tags)[0] || "Design", deliverables: jsonArray(service.deliverables), tags: jsonArray(service.tags), addOns: (() => { try { const parsed = JSON.parse(service.addOns || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })(), designer: presentDesigner(designer), packages: packages.map(item => ({ ...item, deliverables: jsonArray(item.deliverables) })) };
  }),
  plans: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return demoPlans;
    const rows = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
    return rows.map(row => ({ ...row, features: jsonArray(row.features) }));
  }),
});

const accountRouter = router({
  profile: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { user: ctx.user, client: null, designer: null, subscription: null };
    const client = await clientProfileForUser(db, ctx.user.id);
    const [designer] = await db.select().from(designerProfiles).where(eq(designerProfiles.userId, ctx.user.id)).limit(1);
    const subscriptionUserId = client?.userId || ctx.user.id;
    const [subscription] = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, subscriptionUserId), eq(subscriptions.status, "active"))).orderBy(desc(subscriptions.startedAt)).limit(1);
    const plan = subscription ? (await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, subscription.planId)).limit(1))[0] : null;
    const [membership] = client ? await db.select().from(clientMembers).where(and(eq(clientMembers.clientProfileId, client.id), eq(clientMembers.userId, ctx.user.id))).limit(1) : [];
    return { user: ctx.user, client: client ?? null, clientMembershipRole: membership?.role || (client?.userId === ctx.user.id ? "owner" : null), designer: designer ? presentDesigner(designer) : null, subscription: subscription ? { ...subscription, plan: plan ? { ...plan, features: jsonArray(plan.features) } : null } : null };
  }),
  onboard: protectedProcedure.input(z.object({ role: z.enum(["client", "business", "agency", "designer"]), companyName: z.string().max(180).optional(), industry: z.string().max(120).optional(), planCode: z.enum(["BASIC", "BUSINESS", "AGENCY"]).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    if (await clientProfileForUser(db, ctx.user.id) || await designerProfileForUser(ctx.user.id)) throw new Error("This account already has a workspace. Continue to your dashboard instead.");
    await db.update(users).set({ marketplaceRole: input.role }).where(eq(users.id, ctx.user.id));
    if (input.role === "designer") {
      const existing = await designerProfileForUser(ctx.user.id);
      const base = { name: ctx.user.name || "New Designer", slug: `${slugify(ctx.user.name || "designer")}-${ctx.user.id}`, title: "Independent designer", location: "Add your location", bio: "Tell clients what you love to design and how you like to collaborate.", skills: JSON.stringify(["Graphic Design"]), categories: JSON.stringify(["Graphic Design"]), tools: JSON.stringify(["Figma"]), languages: JSON.stringify(["English"]), status: "pending" as const, verified: false, userId: ctx.user.id };
      if (existing) await db.update(designerProfiles).set(base).where(eq(designerProfiles.id, existing.id));
      else await db.insert(designerProfiles).values(base);
    } else {
      const type = input.role === "business" ? "business" : input.role === "agency" ? "agency" : "individual";
      const [existing] = await db.select().from(clientProfiles).where(eq(clientProfiles.userId, ctx.user.id)).limit(1);
      const profile = { displayName: ctx.user.name || "Mono Design client", clientType: type as "individual" | "business" | "agency", companyName: input.companyName || null, industry: input.industry || null, description: "" };
      let clientProfileId: number;
      if (existing) { clientProfileId = existing.id; await db.update(clientProfiles).set(profile).where(eq(clientProfiles.id, existing.id)); }
      else { const inserted = await db.insert(clientProfiles).values({ userId: ctx.user.id, ...profile }); clientProfileId = Number((inserted as unknown as { insertId: number }).insertId); }
      await db.insert(clientMembers).values({ clientProfileId, userId: ctx.user.id, role: "owner" });
      const planCode = input.planCode ?? (type === "agency" ? "AGENCY" : type === "business" ? "BUSINESS" : "BASIC");
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, planCode)).limit(1);
      if (plan) {
        const [current] = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, ctx.user.id), eq(subscriptions.status, "active"))).limit(1);
        const now = new Date();
        const sub = { planId: plan.id, status: "active" as const, billingCycle: "monthly" as const, startedAt: now, renewsAt: new Date(now.getTime() + 30 * 86400000) };
        let subscriptionId: number;
        if (current) { subscriptionId = current.id; await db.update(subscriptions).set(sub).where(eq(subscriptions.id, current.id)); }
        else { const inserted = await db.insert(subscriptions).values({ userId: ctx.user.id, ...sub }); subscriptionId = Number((inserted as unknown as { insertId: number }).insertId); }
        if (plan.monthlyPriceCents > 0) await db.insert(payments).values({ userId: ctx.user.id, subscriptionId, amountCents: plan.monthlyPriceCents, status: "mock_completed", provider: "mock", transactionReference: `MONO-MOCK-ONBOARD-${subscriptionId}-${Date.now()}` });
      }
    }
    return { success: true };
  }),
  team: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb(); if (!db) return [];
    const profile = await clientProfileForUser(db, ctx.user.id); if (!profile) return [];
    const rows = await db.select({ userId: users.id, name: users.name, email: users.email, role: clientMembers.role, createdAt: clientMembers.createdAt }).from(clientMembers).innerJoin(users, eq(clientMembers.userId, users.id)).where(eq(clientMembers.clientProfileId, profile.id)).orderBy(asc(clientMembers.createdAt));
    if (profile.userId && !rows.some(item => item.userId === profile.userId)) { const [owner] = await db.select({ userId: users.id, name: users.name, email: users.email, createdAt: users.createdAt }).from(users).where(eq(users.id, profile.userId)).limit(1); if (owner) rows.unshift({ ...owner, role: "owner" as const }); }
    return rows;
  }),
  addTeamMember: protectedProcedure.input(z.object({ email: z.string().email().max(320), role: z.enum(["admin", "member"]) })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new Error("Database is not available");
    const profile = await clientProfileForUser(db, ctx.user.id);
    if (!profile || !["business", "agency"].includes(profile.clientType)) throw new Error("Only business and agency workspaces can add team members");
    if (!(await canManageClientProfile(db, profile, ctx.user.id))) throw new Error("Only a workspace owner or admin may add members");
    const [sub] = profile.userId ? await db.select().from(subscriptions).where(and(eq(subscriptions.userId, profile.userId), eq(subscriptions.status, "active"))).orderBy(desc(subscriptions.startedAt)).limit(1) : [];
    const [plan] = sub ? await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1) : [];
    if (!plan || plan.code === "BASIC") throw new Error("Team seats are included with Mono Business and Mono Agency");
    const normalizedEmail = input.email.trim().toLowerCase();
    const candidates = await db.select().from(users);
    const target = candidates.find(item => item.email?.trim().toLowerCase() === normalizedEmail);
    if (!target) throw new Error("That email does not yet have a Mono account");
    if (target.id === profile.userId) throw new Error("The workspace owner is already a member");
    if (target.marketplaceRole === "designer") throw new Error("Designer accounts cannot be added to a client workspace");
    const otherProfile = await clientProfileForUser(db, target.id);
    if (otherProfile && otherProfile.id !== profile.id) throw new Error("This account already belongs to a different client workspace");
    const existingMembership = await db.select().from(clientMembers).where(eq(clientMembers.userId, target.id)).limit(1);
    if (existingMembership.some(item => item.clientProfileId !== profile.id)) throw new Error("This account already has a team workspace");
    const [already] = await db.select().from(clientMembers).where(and(eq(clientMembers.clientProfileId, profile.id), eq(clientMembers.userId, target.id))).limit(1);
    if (!already) await db.insert(clientMembers).values({ clientProfileId: profile.id, userId: target.id, role: input.role });
    await db.insert(notifications).values({ userId: target.id, title: "You joined a Mono workspace", body: `You now have ${input.role} access to ${profile.companyName || profile.displayName}.`, kind: "team" });
    return { success: true };
  }),
  removeTeamMember: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new Error("Database is not available");
    const profile = await clientProfileForUser(db, ctx.user.id);
    if (!profile || !(await canManageClientProfile(db, profile, ctx.user.id))) throw new Error("Only a workspace owner or admin may remove members");
    if (input.userId === profile.userId) throw new Error("The workspace owner cannot be removed");
    const [member] = await db.select().from(clientMembers).where(and(eq(clientMembers.clientProfileId, profile.id), eq(clientMembers.userId, input.userId))).limit(1);
    if (!member) throw new Error("Team member not found");
    await db.delete(clientMembers).where(eq(clientMembers.id, member.id));
    return { success: true };
  }),
  agencyClients: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); if (!db) return []; const profile = await clientProfileForUser(db, ctx.user.id); if (!profile || profile.clientType !== "agency") return []; return db.select().from(agencyClients).where(eq(agencyClients.agencyProfileId, profile.id)).orderBy(asc(agencyClients.name)); }),
  saveAgencyClient: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().min(2).max(180), companyName: z.string().max(180).optional(), industry: z.string().max(120).optional(), contactName: z.string().max(160).optional(), contactEmail: z.string().email().max(320).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new Error("Database is not available");
    const profile = await clientProfileForUser(db, ctx.user.id);
    if (!profile || profile.clientType !== "agency" || !(await canManageClientProfile(db, profile, ctx.user.id))) throw new Error("Agency owner/admin access is required");
    const [sub] = profile.userId ? await db.select().from(subscriptions).where(and(eq(subscriptions.userId, profile.userId), eq(subscriptions.status, "active"))).orderBy(desc(subscriptions.startedAt)).limit(1) : [];
    const [plan] = sub ? await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1) : [];
    if (plan?.code !== "AGENCY") throw new Error("Client account management is included with Mono Agency");
    const values = { name: input.name, companyName: input.companyName || null, industry: input.industry || null, contactName: input.contactName || null, contactEmail: input.contactEmail || null };
    if (input.id) { const [existing] = await db.select().from(agencyClients).where(and(eq(agencyClients.id, input.id), eq(agencyClients.agencyProfileId, profile.id))).limit(1); if (!existing) throw new Error("Agency client not found"); await db.update(agencyClients).set(values).where(eq(agencyClients.id, existing.id)); }
    else await db.insert(agencyClients).values({ agencyProfileId: profile.id, ...values });
    return { success: true };
  }),
  removeAgencyClient: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); const profile = await clientProfileForUser(db, ctx.user.id); if (!profile || profile.clientType !== "agency" || !(await canManageClientProfile(db, profile, ctx.user.id))) throw new Error("Agency owner/admin access is required"); await db.delete(agencyClients).where(and(eq(agencyClients.id, input.id), eq(agencyClients.agencyProfileId, profile.id))); return { success: true }; }),
  selectPlan: protectedProcedure.input(z.object({ code: z.enum(["BASIC", "BUSINESS", "AGENCY"]), billingCycle: z.enum(["monthly", "annual"]) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const client = await clientProfileForUser(db, ctx.user.id);
    if (!client || client.userId !== ctx.user.id) throw new Error("Only the client workspace owner may select a membership plan");
    return db.transaction(async tx => {
      const [plan] = await tx.select().from(subscriptionPlans).where(and(eq(subscriptionPlans.code, input.code), eq(subscriptionPlans.isActive, true))).limit(1);
      if (!plan) throw new Error("Plan not found");
      const [current] = await tx.select().from(subscriptions).where(and(eq(subscriptions.userId, ctx.user.id), eq(subscriptions.status, "active"))).orderBy(desc(subscriptions.startedAt)).limit(1);
      const now = new Date();
      const subscriptionValues = { planId: plan.id, status: "active" as const, billingCycle: input.billingCycle, startedAt: now, renewsAt: new Date(now.getTime() + (input.billingCycle === "annual" ? 365 : 30) * 86400000) };
      let subscriptionId: number;
      if (current) { subscriptionId = current.id; await tx.update(subscriptions).set(subscriptionValues).where(eq(subscriptions.id, current.id)); }
      else { const inserted = await tx.insert(subscriptions).values({ userId: ctx.user.id, ...subscriptionValues }); subscriptionId = Number((inserted as unknown as { insertId: number }).insertId); }
      const amountCents = input.billingCycle === "annual" ? plan.annualPriceCents : plan.monthlyPriceCents;
      if (amountCents > 0) await tx.insert(payments).values({ userId: ctx.user.id, subscriptionId, amountCents, status: "mock_completed", provider: "mock", transactionReference: `MONO-MOCK-SUB-${subscriptionId}-${Date.now()}` });
      await tx.insert(notifications).values({ userId: ctx.user.id, title: "Mono membership updated", body: `${plan.name} is active on ${input.billingCycle} demo billing. No real payment was collected.`, kind: "subscription" });
      return { success: true, plan: plan.name, billingCycle: input.billingCycle, paymentMode: "mock" as const, noRealPayment: true };
    });
  }),
  updateClientProfile: protectedProcedure.input(z.object({ displayName: z.string().min(2).max(160), companyName: z.string().max(180).optional(), industry: z.string().max(120).optional(), description: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const existing = await clientProfileForUser(db, ctx.user.id);
    if (!existing || !(await canManageClientProfile(db, existing, ctx.user.id))) throw new Error("Only a workspace owner or admin may edit client profile details");
    await db.update(clientProfiles).set({ displayName: input.displayName, companyName: input.companyName || null, industry: input.industry || null, description: input.description || null }).where(eq(clientProfiles.id, existing.id));
    return { success: true };
  }),
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const client = await clientProfileForUser(db, ctx.user.id);
    if (client && client.userId !== ctx.user.id) throw new Error("Only the workspace owner may manage billing");
    const [subscription] = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, ctx.user.id), eq(subscriptions.status, "active"))).orderBy(desc(subscriptions.startedAt)).limit(1);
    if (!subscription) throw new Error("No active subscription found");
    await db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.id, subscription.id));
    await db.insert(notifications).values({ userId: ctx.user.id, title: "Membership cancelled", body: "Your demo subscription was cancelled. No future mock renewals will be recorded unless you reactivate it.", kind: "subscription" });
    return { success: true };
  }),
  renewSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const client = await clientProfileForUser(db, ctx.user.id);
    if (client && client.userId !== ctx.user.id) throw new Error("Only the workspace owner may manage billing");
    const [subscription] = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, ctx.user.id), eq(subscriptions.status, "cancelled"))).orderBy(desc(subscriptions.startedAt)).limit(1);
    if (!subscription) throw new Error("No cancelled subscription found");
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, subscription.planId)).limit(1);
    if (!plan || !plan.isActive) throw new Error("This plan is no longer available");
    const amountCents = subscription.billingCycle === "annual" ? plan.annualPriceCents : plan.monthlyPriceCents;
    await db.transaction(async tx => {
      await tx.update(subscriptions).set({ status: "active", startedAt: new Date(), renewsAt: new Date(Date.now() + (subscription.billingCycle === "annual" ? 365 : 30) * 86400000) }).where(eq(subscriptions.id, subscription.id));
      if (amountCents > 0) await tx.insert(payments).values({ userId: ctx.user.id, subscriptionId: subscription.id, amountCents, status: "mock_completed", provider: "mock", transactionReference: `MONO-MOCK-RENEW-${subscription.id}-${Date.now()}` });
      await tx.insert(notifications).values({ userId: ctx.user.id, title: "Mono membership renewed", body: `Your ${plan.name} demo membership is active again. No real payment was collected.`, kind: "subscription" });
    });
    return { success: true };
  }),
  billingHistory: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const client = await clientProfileForUser(db, ctx.user.id);
    return db.select().from(payments).where(eq(payments.userId, client?.userId || ctx.user.id)).orderBy(desc(payments.createdAt)).limit(100);
  }),
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { counts: { activeProjects: 0, pendingRequests: 0, completed: 0, favorites: 0 }, orders: [], projects: [], messages: [], quotes: [], subscription: null, designer: null };
    const profile = await designerProfileForUser(ctx.user.id);
    const client = profile ? undefined : await clientProfileForUser(db, ctx.user.id);
    const clientUserIds = client ? await accessibleClientUserIds(db, client) : [ctx.user.id];
    const ownOrders = profile
      ? await db.select().from(orders).where(eq(orders.designerId, profile.id)).orderBy(desc(orders.createdAt)).limit(20)
      : await db.select().from(orders).where(inArray(orders.clientUserId, clientUserIds)).orderBy(desc(orders.createdAt)).limit(20);
    const ownProjects = profile
      ? await db.select().from(projects).where(eq(projects.designerId, profile.id)).orderBy(desc(projects.createdAt)).limit(20)
      : await db.select().from(projects).where(inArray(projects.clientUserId, clientUserIds)).orderBy(desc(projects.createdAt)).limit(20);
    const ownMessages = profile
      ? await db.select().from(messages).where(eq(messages.designerId, profile.id)).orderBy(desc(messages.createdAt)).limit(30)
      : await db.select().from(messages).where(inArray(messages.clientUserId, clientUserIds)).orderBy(desc(messages.createdAt)).limit(30);
    const ownQuotes = profile
      ? await db.select().from(quotes).where(eq(quotes.designerId, profile.id)).orderBy(desc(quotes.createdAt)).limit(20)
      : await db.select().from(quotes).where(inArray(quotes.clientUserId, clientUserIds)).orderBy(desc(quotes.createdAt)).limit(20);
    const [subscription] = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, client?.userId || ctx.user.id), eq(subscriptions.status, "active"))).orderBy(desc(subscriptions.startedAt)).limit(1);
    const favoriteRows = await db.select().from(favorites).where(eq(favorites.userId, ctx.user.id));
    return { counts: { activeProjects: ownProjects.filter(item => !["completed", "cancelled"].includes(item.status)).length, pendingRequests: ownQuotes.filter(item => ["requested", "quoted"].includes(item.status)).length, completed: ownProjects.filter(item => item.status === "completed").length, favorites: favoriteRows.length, outstandingPaymentsCents: profile ? 0 : ownOrders.filter(item => item.paymentStatus === "mock_pending").reduce((sum, item) => sum + item.amountCents, 0), earningsCents: profile ? ownOrders.filter(item => item.paymentStatus === "mock_paid" && item.status === "completed").reduce((sum, item) => sum + item.amountCents, 0) : 0 }, orders: ownOrders, projects: ownProjects, messages: ownMessages, quotes: ownQuotes, subscription, designer: profile ? presentDesigner(profile) : null, client };
  }),
  notifications: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    return db ? db.select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.createdAt)).limit(30) : [];
  }),
  markNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { success: true };
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, ctx.user.id));
    return { success: true };
  }),
});

const favoriteRouter = router({
  toggle: protectedProcedure.input(z.object({ designerId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const [existing] = await db.select().from(favorites).where(and(eq(favorites.userId, ctx.user.id), eq(favorites.designerId, input.designerId))).limit(1);
    if (existing) { await db.delete(favorites).where(eq(favorites.id, existing.id)); return { saved: false }; }
    await db.insert(favorites).values({ userId: ctx.user.id, designerId: input.designerId });
    return { saved: true };
  }),
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(favorites).where(eq(favorites.userId, ctx.user.id));
    const ids = rows.map(row => row.designerId);
    const all = await db.select().from(designerProfiles);
    return all.filter(row => ids.includes(row.id)).map(presentDesigner);
  }),
});

const designerRouter = router({
  updateProfile: protectedProcedure.input(z.object({ name: z.string().min(2).max(160), title: z.string().min(2).max(180), location: z.string().min(2).max(160), bio: z.string().min(20).max(4000), yearsExperience: z.number().int().min(0).max(80), hourlyRateCents: money, skills: z.array(z.string().min(1).max(100)).max(40), categories: z.array(z.string().min(1).max(100)).max(30), tools: z.array(z.string().min(1).max(100)).max(30), languages: z.array(z.string().min(1).max(80)).max(20), available: z.boolean(), avatarUrl: z.string().max(700).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id);
    if (!db || !profile) throw new Error("Designer profile required");
    if (input.avatarUrl && !input.avatarUrl.startsWith("/manus-storage/") && !/^https:\/\//i.test(input.avatarUrl)) throw new Error("Profile image must use a secure image URL");
    if (input.avatarUrl?.startsWith("/manus-storage/")) await verifyOwnedStoredImageUrl(db, ctx.user.id, input.avatarUrl, ["profile"]);
    await db.update(designerProfiles).set({ name: input.name, title: input.title, location: input.location, bio: input.bio, yearsExperience: input.yearsExperience, hourlyRateCents: input.hourlyRateCents, skills: JSON.stringify(input.skills), categories: JSON.stringify(input.categories), tools: JSON.stringify(input.tools), languages: JSON.stringify(input.languages), available: input.available, ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}) }).where(eq(designerProfiles.id, profile.id));
    return { success: true };
  }),
  portfolioList: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id); if (!db || !profile) return []; return (await db.select().from(portfolioProjects).where(eq(portfolioProjects.designerId, profile.id)).orderBy(asc(portfolioProjects.sortOrder), desc(portfolioProjects.createdAt))).map(item => ({ ...item, skills: jsonArray(item.skills), tools: jsonArray(item.tools), images: (() => { try { const parsed = JSON.parse(item.images || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })() })); }),
  myReviews: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id); return db && profile ? db.select().from(reviews).where(and(eq(reviews.designerId, profile.id), eq(reviews.isReported, false))).orderBy(desc(reviews.createdAt)).limit(200) : []; }),
  analytics: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id);
    if (!db || !profile) return { totalProjects: 0, activeProjects: 0, completedProjects: 0, totalEarningsCents: 0, averageRating: 0, profileViews: 0, serviceViews: 0, enquiries: 0, conversionRate: 0 };
    const [projectRows, orderRows, viewRows, messageRows, serviceRows] = await Promise.all([
      db.select().from(projects).where(eq(projects.designerId, profile.id)), db.select().from(orders).where(eq(orders.designerId, profile.id)),
      db.select().from(listingViews).where(eq(listingViews.designerId, profile.id)), db.select().from(messages).where(eq(messages.designerId, profile.id)),
      db.select({ id: services.id }).from(services).where(eq(services.designerId, profile.id)),
    ]);
    const serviceIds = serviceRows.map(item => item.id); const serviceOrderCount = orderRows.filter(item => item.serviceId !== null).length;
    const profileViews = viewRows.filter(item => item.serviceId === null).length; const serviceViews = viewRows.filter(item => item.serviceId !== null && serviceIds.includes(item.serviceId)).length;
    return { totalProjects: projectRows.length, activeProjects: projectRows.filter(item => !["completed", "cancelled"].includes(item.status)).length, completedProjects: projectRows.filter(item => item.status === "completed").length, totalEarningsCents: orderRows.filter(item => item.paymentStatus === "mock_paid" && item.status === "completed").reduce((sum, item) => sum + item.amountCents, 0), averageRating: profile.ratingTenths / 10, profileViews, serviceViews, enquiries: messageRows.length, conversionRate: serviceViews ? Math.round(serviceOrderCount / serviceViews * 1000) / 10 : 0 };
  }),
  myServices: protectedProcedure.query(async ({ ctx }) => { const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id); if (!db || !profile) return []; const rows = await db.select().from(services).where(eq(services.designerId, profile.id)).orderBy(desc(services.createdAt)); const packages = await db.select().from(servicePackages); return rows.map(item => ({ ...item, deliverables: jsonArray(item.deliverables), tags: jsonArray(item.tags), addOns: (() => { try { const parsed = JSON.parse(item.addOns || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })(), packages: packages.filter(pkg => pkg.serviceId === item.id).map(pkg => ({ ...pkg, deliverables: jsonArray(pkg.deliverables) })) })); }),
  createService: protectedProcedure.input(z.object({ title: z.string().min(3).max(180), category: z.string().min(2).max(100), description: z.string().min(20).max(3000), requirements: z.string().max(2000).optional(), addOns: z.array(z.object({ name: z.string().min(2).max(100), description: z.string().max(300).optional(), priceCents: money })).max(8).optional(), imageUrl: z.string().max(700).optional(), priceCents: z.number().int().min(100).max(50_000_000), deliveryDays: z.number().int().min(1).max(365), revisions: z.number().int().min(0).max(20), deliverables: z.array(z.string().min(1).max(200)).max(20) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    const profile = await designerProfileForUser(ctx.user.id);
    if (!db || !profile) throw new Error("Complete designer onboarding before creating a service");
    const category = (await db.select().from(categories).where(eq(categories.name, input.category)).limit(1))[0];
    const slug = `${profile.slug}-${slugify(input.title)}-${Date.now().toString(36)}`;
    const imageUrl = input.imageUrl || profile.avatarUrl || "";
    if (imageUrl && !imageUrl.startsWith("/manus-storage/") && !/^https:\/\//i.test(imageUrl)) throw new Error("Service image must use a secure image URL");
    if (imageUrl.startsWith("/manus-storage/")) await verifyOwnedStoredImageUrl(db, ctx.user.id, imageUrl, ["portfolio", "profile"]);
    const packageNames = ["Basic", "Standard", "Premium"] as const;
    const packagePrices = [input.priceCents, Math.min(50_000_000, Math.round(input.priceCents * 1.75)), Math.min(50_000_000, Math.round(input.priceCents * 2.5))];
    const packageDeliveries = [input.deliveryDays, Math.max(1, Math.round(input.deliveryDays * 0.8)), Math.max(1, Math.round(input.deliveryDays * 0.6))];
    const packageRevisions = [input.revisions, input.revisions + 1, input.revisions + 2].map(value => Math.min(value, 20));
    const serviceId = await db.transaction(async tx => {
      const inserted = await tx.insert(services).values({ designerId: profile.id, categoryId: category?.id, title: input.title, slug, description: input.description, requirements: input.requirements || null, addOns: JSON.stringify(input.addOns || []), priceCents: input.priceCents, deliveryDays: input.deliveryDays, revisions: input.revisions, deliverables: JSON.stringify(input.deliverables), imageUrl, tags: JSON.stringify([input.category]), status: "pending" });
      const id = Number((inserted as unknown as { insertId: number }).insertId);
      for (let index = 0; index < packageNames.length; index++) await tx.insert(servicePackages).values({ serviceId: id, name: packageNames[index], priceCents: packagePrices[index], deliveryDays: packageDeliveries[index], revisions: packageRevisions[index], deliverables: JSON.stringify(input.deliverables) });
      return id;
    });
    return { success: true, serviceId, status: "pending" };
  }),
  updateService: protectedProcedure.input(z.object({ id: z.number().int().positive(), title: z.string().min(3).max(180), category: z.string().min(2).max(100), description: z.string().min(20).max(3000), requirements: z.string().max(2000).optional(), addOns: z.array(z.object({ name: z.string().min(2).max(100), description: z.string().max(300).optional(), priceCents: money })).max(8).optional(), imageUrl: z.string().max(700).optional(), priceCents: z.number().int().min(100).max(50_000_000), deliveryDays: z.number().int().min(1).max(365), revisions: z.number().int().min(0).max(20), deliverables: z.array(z.string().min(1).max(200)).max(20) })).mutation(async ({ ctx, input }) => { const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id); if (!db || !profile) throw new Error("Designer profile required"); const [service] = await db.select().from(services).where(and(eq(services.id, input.id), eq(services.designerId, profile.id))).limit(1); if (!service) throw new Error("Service not found"); const category = (await db.select().from(categories).where(eq(categories.name, input.category)).limit(1))[0]; const imageUrl = input.imageUrl || service.imageUrl; if (imageUrl && !imageUrl.startsWith("/manus-storage/") && !/^https:\/\//i.test(imageUrl)) throw new Error("Service image must use a secure image URL"); if (imageUrl.startsWith("/manus-storage/")) await verifyOwnedStoredImageUrl(db, ctx.user.id, imageUrl, ["portfolio", "profile"]); await db.update(services).set({ title: input.title, categoryId: category?.id, description: input.description, requirements: input.requirements || null, addOns: JSON.stringify(input.addOns || []), imageUrl, priceCents: input.priceCents, deliveryDays: input.deliveryDays, revisions: input.revisions, deliverables: JSON.stringify(input.deliverables), tags: JSON.stringify([input.category]), status: "pending" }).where(eq(services.id, service.id)); const packages = [{ name: "Basic" as const, priceCents: input.priceCents, deliveryDays: input.deliveryDays, revisions: input.revisions }, { name: "Standard" as const, priceCents: Math.min(50_000_000, Math.round(input.priceCents * 1.75)), deliveryDays: Math.max(1, Math.round(input.deliveryDays * 0.8)), revisions: Math.min(input.revisions + 1, 20) }, { name: "Premium" as const, priceCents: Math.min(50_000_000, Math.round(input.priceCents * 2.5)), deliveryDays: Math.max(1, Math.round(input.deliveryDays * 0.6)), revisions: Math.min(input.revisions + 2, 20) }]; for (const pkg of packages) { const [existing] = await db.select().from(servicePackages).where(and(eq(servicePackages.serviceId, service.id), eq(servicePackages.name, pkg.name))).limit(1); const values = { ...pkg, serviceId: service.id, deliverables: JSON.stringify(input.deliverables) }; if (existing) await db.update(servicePackages).set(values).where(eq(servicePackages.id, existing.id)); else await db.insert(servicePackages).values(values); } return { success: true, status: "pending" }; }),
  createPortfolio: protectedProcedure.input(z.object({ title: z.string().min(3).max(180), category: z.string().min(2).max(100), description: z.string().min(20).max(3000), images: z.array(storedAssetSchema).min(1).max(5), videoUrl: z.string().max(700).optional(), skills: z.array(z.string().max(100)).max(30), projectOutcome: z.string().max(2000).optional(), tools: z.array(z.string().max(100)).max(20), projectType: z.string().min(2).max(120) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    const profile = await designerProfileForUser(ctx.user.id);
    if (!db || !profile) throw new Error("Complete designer onboarding before adding portfolio work");
    const uploaded = await verifyOwnedAssets(db, ctx.user.id, input.images, "portfolio");
    if (input.videoUrl && !/^https:\/\//i.test(input.videoUrl)) throw new Error("Portfolio video must use a secure HTTPS URL");
    const existing = await db.select({ id: portfolioProjects.id }).from(portfolioProjects).where(eq(portfolioProjects.designerId, profile.id));
    await db.insert(portfolioProjects).values({ designerId: profile.id, title: input.title, category: input.category, description: input.description, imageUrl: uploaded[0].url, images: JSON.stringify(uploaded), videoUrl: input.videoUrl || null, skills: JSON.stringify(input.skills), projectOutcome: input.projectOutcome || null, tools: JSON.stringify(input.tools), projectType: input.projectType, status: "draft", sortOrder: existing.length });
    return { success: true, status: "draft" };
  }),
  updatePortfolio: protectedProcedure.input(z.object({ id: z.number().int().positive(), title: z.string().min(3).max(180), category: z.string().min(2).max(100), description: z.string().min(20).max(3000), images: z.array(storedAssetSchema).max(5).optional(), videoUrl: z.string().max(700).optional(), skills: z.array(z.string().max(100)).max(30), projectOutcome: z.string().max(2000).optional(), tools: z.array(z.string().max(100)).max(20), projectType: z.string().min(2).max(120) })).mutation(async ({ ctx, input }) => { const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id); if (!db || !profile) throw new Error("Designer profile required"); const [item] = await db.select().from(portfolioProjects).where(and(eq(portfolioProjects.id, input.id), eq(portfolioProjects.designerId, profile.id))).limit(1); if (!item) throw new Error("Portfolio item not found"); if (input.videoUrl && !/^https:\/\//i.test(input.videoUrl)) throw new Error("Portfolio video must use a secure HTTPS URL"); const assets = input.images?.length ? await verifyOwnedAssets(db, ctx.user.id, input.images, "portfolio") : null; await db.update(portfolioProjects).set({ title: input.title, category: input.category, description: input.description, ...(assets ? { imageUrl: assets[0].url, images: JSON.stringify(assets) } : {}), videoUrl: input.videoUrl || null, skills: JSON.stringify(input.skills), projectOutcome: input.projectOutcome || null, tools: JSON.stringify(input.tools), projectType: input.projectType }).where(eq(portfolioProjects.id, input.id)); return { success: true }; }),
  setPortfolioStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["draft", "published"]) })).mutation(async ({ ctx, input }) => { const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id); if (!db || !profile) throw new Error("Designer profile required"); await db.update(portfolioProjects).set({ status: input.status }).where(and(eq(portfolioProjects.id, input.id), eq(portfolioProjects.designerId, profile.id))); return { success: true }; }),
  deletePortfolio: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id); if (!db || !profile) throw new Error("Designer profile required"); await db.delete(portfolioProjects).where(and(eq(portfolioProjects.id, input.id), eq(portfolioProjects.designerId, profile.id))); return { success: true }; }),
  reorderPortfolio: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).max(100) })).mutation(async ({ ctx, input }) => { const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id); if (!db || !profile) throw new Error("Designer profile required"); if (new Set(input.ids).size !== input.ids.length) throw new Error("Portfolio order contains duplicates"); const owned = await db.select({ id: portfolioProjects.id }).from(portfolioProjects).where(eq(portfolioProjects.designerId, profile.id)); if (input.ids.some(id => !owned.some(item => item.id === id))) throw new Error("You may only reorder your own portfolio items"); await db.transaction(async tx => { for (let index = 0; index < input.ids.length; index++) await tx.update(portfolioProjects).set({ sortOrder: index }).where(and(eq(portfolioProjects.id, input.ids[index]), eq(portfolioProjects.designerId, profile.id))); }); return { success: true }; }),
  setServiceStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["pending", "paused", "removed"]) })).mutation(async ({ ctx, input }) => { const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id); if (!db || !profile) throw new Error("Designer profile required"); const [service] = await db.select().from(services).where(and(eq(services.id, input.id), eq(services.designerId, profile.id))).limit(1); if (!service) throw new Error("Service not found"); if (input.status === "pending" && service.status === "published") throw new Error("Pause a published service instead; only administrators can approve listings"); await db.update(services).set({ status: input.status }).where(eq(services.id, service.id)); return { success: true }; }),
  addPackage: protectedProcedure.input(z.object({ serviceId: z.number().int().positive(), name: z.enum(["Basic", "Standard", "Premium"]), priceCents: money, deliveryDays: z.number().int().min(1).max(365), revisions: z.number().int().min(0).max(20), deliverables: z.array(z.string().min(1).max(200)).max(20) })).mutation(async ({ ctx, input }) => { const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id); if (!db || !profile) throw new Error("Designer profile required"); const [service] = await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.designerId, profile.id))).limit(1); if (!service) throw new Error("Service not found"); const [existing] = await db.select().from(servicePackages).where(and(eq(servicePackages.serviceId, service.id), eq(servicePackages.name, input.name))).limit(1); const values = { serviceId: service.id, name: input.name, priceCents: input.priceCents, deliveryDays: input.deliveryDays, revisions: input.revisions, deliverables: JSON.stringify(input.deliverables) }; if (existing) await db.update(servicePackages).set(values).where(eq(servicePackages.id, existing.id)); else await db.insert(servicePackages).values(values); return { success: true }; }),
  removePackage: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); const profile = await designerProfileForUser(ctx.user.id); if (!db || !profile) throw new Error("Designer profile required"); const [pkg] = await db.select().from(servicePackages).where(eq(servicePackages.id, input.id)).limit(1); if (!pkg) throw new Error("Package not found"); const [service] = await db.select().from(services).where(and(eq(services.id, pkg.serviceId), eq(services.designerId, profile.id))).limit(1); if (!service) throw new Error("You do not own this service"); await db.delete(servicePackages).where(eq(servicePackages.id, pkg.id)); return { success: true }; }),
  updateOrder: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), status: z.enum(["confirmed", "requirements", "in_progress", "client_review", "revision", "final_delivery", "completed", "cancelled"]) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) throw new Error("Order not found");
    const profile = await designerProfileForUser(ctx.user.id);
    const isDesigner = profile?.id === order.designerId;
    const clientProfile = isDesigner ? undefined : await clientProfileForUser(db, ctx.user.id);
    const clientUserIds = clientProfile ? await accessibleClientUserIds(db, clientProfile) : [ctx.user.id];
    const isClient = clientUserIds.includes(order.clientUserId || -1);
    if (!isDesigner && !isClient && ctx.user.role !== "admin") throw new Error("You do not have access to this order");
    if (ctx.user.role !== "admin") {
      const designerTransitions: Record<string, string[]> = { placed: ["confirmed", "requirements"], confirmed: ["requirements", "in_progress"], requirements: ["in_progress"], in_progress: ["client_review"], client_review: ["revision", "final_delivery"], revision: ["in_progress", "client_review"] };
      const clientTransitions: Record<string, string[]> = { placed: ["cancelled"], client_review: ["revision"], final_delivery: ["revision", "completed"] };
      const allowed = isDesigner ? designerTransitions[order.status] || [] : clientTransitions[order.status] || [];
      if (!allowed.includes(input.status)) throw new Error(isDesigner ? "That designer update is not allowed at this project stage" : "Clients may cancel a new order, request a revision after review, or approve final delivery");
    }
    const [designer] = await db.select().from(designerProfiles).where(eq(designerProfiles.id, order.designerId)).limit(1);
    await db.transaction(async tx => {
      await tx.update(orders).set({ status: input.status }).where(eq(orders.id, order.id));
      await tx.update(projects).set({ status: input.status, completedAt: input.status === "completed" ? new Date() : null }).where(eq(projects.orderId, order.id));
      if (isDesigner && order.clientUserId) await tx.insert(notifications).values({ userId: order.clientUserId, title: input.status === "final_delivery" ? "Final design is ready" : input.status === "client_review" ? "A draft is ready to review" : input.status === "requirements" ? "Your designer needs project details" : "Project updated", body: `${order.projectName} moved to ${input.status.replaceAll("_", " ")}.`, kind: input.status === "revision" ? "revision" : "project" });
      if (isClient && designer?.userId) await tx.insert(notifications).values({ userId: designer.userId, title: input.status === "revision" ? "Client requested a revision" : input.status === "completed" ? "Project approved" : "Order update", body: `${order.projectName} moved to ${input.status.replaceAll("_", " ")}.`, kind: input.status === "revision" ? "revision" : "project" });
    });
    return { success: true };
  }),
});

const orderRouter = router({
  checkout: protectedProcedure.input(z.object({ items: z.array(z.object({ serviceId: z.number().int().positive(), packageName: z.enum(["Basic", "Standard", "Premium"]), quantity: z.number().int().min(1).max(10), addOns: z.array(z.string().min(1).max(100)).max(8).optional() })).min(1).max(20), projectName: z.string().min(3).max(180), requirements: z.string().min(10).max(4000), agencyClientId: z.number().int().positive().optional(), promoCode: z.string().max(40).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const client = await clientProfileForUser(db, ctx.user.id);
    if (!client) throw new Error("Complete client onboarding before checkout");
    if (input.agencyClientId) { if (client.clientType !== "agency") throw new Error("Only agency workspaces can assign a project to an agency client"); const [agencyClient] = await db.select().from(agencyClients).where(and(eq(agencyClients.id, input.agencyClientId), eq(agencyClients.agencyProfileId, client.id))).limit(1); if (!agencyClient) throw new Error("That agency client does not belong to your workspace"); }
    return db.transaction(async tx => {
      const loaded: Array<{ service: typeof services.$inferSelect; packageName: string; quantity: number; unitPriceCents: number; deliveryDays: number; addOns: Array<{ name: string; description?: string; priceCents: number }> }> = [];
      for (const item of input.items) {
        const [service] = await tx.select().from(services).where(and(eq(services.id, item.serviceId), eq(services.status, "published"))).limit(1);
        if (!service) throw new Error("A service in your cart is no longer available");
        const [designer] = await tx.select().from(designerProfiles).where(and(eq(designerProfiles.id, service.designerId), eq(designerProfiles.status, "approved"))).limit(1);
        if (!designer) throw new Error("A designer in your cart is no longer available");
        const [bundle] = await tx.select().from(servicePackages).where(and(eq(servicePackages.serviceId, service.id), eq(servicePackages.name, item.packageName))).limit(1);
        if (!bundle) throw new Error(`${item.packageName} package is no longer available for ${service.title}`);
        let availableAddOns: Array<{ name: string; description?: string; priceCents: number }> = [];
        try { const parsed = JSON.parse(service.addOns || "[]"); if (Array.isArray(parsed)) availableAddOns = parsed.filter(item => item && typeof item.name === "string" && Number.isInteger(item.priceCents) && item.priceCents >= 0); } catch { /* invalid optional add-ons are not selectable */ }
        const requestedNames = item.addOns || [];
        if (new Set(requestedNames).size !== requestedNames.length) throw new Error("A service add-on was selected more than once");
        const selectedAddOns = availableAddOns.filter(option => requestedNames.includes(option.name));
        if (selectedAddOns.length !== requestedNames.length) throw new Error(`A selected add-on is no longer available for ${service.title}`);
        loaded.push({ service, packageName: item.packageName, quantity: item.quantity, unitPriceCents: bundle.priceCents + selectedAddOns.reduce((sum, option) => sum + option.priceCents, 0), deliveryDays: bundle.deliveryDays, addOns: selectedAddOns });
      }
      const subtotalCents = loaded.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
      const normalizedPromo = input.promoCode?.trim().toUpperCase() || "";
      const discountRate = normalizedPromo === "MONO10" ? 0.1 : normalizedPromo === "MONO15" ? 0.15 : 0;
      if (normalizedPromo && !discountRate) throw new Error("That demo promo code is not valid. Try MONO10 or MONO15.");
      const discountCents = Math.round(subtotalCents * discountRate);
      const orderIds: number[] = [];
      const projectIds: number[] = [];
      let remainingDiscount = discountCents;
      for (let index = 0; index < loaded.length; index++) {
        const item = loaded[index];
        const lineSubtotal = item.unitPriceCents * item.quantity;
        const lineDiscount = index === loaded.length - 1 ? remainingDiscount : Math.round(discountCents * lineSubtotal / subtotalCents);
        remainingDiscount -= lineDiscount;
        const amountCents = lineSubtotal - lineDiscount;
        const inserted = await tx.insert(orders).values({ clientUserId: ctx.user.id, clientName: ctx.user.name || ctx.user.email || client.displayName, designerId: item.service.designerId, serviceId: item.service.id, packageName: item.packageName, projectName: input.projectName, amountCents, status: "placed", paymentStatus: "mock_paid", requirements: input.requirements });
        const orderId = Number((inserted as unknown as { insertId: number }).insertId);
        orderIds.push(orderId);
        await tx.insert(orderItems).values({ orderId, serviceId: item.service.id, designerId: item.service.designerId, title: item.service.title, packageName: item.packageName, addOns: JSON.stringify(item.addOns), quantity: item.quantity, unitPriceCents: item.unitPriceCents });
        const projectInsert = await tx.insert(projects).values({ orderId, clientUserId: ctx.user.id, designerId: item.service.designerId, agencyClientId: input.agencyClientId ?? null, name: input.projectName, description: input.requirements, status: "placed", deadline: new Date(Date.now() + item.deliveryDays * 86400000) });
        projectIds.push(Number((projectInsert as unknown as { insertId: number }).insertId));
        await tx.insert(payments).values({ userId: ctx.user.id, orderId, amountCents, status: "mock_completed", provider: "mock", transactionReference: `MONO-MOCK-${orderId}-${Date.now()}` });
        const [designer] = await tx.select().from(designerProfiles).where(eq(designerProfiles.id, item.service.designerId)).limit(1);
        if (designer?.userId) await tx.insert(notifications).values({ userId: designer.userId, title: "New order received", body: `${ctx.user.name || "A client"} placed an order for ${item.service.title}.`, kind: "order" });
        if (client.userId && client.userId !== ctx.user.id) await tx.insert(notifications).values({ userId: client.userId, title: "Demo checkout recorded", body: `${input.projectName} was placed for ${item.service.title}. No real payment was collected.`, kind: "payment" });
      }
      return { orderIds, projectIds, subtotalCents, discountCents, totalCents: subtotalCents - discountCents, paymentMode: "mock" as const, paymentStatus: "mock_completed" as const, noRealPayment: true };
    });
  }),
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const profile = await designerProfileForUser(ctx.user.id);
    if (ctx.user.role === "admin") return db.select().from(orders).orderBy(desc(orders.createdAt));
    if (profile) return db.select().from(orders).where(eq(orders.designerId, profile.id)).orderBy(desc(orders.createdAt));
    const client = await clientProfileForUser(db, ctx.user.id);
    const clientIds = client ? await accessibleClientUserIds(db, client) : [ctx.user.id];
    return db.select().from(orders).where(inArray(orders.clientUserId, clientIds)).orderBy(desc(orders.createdAt));
  }),
  openDispute: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), reason: z.string().min(20).max(3000) })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new Error("Database is not available");
    const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1); if (!order) throw new Error("Order not found");
    const designer = await designerProfileForUser(ctx.user.id); const client = designer ? undefined : await clientProfileForUser(db, ctx.user.id);
    const clientIds = client ? await accessibleClientUserIds(db, client) : [ctx.user.id];
    if (ctx.user.role !== "admin" && designer?.id !== order.designerId && !clientIds.includes(order.clientUserId || -1)) throw new Error("You do not have access to this order");
    if (["cancelled", "completed"].includes(order.status)) throw new Error("This order can no longer be disputed");
    const [open] = await db.select().from(disputes).where(and(eq(disputes.orderId, order.id), eq(disputes.status, "open"))).limit(1);
    if (open) throw new Error("An open dispute already exists for this order");
    await db.insert(disputes).values({ orderId: order.id, openedBy: ctx.user.id, reason: input.reason });
    const [designerOwner] = await db.select().from(designerProfiles).where(eq(designerProfiles.id, order.designerId)).limit(1);
    if (designerOwner?.userId) await db.insert(notifications).values({ userId: designerOwner.userId, title: "Order dispute opened", body: `A dispute was opened for ${order.projectName}. Mono administration will review it.`, kind: "dispute" });
    return { success: true };
  }),
});

const quoteRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const profile = await designerProfileForUser(ctx.user.id);
    if (profile) return db.select().from(quotes).where(eq(quotes.designerId, profile.id)).orderBy(desc(quotes.createdAt));
    const client = await clientProfileForUser(db, ctx.user.id);
    const clientIds = client ? await accessibleClientUserIds(db, client) : [ctx.user.id];
    return db.select().from(quotes).where(inArray(quotes.clientUserId, clientIds)).orderBy(desc(quotes.createdAt));
  }),
  request: protectedProcedure.input(z.object({ designerId: z.number().int().positive(), projectName: z.string().min(3).max(180), category: z.string().min(2).max(100), description: z.string().min(20).max(4000), targetAudience: z.string().max(180).optional(), deliverables: z.string().max(1200).optional(), budgetRange: z.string().max(80).optional(), requestedDeadline: z.string().datetime().optional(), referenceFiles: assetListSchema })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const client = await clientProfileForUser(db, ctx.user.id);
    if (!client) throw new Error("Complete client onboarding before requesting a quotation");
    const [subscription] = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, client.userId || ctx.user.id), eq(subscriptions.status, "active"))).orderBy(desc(subscriptions.startedAt)).limit(1);
    const [plan] = subscription ? await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, subscription.planId)).limit(1) : [];
    if (!plan || plan.code === "BASIC") throw new Error("Custom quotations are included with Mono Business and Mono Agency. Choose a plan to continue.");
    const [designer] = await db.select().from(designerProfiles).where(and(eq(designerProfiles.id, input.designerId), eq(designerProfiles.status, "approved"))).limit(1);
    if (!designer) throw new Error("Designer not found");
    const referenceFiles = await verifyOwnedAssets(db, ctx.user.id, input.referenceFiles, "quote");
    await db.insert(quotes).values({ clientUserId: ctx.user.id, designerId: designer.id, projectName: input.projectName, category: input.category, description: input.description, targetAudience: input.targetAudience || null, deliverables: input.deliverables || null, budgetRange: input.budgetRange || null, requestedDeadline: input.requestedDeadline ? new Date(input.requestedDeadline) : null, referenceFiles: referenceFiles.length ? JSON.stringify(referenceFiles) : null, status: "requested" });
    if (designer.userId) await db.insert(notifications).values({ userId: designer.userId, title: "New quote request", body: `${ctx.user.name || "A client"} requested a quote for ${input.projectName}.`, kind: "quote" });
    return { success: true };
  }),
  respond: protectedProcedure.input(z.object({ quoteId: z.number().int().positive(), amountCents: money, deliverables: z.string().min(3).max(1200), deliveryDays: z.number().int().min(1).max(365), revisions: z.number().int().min(0).max(20), terms: z.string().max(2000), expiresAt: z.string().datetime().optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    const profile = await designerProfileForUser(ctx.user.id);
    if (!db || !profile) throw new Error("Designer profile required");
    const [quote] = await db.select().from(quotes).where(and(eq(quotes.id, input.quoteId), eq(quotes.designerId, profile.id))).limit(1);
    if (!quote || quote.status !== "requested") throw new Error("Quote request is no longer available");
    await db.update(quotes).set({ amountCents: input.amountCents, deliverables: input.deliverables, deliveryDays: input.deliveryDays, revisions: input.revisions, terms: input.terms, status: "quoted", expiresAt: input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + 7 * 86400000) }).where(eq(quotes.id, quote.id));
    if (quote.clientUserId) await db.insert(notifications).values({ userId: quote.clientUserId, title: "Your quote is ready", body: `A designer sent a quote for ${quote.projectName}.`, kind: "quote" });
    return { success: true };
  }),
  accept: protectedProcedure.input(z.object({ quoteId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const client = await clientProfileForUser(db, ctx.user.id);
    if (!client) throw new Error("Complete client onboarding before accepting a quotation");
    const clientIds = await accessibleClientUserIds(db, client);
    const [quote] = await db.select().from(quotes).where(and(eq(quotes.id, input.quoteId), inArray(quotes.clientUserId, clientIds))).limit(1);
    if (!quote || quote.status !== "quoted" || !quote.amountCents) throw new Error("Quote cannot be accepted");
    if (quote.expiresAt && quote.expiresAt.getTime() < Date.now()) throw new Error("This quote has expired. Ask the designer for an updated proposal.");
    const orderId = await db.transaction(async tx => {
      const [current] = await tx.select().from(quotes).where(and(eq(quotes.id, quote.id), eq(quotes.status, "quoted"))).limit(1);
      if (!current || current.expiresAt && current.expiresAt.getTime() < Date.now()) throw new Error("Quote changed or expired before it could be accepted");
      const result = await tx.insert(orders).values({ clientUserId: ctx.user.id, clientName: ctx.user.name || ctx.user.email || client.displayName, designerId: quote.designerId, projectName: quote.projectName, amountCents: quote.amountCents!, status: "placed", paymentStatus: "mock_paid", requirements: quote.description });
      const newOrderId = Number((result as unknown as { insertId: number }).insertId);
      await tx.insert(orderItems).values({ orderId: newOrderId, serviceId: null, designerId: quote.designerId, title: quote.projectName, packageName: "Custom", quantity: 1, unitPriceCents: quote.amountCents! });
      await tx.insert(projects).values({ orderId: newOrderId, clientUserId: ctx.user.id, designerId: quote.designerId, name: quote.projectName, description: quote.description, status: "placed", deadline: new Date(Date.now() + (quote.deliveryDays || 7) * 86400000) });
      await tx.insert(payments).values({ userId: client.userId || ctx.user.id, orderId: newOrderId, amountCents: quote.amountCents!, status: "mock_completed", provider: "mock", transactionReference: `MONO-MOCK-${newOrderId}-${Date.now()}` });
      await tx.update(quotes).set({ status: "accepted" }).where(eq(quotes.id, quote.id));
      return newOrderId;
    });
    const [designer] = await db.select().from(designerProfiles).where(eq(designerProfiles.id, quote.designerId)).limit(1);
    if (designer?.userId) await db.insert(notifications).values({ userId: designer.userId, title: "Quote accepted", body: `${ctx.user.name || "A client"} accepted your quote for ${quote.projectName}.`, kind: "quote" });
    return { orderId };
  }),
  decline: protectedProcedure.input(z.object({ quoteId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const client = await clientProfileForUser(db, ctx.user.id); if (!client) throw new Error("Complete client onboarding first"); const clientIds = await accessibleClientUserIds(db, client);
    const [quote] = await db.select().from(quotes).where(and(eq(quotes.id, input.quoteId), inArray(quotes.clientUserId, clientIds), eq(quotes.status, "quoted"))).limit(1);
    if (!quote) throw new Error("Only an open quote from your workspace may be declined");
    await db.update(quotes).set({ status: "declined" }).where(eq(quotes.id, quote.id));
    const [designer] = await db.select().from(designerProfiles).where(eq(designerProfiles.id, quote.designerId)).limit(1);
    if (designer?.userId) await db.insert(notifications).values({ userId: designer.userId, title: "Quote declined", body: `The client declined the quote for ${quote.projectName}.`, kind: "quote" });
    return { success: true };
  }),
});

const messageRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const profile = await designerProfileForUser(ctx.user.id);
    const client = profile ? undefined : await clientProfileForUser(db, ctx.user.id);
    const clientIds = client ? await accessibleClientUserIds(db, client) : [ctx.user.id];
    const condition = profile ? eq(messages.designerId, profile.id) : inArray(messages.clientUserId, clientIds);
    return db.select().from(messages).where(condition).orderBy(desc(messages.createdAt)).limit(60);
  }),
  send: protectedProcedure.input(z.object({ designerId: z.number().int().positive(), body: z.string().min(2).max(4000), projectId: z.number().int().positive().optional(), clientUserId: z.number().int().positive().optional(), attachments: assetListSchema })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const [designer] = await db.select().from(designerProfiles).where(eq(designerProfiles.id, input.designerId)).limit(1);
    if (!designer || designer.status !== "approved") throw new Error("Designer not found");
    const isDesigner = designer.userId === ctx.user.id;
    let clientUserId = ctx.user.id;
    if (isDesigner) {
      if (!input.clientUserId) throw new Error("A client must be selected to reply");
      const [prior] = await db.select().from(messages).where(and(eq(messages.clientUserId, input.clientUserId), eq(messages.designerId, designer.id))).limit(1);
      if (!prior) throw new Error("Conversation not found");
      clientUserId = input.clientUserId;
    } else {
      const client = await clientProfileForUser(db, ctx.user.id);
      if (!client) throw new Error("Complete client onboarding before contacting a designer");
    }
    if (input.projectId) {
      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
      if (!project || project.designerId !== designer.id) throw new Error("You do not have access to this project conversation");
      if (isDesigner) {
        if (project.clientUserId !== clientUserId) throw new Error("This project does not belong to the selected client conversation");
      } else {
        const client = await clientProfileForUser(db, ctx.user.id);
        const clientIds = client ? await accessibleClientUserIds(db, client) : [ctx.user.id];
        if (!clientIds.includes(project.clientUserId || -1)) throw new Error("You do not have access to this project conversation");
      }
    }
    const attachments = isDesigner ? [] : await verifyOwnedAssets(db, ctx.user.id, input.attachments, "enquiry");
    await db.insert(messages).values({ projectId: input.projectId ?? null, clientUserId, designerId: designer.id, senderUserId: ctx.user.id, senderName: ctx.user.name || "Mono Design member", body: input.body, attachments: attachments.length ? JSON.stringify(attachments) : null });
    if (isDesigner && clientUserId !== ctx.user.id) await db.insert(notifications).values({ userId: clientUserId, title: "New designer message", body: `${designer.name} sent you a message.`, kind: "message" });
    if (!isDesigner && designer.userId) await db.insert(notifications).values({ userId: designer.userId, title: "New client enquiry", body: `${ctx.user.name || "A client"} sent a message.`, kind: "message" });
    return { success: true };
  }),
});

const reviewRouter = router({
  mine: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb(); if (!db) return [];
    const client = await clientProfileForUser(db, ctx.user.id); const clientIds = client ? await accessibleClientUserIds(db, client) : [ctx.user.id];
    return db.select().from(reviews).where(inArray(reviews.clientUserId, clientIds)).orderBy(desc(reviews.createdAt)).limit(200);
  }),
  submit: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), rating: z.number().int().min(1).max(5), quality: z.number().int().min(1).max(5), communication: z.number().int().min(1).max(5), timeliness: z.number().int().min(1).max(5), professionalism: z.number().int().min(1).max(5), value: z.number().int().min(1).max(5), reviewText: z.string().min(10).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const client = await clientProfileForUser(db, ctx.user.id);
    const clientIds = client ? await accessibleClientUserIds(db, client) : [ctx.user.id];
    const [order] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), inArray(orders.clientUserId, clientIds))).limit(1);
    if (!order || order.status !== "completed") throw new Error("Only clients with completed orders may submit a review");
    const [existing] = await db.select().from(reviews).where(eq(reviews.orderId, order.id)).limit(1);
    if (existing) throw new Error("A review has already been submitted for this order");
    const previous = await db.select().from(reviews).where(eq(reviews.designerId, order.designerId));
    await db.insert(reviews).values({ orderId: order.id, clientUserId: ctx.user.id, clientName: ctx.user.name || "Mono Design client", designerId: order.designerId, rating: input.rating, quality: input.quality, communication: input.communication, timeliness: input.timeliness, professionalism: input.professionalism, value: input.value, reviewText: input.reviewText });
    const reviewCount = previous.length + 1;
    const average = Math.round((previous.reduce((sum, row) => sum + row.rating, input.rating)) / reviewCount * 10);
    await db.update(designerProfiles).set({ ratingTenths: average, reviewCount }).where(eq(designerProfiles.id, order.designerId));
    const [designer] = await db.select().from(designerProfiles).where(eq(designerProfiles.id, order.designerId)).limit(1);
    if (designer?.userId) await db.insert(notifications).values({ userId: designer.userId, title: "A client left a review", body: `${ctx.user.name || "A client"} reviewed your completed project.`, kind: "review" });
    return { success: true };
  }),
});

const reportRouter = router({
  designer: protectedProcedure.input(z.object({ designerId: z.number().int().positive(), reason: z.string().min(20).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new Error("Database is not available");
    const [designer] = await db.select().from(designerProfiles).where(and(eq(designerProfiles.id, input.designerId), eq(designerProfiles.status, "approved"))).limit(1);
    if (!designer) throw new Error("Designer not found");
    const [existing] = await db.select().from(designerReports).where(and(eq(designerReports.designerId, designer.id), eq(designerReports.reporterUserId, ctx.user.id), eq(designerReports.status, "open"))).limit(1);
    if (existing) throw new Error("You already have an open report for this profile");
    await db.insert(designerReports).values({ designerId: designer.id, reporterUserId: ctx.user.id, reason: input.reason });
    return { success: true };
  }),
  review: protectedProcedure.input(z.object({ reviewId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new Error("Database is not available");
    const [review] = await db.select().from(reviews).where(eq(reviews.id, input.reviewId)).limit(1);
    if (!review) throw new Error("Review not found");
    if (review.clientUserId === ctx.user.id) throw new Error("You cannot report your own review");
    await db.update(reviews).set({ isReported: true }).where(eq(reviews.id, review.id));
    return { success: true };
  }),
});

const adminRouter = router({
  summary: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { users: 0, designers: 0, services: 0, orders: 0, projects: 0, revenueCents: 0, reviews: 0 };
    const [userCount, designerCount, serviceCount, orderCount, projectCount, reviewCount, paid] = await Promise.all([
      db.select({ total: count() }).from(users), db.select({ total: count() }).from(designerProfiles),
      db.select({ total: count() }).from(services), db.select({ total: count() }).from(orders),
      db.select({ total: count() }).from(projects), db.select({ total: count() }).from(reviews),
      db.select().from(payments).where(eq(payments.status, "mock_completed")),
    ]);
    return { users: userCount[0]?.total ?? 0, designers: designerCount[0]?.total ?? 0, services: serviceCount[0]?.total ?? 0, orders: orderCount[0]?.total ?? 0, projects: projectCount[0]?.total ?? 0, revenueCents: paid.reduce((sum, row) => sum + row.amountCents, 0), reviews: reviewCount[0]?.total ?? 0 };
  }),
  analytics: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { activeClients: 0, activeDesigners: 0, subscriptionRevenueCents: 0, serviceSalesCents: 0, completedProjects: 0, averageRating: 0, monthlyRevenue: [], popularCategories: [], mostViewedDesigners: [], conversionRate: 0 };
    const [clients, designers, servicesRows, ordersRows, projectsRows, reviewRows, paymentRows, views, categoryRows] = await Promise.all([
      db.select().from(clientProfiles), db.select().from(designerProfiles), db.select().from(services), db.select().from(orders),
      db.select().from(projects), db.select().from(reviews).where(eq(reviews.isReported, false)), db.select().from(payments),
      db.select().from(listingViews), db.select().from(categories),
    ]);
    const paid = paymentRows.filter(item => item.status === "mock_completed");
    const subscriptionRevenueCents = paid.filter(item => item.subscriptionId !== null).reduce((sum, item) => sum + item.amountCents, 0);
    const serviceSalesCents = paid.filter(item => item.orderId !== null).reduce((sum, item) => sum + item.amountCents, 0);
    const lastSix = Array.from({ length: 6 }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (5 - index)); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; });
    const monthlyRevenue = lastSix.map(month => ({ month, revenueCents: paid.filter(item => `${item.createdAt.getFullYear()}-${String(item.createdAt.getMonth() + 1).padStart(2, "0")}` === month).reduce((sum, item) => sum + item.amountCents, 0) }));
    const serviceById = new Map(servicesRows.map(item => [item.id, item])); const categoryById = new Map(categoryRows.map(item => [item.id, item.name]));
    const categoryTotals = new Map<string, number>();
    for (const order of ordersRows) { const service = order.serviceId ? serviceById.get(order.serviceId) : undefined; const name = service?.categoryId ? categoryById.get(service.categoryId) || "Other" : "Custom projects"; categoryTotals.set(name, (categoryTotals.get(name) || 0) + order.amountCents); }
    const viewsByDesigner = new Map<number, number>(); for (const view of views) if (view.designerId) viewsByDesigner.set(view.designerId, (viewsByDesigner.get(view.designerId) || 0) + 1);
    const designerById = new Map(designers.map(item => [item.id, item]));
    const mostViewedDesigners = [...viewsByDesigner].map(([id, total]) => ({ id, name: designerById.get(id)?.name || "Designer", slug: designerById.get(id)?.slug || "", views: total })).sort((a, b) => b.views - a.views).slice(0, 8);
    const serviceViews = views.filter(item => item.serviceId !== null).length; const serviceOrders = ordersRows.filter(item => item.serviceId !== null).length;
    return { activeClients: clients.filter(item => item.userId !== null).length, activeDesigners: designers.filter(item => item.status === "approved" && item.userId !== null).length, subscriptionRevenueCents, serviceSalesCents, completedProjects: projectsRows.filter(item => item.status === "completed").length, averageRating: reviewRows.length ? Math.round(reviewRows.reduce((sum, item) => sum + item.rating, 0) / reviewRows.length * 10) / 10 : 0, monthlyRevenue, popularCategories: [...categoryTotals].map(([name, revenueCents]) => ({ name, revenueCents })).sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 8), mostViewedDesigners, conversionRate: serviceViews ? Math.round(serviceOrders / serviceViews * 1000) / 10 : 0 };
  }),
  subscriptions: adminProcedure.query(async () => { const db = await getDb(); if (!db) return []; const [rows, planRows, userRows] = await Promise.all([db.select().from(subscriptions).orderBy(desc(subscriptions.startedAt)).limit(500), db.select().from(subscriptionPlans), db.select({ id: users.id, name: users.name, email: users.email }).from(users)]); return rows.map(item => ({ ...item, plan: planRows.find(plan => plan.id === item.planId) || null, user: userRows.find(user => user.id === item.userId) || null })); }),
  disputes: adminProcedure.query(async () => { const db = await getDb(); if (!db) return []; const [rows, orderRows, userRows] = await Promise.all([db.select().from(disputes).orderBy(desc(disputes.createdAt)).limit(200), db.select().from(orders), db.select({ id: users.id, name: users.name, email: users.email }).from(users)]); return rows.map(item => ({ ...item, order: orderRows.find(order => order.id === item.orderId) || null, openedByUser: userRows.find(user => user.id === item.openedBy) || null })); }),
  reports: adminProcedure.query(async () => { const db = await getDb(); if (!db) return []; const [rows, designerRows, userRows] = await Promise.all([db.select().from(designerReports).orderBy(desc(designerReports.createdAt)).limit(200), db.select().from(designerProfiles), db.select({ id: users.id, name: users.name, email: users.email }).from(users)]); return rows.map(item => ({ ...item, designer: designerRows.find(designer => designer.id === item.designerId) || null, reporter: userRows.find(user => user.id === item.reporterUserId) || null })); }),
  designers: adminProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(designerProfiles).orderBy(desc(designerProfiles.createdAt)) : []; }),
  services: adminProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(services).orderBy(desc(services.createdAt)) : []; }),
  orders: adminProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(orders).orderBy(desc(orders.createdAt)).limit(200) : []; }),
  reviews: adminProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(reviews).orderBy(desc(reviews.createdAt)).limit(200) : []; }),
  payments: adminProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(payments).orderBy(desc(payments.createdAt)).limit(200) : []; }),
  portfolios: adminProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(portfolioProjects).orderBy(desc(portfolioProjects.createdAt)).limit(200) : []; }),
  categories: adminProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(categories).orderBy(categories.name) : []; }),
  users: adminProcedure.query(async () => { const db = await getDb(); return db ? db.select({ id: users.id, name: users.name, email: users.email, role: users.role, marketplaceRole: users.marketplaceRole, accountStatus: users.accountStatus, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(100) : []; }),
  setUserStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["active", "suspended"]) })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); if (input.id === ctx.user.id) throw new Error("You cannot change the status of your own administrator account"); const [target] = await db.select().from(users).where(eq(users.id, input.id)).limit(1); if (!target || target.role === "admin") throw new Error("Platform administrator access cannot be changed here"); await db.update(users).set({ accountStatus: input.status }).where(eq(users.id, target.id)); if (target.marketplaceRole === "designer") { const [designer] = await db.select().from(designerProfiles).where(eq(designerProfiles.userId, target.id)).limit(1); if (designer) await db.update(designerProfiles).set({ status: input.status === "suspended" ? "suspended" : designer.status === "suspended" ? "pending" : designer.status, verified: input.status === "suspended" ? false : designer.status === "approved" }).where(eq(designerProfiles.id, designer.id)); } return { success: true }; }),
  setDesignerStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["pending", "approved", "suspended"]) })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); await db.update(designerProfiles).set({ status: input.status, verified: input.status === "approved" }).where(eq(designerProfiles.id, input.id)); return { success: true }; }),
  setServiceStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["pending", "published", "paused", "removed"]) })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); await db.update(services).set({ status: input.status }).where(eq(services.id, input.id)); return { success: true }; }),
  setPortfolioStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["draft", "published", "reported"]) })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); await db.update(portfolioProjects).set({ status: input.status }).where(eq(portfolioProjects.id, input.id)); return { success: true }; }),
  removeReview: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); const [review] = await db.select().from(reviews).where(eq(reviews.id, input.id)).limit(1); if (!review) throw new Error("Review not found"); await db.delete(reviews).where(eq(reviews.id, review.id)); const remaining = await db.select().from(reviews).where(eq(reviews.designerId, review.designerId)); const average = remaining.length ? Math.round(remaining.reduce((sum, row) => sum + row.rating, 0) / remaining.length * 10) : 0; await db.update(designerProfiles).set({ ratingTenths: average, reviewCount: remaining.length }).where(eq(designerProfiles.id, review.designerId)); return { success: true }; }),
  saveCategory: adminProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().min(2).max(100), slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/), description: z.string().max(1000).optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); const values = { name: input.name, slug: input.slug, description: input.description || null }; if (input.id) await db.update(categories).set(values).where(eq(categories.id, input.id)); else await db.insert(categories).values(values); return { success: true }; }),
  removeCategory: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); await db.delete(categories).where(eq(categories.id, input.id)); return { success: true }; }),
  updatePlan: adminProcedure.input(z.object({ code: z.enum(["BASIC", "BUSINESS", "AGENCY"]), monthlyPriceCents: money, annualPriceCents: money, features: z.array(z.string().min(1).max(200)).max(40), isActive: z.boolean().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); await db.update(subscriptionPlans).set({ monthlyPriceCents: input.monthlyPriceCents, annualPriceCents: input.annualPriceCents, features: JSON.stringify(input.features), ...(input.isActive === undefined ? {} : { isActive: input.isActive }) }).where(eq(subscriptionPlans.code, input.code)); return { success: true }; }),
  updatePaymentStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["mock_completed", "pending", "failed", "refunded"]) })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); await db.update(payments).set({ status: input.status }).where(eq(payments.id, input.id)); if (input.status === "refunded") { const [payment] = await db.select().from(payments).where(eq(payments.id, input.id)).limit(1); if (payment?.orderId) await db.update(orders).set({ paymentStatus: "refunded" }).where(eq(orders.id, payment.orderId)); } return { success: true }; }),
  updateDispute: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["resolved", "dismissed"]), adminNote: z.string().min(3).max(2000) })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); const [record] = await db.select().from(disputes).where(eq(disputes.id, input.id)).limit(1); if (!record) throw new Error("Dispute not found"); await db.update(disputes).set({ status: input.status, adminNote: input.adminNote }).where(eq(disputes.id, input.id)); const [order] = await db.select().from(orders).where(eq(orders.id, record.orderId)).limit(1); const [designer] = order ? await db.select().from(designerProfiles).where(eq(designerProfiles.id, order.designerId)).limit(1) : []; const recipients = [...new Set([record.openedBy, order?.clientUserId, designer?.userId].filter((id): id is number => typeof id === "number"))]; for (const userId of recipients) await db.insert(notifications).values({ userId, title: "Order dispute updated", body: `Mono marked dispute #${record.id} ${input.status}.`, kind: "dispute" }); return { success: true }; }),
  updateDesignerReport: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["resolved", "dismissed"]), adminNote: z.string().max(2000).optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); await db.update(designerReports).set({ status: input.status, adminNote: input.adminNote || null }).where(eq(designerReports.id, input.id)); return { success: true }; }),
  setReviewReported: adminProcedure.input(z.object({ id: z.number().int().positive(), isReported: z.boolean() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("Database is not available"); await db.update(reviews).set({ isReported: input.isReported }).where(eq(reviews.id, input.id)); return { success: true }; }),
});

const projectRouter = router({
  files: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!project) throw new Error("Project not found");
    const profile = await designerProfileForUser(ctx.user.id);
    const client = profile ? undefined : await clientProfileForUser(db, ctx.user.id);
    const clientIds = client ? await accessibleClientUserIds(db, client) : [ctx.user.id];
    if (ctx.user.role !== "admin" && !clientIds.includes(project.clientUserId || -1) && profile?.id !== project.designerId) throw new Error("You do not have access to this project");
    return db.select().from(projectFiles).where(eq(projectFiles.projectId, project.id)).orderBy(desc(projectFiles.createdAt));
  }),
});

const uploadRouter = router({
  upload: protectedProcedure.input(z.object({ fileName: z.string().min(1).max(240), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), base64: z.string().min(16).max(12_000_000), scope: z.enum(["portfolio", "profile", "project", "enquiry", "quote"]), projectId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const profile = await designerProfileForUser(ctx.user.id);
    if (["portfolio", "profile"].includes(input.scope) && !profile) throw new Error("A designer profile is required for this upload");
    if (["enquiry", "quote"].includes(input.scope)) {
      const client = await clientProfileForUser(db, ctx.user.id);
      if (!client || profile?.userId === ctx.user.id) throw new Error("A client workspace is required for reference-file uploads");
    }
    if (input.scope === "project" && !input.projectId) throw new Error("Choose a project for this file");
    if (input.scope !== "project" && input.projectId) throw new Error("Project uploads require the project upload scope");
    let projectId: number | null = null;
    if (input.scope === "project" && input.projectId) {
      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
      if (!project) throw new Error("Project not found");
      const client = profile ? undefined : await clientProfileForUser(db, ctx.user.id);
      const clientIds = client ? await accessibleClientUserIds(db, client) : [ctx.user.id];
      if (ctx.user.role !== "admin" && !clientIds.includes(project.clientUserId || -1) && profile?.id !== project.designerId) throw new Error("You do not have access to this project");
      projectId = project.id;
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) throw new Error("File encoding is invalid");
    const bytes = Buffer.from(input.base64, "base64");
    if (!bytes.length || bytes.length > 8 * 1024 * 1024 || bytes.toString("base64").replace(/=+$/, "") !== input.base64.replace(/=+$/, "")) throw new Error("File must be valid base64 and no larger than 8 MB");
    const signatures: Record<string, (buffer: Buffer) => boolean> = {
      "image/jpeg": buffer => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
      "image/png": buffer => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      "image/webp": buffer => buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP",
      "application/pdf": buffer => buffer.toString("ascii", 0, 5) === "%PDF-",
    };
    if (["portfolio", "profile"].includes(input.scope) && input.contentType === "application/pdf") throw new Error("Profile and portfolio uploads must be images");
    if (!signatures[input.contentType](bytes)) throw new Error("The file content does not match its declared type");
    const extension = input.contentType === "image/jpeg" ? "jpg" : input.contentType.split("/")[1];
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || `asset.${extension}`;
    const key = `mono/${input.scope}/${ctx.user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
    const stored = await storagePut(key, bytes, input.contentType);
    await db.insert(projectFiles).values({ projectId, uploadedBy: ctx.user.id, objectKey: stored.key, url: stored.url, fileName: input.fileName, contentType: input.contentType, byteSize: bytes.length });
    return { url: stored.url, key: stored.key, fileName: input.fileName, contentType: input.contentType, byteSize: bytes.length };
  }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  marketplace: publicRouter,
  account: accountRouter,
  favorites: favoriteRouter,
  designer: designerRouter,
  orders: orderRouter,
  quotes: quoteRouter,
  messages: messageRouter,
  reviews: reviewRouter,
  reports: reportRouter,
  projects: projectRouter,
  uploads: uploadRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
