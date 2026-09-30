import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/** Manus OAuth identity table. `role` is the platform administrator flag; marketplace roles are separate. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  marketplaceRole: mysqlEnum("marketplaceRole", ["client", "business", "agency", "designer"]).default("client").notNull(),
  accountStatus: mysqlEnum("accountStatus", ["active", "suspended"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const skills = mysqlTable("skills", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
});

export const seedRuns = mysqlTable("seed_runs", {
  id: int("id").autoincrement().primaryKey(),
  seedKey: varchar("seedKey", { length: 80 }).notNull().unique(),
  completedAt: timestamp("completedAt").defaultNow().notNull(),
});

export const clientProfiles = mysqlTable("client_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  clientType: mysqlEnum("clientType", ["individual", "business", "agency"]).notNull(),
  companyName: varchar("companyName", { length: 180 }),
  industry: varchar("industry", { length: 120 }),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const clientMembers = mysqlTable("client_members", {
  id: int("id").autoincrement().primaryKey(),
  clientProfileId: int("clientProfileId").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ uniquePair: uniqueIndex("client_members_pair_unique").on(table.clientProfileId, table.userId) }));

export const agencyClients = mysqlTable("agency_clients", {
  id: int("id").autoincrement().primaryKey(),
  agencyProfileId: int("agencyProfileId").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 180 }).notNull(),
  companyName: varchar("companyName", { length: 180 }),
  industry: varchar("industry", { length: 120 }),
  contactName: varchar("contactName", { length: 160 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ agencyIndex: index("agency_clients_agency_idx").on(table.agencyProfileId) }));

export const designerProfiles = mysqlTable("designer_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id, { onDelete: "set null" }),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  location: varchar("location", { length: 160 }).notNull(),
  bio: text("bio").notNull(),
  yearsExperience: int("yearsExperience").default(1).notNull(),
  hourlyRateCents: int("hourlyRateCents").default(5000).notNull(),
  ratingTenths: int("ratingTenths").default(48).notNull(),
  reviewCount: int("reviewCount").default(0).notNull(),
  completedProjects: int("completedProjects").default(0).notNull(),
  available: boolean("available").default(true).notNull(),
  verified: boolean("verified").default(false).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "suspended"]).default("approved").notNull(),
  avatarUrl: varchar("avatarUrl", { length: 600 }),
  skills: text("skills").notNull(),
  categories: text("categories").notNull(),
  tools: text("tools").notNull(),
  languages: text("languages").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ slugUnique: uniqueIndex("designer_profiles_slug_unique").on(table.slug), userIndex: index("designer_profiles_user_idx").on(table.userId) }));

export const designerSkills = mysqlTable("designer_skills", {
  id: int("id").autoincrement().primaryKey(),
  designerId: int("designerId").notNull().references(() => designerProfiles.id, { onDelete: "cascade" }),
  skillId: int("skillId").notNull().references(() => skills.id, { onDelete: "cascade" }),
}, table => ({ uniquePair: uniqueIndex("designer_skills_pair_unique").on(table.designerId, table.skillId) }));

export const portfolioProjects = mysqlTable("portfolio_projects", {
  id: int("id").autoincrement().primaryKey(),
  designerId: int("designerId").notNull().references(() => designerProfiles.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  description: text("description").notNull(),
  imageUrl: varchar("imageUrl", { length: 700 }).notNull(),
  images: text("images"),
  videoUrl: varchar("videoUrl", { length: 700 }),
  skills: text("skills"),
  projectOutcome: text("projectOutcome"),
  tools: text("tools").notNull(),
  projectType: varchar("projectType", { length: 120 }).notNull(),
  status: mysqlEnum("status", ["draft", "published", "reported"]).default("published").notNull(),
  completedAt: timestamp("completedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
}, table => ({ designerIndex: index("portfolio_designer_idx").on(table.designerId) }));

export const services = mysqlTable("services", {
  id: int("id").autoincrement().primaryKey(),
  designerId: int("designerId").notNull().references(() => designerProfiles.id, { onDelete: "cascade" }),
  categoryId: int("categoryId").references(() => categories.id, { onDelete: "set null" }),
  title: varchar("title", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull(),
  description: text("description").notNull(),
  requirements: text("requirements"),
  addOns: text("addOns"),
  priceCents: int("priceCents").notNull(),
  deliveryDays: int("deliveryDays").default(5).notNull(),
  revisions: int("revisions").default(2).notNull(),
  deliverables: text("deliverables").notNull(),
  imageUrl: varchar("imageUrl", { length: 700 }).notNull(),
  tags: text("tags").notNull(),
  status: mysqlEnum("status", ["pending", "published", "paused", "removed"]).default("published").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ designerIndex: index("services_designer_idx").on(table.designerId), slugUnique: uniqueIndex("services_slug_unique").on(table.slug) }));

export const servicePackages = mysqlTable("service_packages", {
  id: int("id").autoincrement().primaryKey(),
  serviceId: int("serviceId").notNull().references(() => services.id, { onDelete: "cascade" }),
  name: mysqlEnum("name", ["Basic", "Standard", "Premium"]).notNull(),
  priceCents: int("priceCents").notNull(),
  deliveryDays: int("deliveryDays").notNull(),
  revisions: int("revisions").notNull(),
  deliverables: text("deliverables").notNull(),
});

export const subscriptionPlans = mysqlTable("subscription_plans", {
  id: int("id").autoincrement().primaryKey(),
  code: mysqlEnum("code", ["BASIC", "BUSINESS", "AGENCY"]).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  audience: varchar("audience", { length: 120 }).notNull(),
  monthlyPriceCents: int("monthlyPriceCents").notNull(),
  annualPriceCents: int("annualPriceCents").notNull(),
  features: text("features").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
});

export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id, { onDelete: "set null" }),
  demoClientName: varchar("demoClientName", { length: 160 }),
  planId: int("planId").notNull().references(() => subscriptionPlans.id),
  status: mysqlEnum("status", ["active", "trialing", "cancelled", "expired"]).default("active").notNull(),
  billingCycle: mysqlEnum("billingCycle", ["monthly", "annual"]).default("monthly").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  renewsAt: timestamp("renewsAt"),
});

export const favorites = mysqlTable("favorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  designerId: int("designerId").notNull().references(() => designerProfiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ uniquePair: uniqueIndex("favorites_user_designer_unique").on(table.userId, table.designerId) }));

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  clientUserId: int("clientUserId").references(() => users.id, { onDelete: "set null" }),
  clientName: varchar("clientName", { length: 160 }).notNull(),
  designerId: int("designerId").notNull().references(() => designerProfiles.id),
  serviceId: int("serviceId").references(() => services.id, { onDelete: "set null" }),
  packageName: varchar("packageName", { length: 32 }).default("Standard").notNull(),
  projectName: varchar("projectName", { length: 180 }).notNull(),
  amountCents: int("amountCents").notNull(),
  status: mysqlEnum("status", ["placed", "confirmed", "requirements", "in_progress", "client_review", "revision", "final_delivery", "completed", "cancelled"]).default("placed").notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["mock_pending", "mock_paid", "failed", "refunded"]).default("mock_pending").notNull(),
  requirements: text("requirements"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ clientIndex: index("orders_client_idx").on(table.clientUserId), designerIndex: index("orders_designer_idx").on(table.designerId) }));

export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id, { onDelete: "cascade" }),
  serviceId: int("serviceId").references(() => services.id, { onDelete: "set null" }),
  designerId: int("designerId").notNull().references(() => designerProfiles.id),
  title: varchar("title", { length: 180 }).notNull(),
  packageName: varchar("packageName", { length: 32 }).notNull(),
  addOns: text("addOns"),
  quantity: int("quantity").default(1).notNull(),
  unitPriceCents: int("unitPriceCents").notNull(),
});

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").references(() => orders.id, { onDelete: "set null" }),
  clientUserId: int("clientUserId").references(() => users.id, { onDelete: "set null" }),
  designerId: int("designerId").notNull().references(() => designerProfiles.id),
  agencyClientId: int("agencyClientId").references(() => agencyClients.id, { onDelete: "set null" }),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description").notNull(),
  status: mysqlEnum("status", ["placed", "confirmed", "requirements", "in_progress", "client_review", "revision", "final_delivery", "completed", "cancelled"]).default("placed").notNull(),
  deadline: timestamp("deadline"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, table => ({ clientIndex: index("projects_client_idx").on(table.clientUserId), designerIndex: index("projects_designer_idx").on(table.designerId) }));

export const disputes = mysqlTable("disputes", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id, { onDelete: "cascade" }),
  openedBy: int("openedBy").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  status: mysqlEnum("status", ["open", "resolved", "dismissed"]).default("open").notNull(),
  adminNote: text("adminNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ orderIndex: index("disputes_order_idx").on(table.orderId) }));

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").references(() => projects.id, { onDelete: "set null" }),
  clientUserId: int("clientUserId").references(() => users.id, { onDelete: "set null" }),
  designerId: int("designerId").notNull().references(() => designerProfiles.id),
  senderUserId: int("senderUserId").references(() => users.id, { onDelete: "set null" }),
  senderName: varchar("senderName", { length: 160 }).notNull(),
  body: text("body").notNull(),
  attachments: text("attachments"),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ projectIndex: index("messages_project_idx").on(table.projectId), clientIndex: index("messages_client_idx").on(table.clientUserId) }));

export const quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  clientUserId: int("clientUserId").references(() => users.id, { onDelete: "set null" }),
  designerId: int("designerId").notNull().references(() => designerProfiles.id),
  projectName: varchar("projectName", { length: 180 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  description: text("description").notNull(),
  targetAudience: varchar("targetAudience", { length: 180 }),
  deliverables: text("deliverables"),
  budgetRange: varchar("budgetRange", { length: 80 }),
  requestedDeadline: timestamp("requestedDeadline"),
  referenceFiles: text("referenceFiles"),
  amountCents: int("amountCents"),
  deliveryDays: int("deliveryDays"),
  revisions: int("revisions"),
  terms: text("terms"),
  status: mysqlEnum("status", ["requested", "quoted", "accepted", "declined", "expired"]).default("requested").notNull(),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  clientUserId: int("clientUserId").references(() => users.id, { onDelete: "set null" }),
  clientName: varchar("clientName", { length: 160 }).notNull(),
  designerId: int("designerId").notNull().references(() => designerProfiles.id),
  rating: int("rating").notNull(),
  quality: int("quality").notNull(),
  communication: int("communication").notNull(),
  timeliness: int("timeliness").notNull(),
  professionalism: int("professionalism").notNull(),
  value: int("value").default(5).notNull(),
  isReported: boolean("isReported").default(false).notNull(),
  reviewText: text("reviewText").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ orderUnique: uniqueIndex("reviews_order_unique").on(table.orderId), designerIndex: index("reviews_designer_idx").on(table.designerId) }));

export const designerReports = mysqlTable("designer_reports", {
  id: int("id").autoincrement().primaryKey(),
  designerId: int("designerId").notNull().references(() => designerProfiles.id, { onDelete: "cascade" }),
  reporterUserId: int("reporterUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: mysqlEnum("status", ["open", "resolved", "dismissed"]).default("open").notNull(),
  adminNote: text("adminNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ designerIndex: index("designer_reports_designer_idx").on(table.designerId), reporterIndex: index("designer_reports_reporter_idx").on(table.reporterUserId) }));

export const listingViews = mysqlTable("listing_views", {
  id: int("id").autoincrement().primaryKey(),
  designerId: int("designerId").references(() => designerProfiles.id, { onDelete: "cascade" }),
  serviceId: int("serviceId").references(() => services.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ designerIndex: index("listing_views_designer_idx").on(table.designerId), serviceIndex: index("listing_views_service_idx").on(table.serviceId), createdIndex: index("listing_views_created_idx").on(table.createdAt) }));

export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id, { onDelete: "set null" }),
  orderId: int("orderId").references(() => orders.id, { onDelete: "set null" }),
  subscriptionId: int("subscriptionId").references(() => subscriptions.id, { onDelete: "set null" }),
  amountCents: int("amountCents").notNull(),
  status: mysqlEnum("status", ["mock_completed", "pending", "failed", "refunded"]).default("mock_completed").notNull(),
  provider: varchar("provider", { length: 40 }).default("mock").notNull(),
  transactionReference: varchar("transactionReference", { length: 120 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  kind: varchar("kind", { length: 60 }).default("update").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const projectFiles = mysqlTable("project_files", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").references(() => projects.id, { onDelete: "set null" }),
  uploadedBy: int("uploadedBy").notNull().references(() => users.id),
  objectKey: varchar("objectKey", { length: 400 }).notNull(),
  url: varchar("url", { length: 700 }).notNull(),
  fileName: varchar("fileName", { length: 240 }).notNull(),
  contentType: varchar("contentType", { length: 100 }).notNull(),
  byteSize: int("byteSize").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
