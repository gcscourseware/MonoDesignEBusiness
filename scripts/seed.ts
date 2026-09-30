import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import {
  categories, clientProfiles, designerProfiles, designerSkills, favorites, messages, orderItems, orders, payments,
  portfolioProjects, projects, quotes, reviews, seedRuns, services, servicePackages, skills, subscriptionPlans, subscriptions,
} from "../drizzle/schema";
import { demoAgencies, demoCategories, demoClients, demoDesigners, demoPlans, demoPortfolio, demoReviews, demoServices } from "../shared/demo-data";

async function seed() {
  const db = await getDb();
  if (!db) throw new Error("Managed database is not configured");

  try {
    const seededStats = await db.transaction(async tx => {
      const [existingRun] = await tx.select().from(seedRuns).where(eq(seedRuns.seedKey, "mono-demo-v1")).limit(1);
      if (existingRun) return null;

      await tx.insert(categories).values(demoCategories.map(name => ({
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        description: `Professional ${name.toLowerCase()} services.`,
      })));
      await tx.insert(subscriptionPlans).values(demoPlans.map(plan => ({ ...plan, code: plan.code as "BASIC" | "BUSINESS" | "AGENCY", features: JSON.stringify(plan.features) })));
      await tx.insert(designerProfiles).values(demoDesigners.map(designer => ({
        userId: null,
        name: designer.name,
        slug: designer.slug,
        title: designer.title,
        location: designer.location,
        bio: designer.bio,
        yearsExperience: designer.yearsExperience,
        hourlyRateCents: designer.hourlyRateCents,
        ratingTenths: designer.ratingTenths,
        reviewCount: designer.reviewCount,
        completedProjects: designer.completedProjects,
        available: true,
        verified: true,
        status: "approved" as const,
        avatarUrl: designer.avatarUrl,
        skills: JSON.stringify(designer.skills),
        categories: JSON.stringify(designer.categories),
        tools: JSON.stringify(designer.tools),
        languages: JSON.stringify(designer.languages),
      })));

      const designerRows = await tx.select().from(designerProfiles);
      const categoryRows = await tx.select().from(categories);
      const designerBySlug = new Map(designerRows.map(row => [row.slug, row]));
      const categoryByName = new Map(categoryRows.map(row => [row.name, row]));
      const skillNames = [...new Set(demoDesigners.flatMap(designer => designer.skills))];
      await tx.insert(skills).values(skillNames.map(name => ({ name })));
      const skillRows = await tx.select().from(skills);
      const skillByName = new Map(skillRows.map(row => [row.name, row]));
      await tx.insert(designerSkills).values(demoDesigners.flatMap(designer =>
        designer.skills.map(name => ({ designerId: designerBySlug.get(designer.slug)!.id, skillId: skillByName.get(name)!.id })),
      ));

      await tx.insert(portfolioProjects).values(demoPortfolio.map((item, sortOrder) => ({
        designerId: designerBySlug.get(item.designerSlug)!.id,
        title: item.title,
        category: item.category,
        description: item.description,
        imageUrl: item.imageUrl,
        tools: item.tools,
        projectType: item.projectType,
        status: "published" as const,
        sortOrder,
      })));
      await tx.insert(services).values(demoServices.map(item => ({
        designerId: designerBySlug.get(item.designerSlug)!.id,
        categoryId: categoryByName.get(item.category)?.id,
        title: item.title,
        slug: item.slug,
        description: item.description,
        priceCents: item.priceCents,
        deliveryDays: item.deliveryDays,
        revisions: item.revisions,
        deliverables: JSON.stringify(item.deliverables),
        imageUrl: item.imageUrl,
        tags: JSON.stringify(item.tags),
        status: "published" as const,
      })));
      const serviceRows = await tx.select().from(services);
      await tx.insert(servicePackages).values(serviceRows.flatMap(service => [
        { serviceId: service.id, name: "Basic" as const, priceCents: service.priceCents, deliveryDays: service.deliveryDays + 2, revisions: 1, deliverables: "One clear direction, final export, one revision" },
        { serviceId: service.id, name: "Standard" as const, priceCents: service.priceCents + 8500, deliveryDays: service.deliveryDays, revisions: service.revisions, deliverables: "Three directions, source files, two revisions" },
        { serviceId: service.id, name: "Premium" as const, priceCents: service.priceCents + 21000, deliveryDays: Math.max(3, service.deliveryDays - 1), revisions: 4, deliverables: "Full system, source files, priority delivery, four revisions" },
      ]));

      const clientSeedRows: Array<typeof clientProfiles.$inferInsert> = [
        ...demoClients.map((displayName, index) => ({
        userId: null,
        displayName,
        clientType: index % 3 === 0 ? "business" as const : "individual" as const,
        companyName: index % 3 === 0 ? ["Olive & Oak", "Good Space Co.", "Common Thread"][index % 3] : null,
        industry: ["Wellness", "Consumer goods", "Culture", "Technology"][index % 4],
        description: "A fictional Mono Design community client profile.",
        })),
        ...demoAgencies.map(displayName => ({
        userId: null,
        displayName,
        clientType: "agency" as const,
        companyName: displayName,
        industry: "Creative services",
        description: "A fictional agency workspace in the Mono Design demo.",
        })),
      ];
      await tx.insert(clientProfiles).values(clientSeedRows);

      const plans = await tx.select().from(subscriptionPlans);
      const planByCode = new Map(plans.map(plan => [plan.code, plan]));
      await tx.insert(subscriptions).values(demoClients.map((demoClientName, index) => ({
        userId: null,
        demoClientName,
        planId: planByCode.get(index % 4 === 0 ? "BUSINESS" : "BASIC")!.id,
        status: "active" as const,
        billingCycle: index % 2 ? "annual" as const : "monthly" as const,
        renewsAt: new Date(Date.now() + (20 + index) * 86400000),
      })).concat(demoAgencies.map(demoClientName => ({
        userId: null,
        demoClientName,
        planId: planByCode.get("AGENCY")!.id,
        status: "active" as const,
        billingCycle: "annual" as const,
        renewsAt: new Date(Date.now() + 40 * 86400000),
      }))));

      const sampleOrders = [
        { designer: "maya-chen", service: 0, client: 0, status: "completed" as const, name: "Olive & Oak visual identity" },
        { designer: "leo-moretti", service: 3, client: 1, status: "in_progress" as const, name: "Good Space product experience" },
        { designer: "amina-yusuf", service: 6, client: 2, status: "client_review" as const, name: "Field Notes social launch" },
        { designer: "theo-park", service: 9, client: 3, status: "completed" as const, name: "Stillwell packaging system" },
        { designer: "sofia-alvarez", service: 12, client: 4, status: "requirements" as const, name: "The Sunday Edit campaign" },
        { designer: "noah-williams", service: 15, client: 5, status: "completed" as const, name: "Common Thread web refresh" },
      ];
      await tx.insert(orders).values(sampleOrders.map(order => {
        const service = serviceRows[order.service];
        return {
          clientUserId: null,
          clientName: demoClients[order.client],
          designerId: designerBySlug.get(order.designer)!.id,
          serviceId: service.id,
          packageName: "Standard",
          projectName: order.name,
          amountCents: service.priceCents + 8500,
          status: order.status,
          paymentStatus: "mock_paid" as const,
          requirements: "Keep it clear, distinctive and easy for our team to use.",
        };
      }));
      const allOrders = await tx.select().from(orders);
      const sampleOrderByName = new Map(sampleOrders.map(sample => [sample.name, allOrders.find(order => order.projectName === sample.name)!]));
      await tx.insert(orderItems).values(sampleOrders.map(sample => {
        const order = sampleOrderByName.get(sample.name)!;
        const service = serviceRows[sample.service];
        return { orderId: order.id, serviceId: service.id, designerId: order.designerId, title: service.title, packageName: order.packageName, quantity: 1, unitPriceCents: order.amountCents };
      }));
      await tx.insert(projects).values(sampleOrders.map(sample => {
        const created = sampleOrderByName.get(sample.name)!;
        return {
          orderId: created.id,
          clientUserId: null,
          designerId: created.designerId,
          name: sample.name,
          description: "Demo project brief, milestones and client-designer handoff.",
          status: sample.status,
          deadline: new Date(Date.now() + 12 * 86400000),
          completedAt: sample.status === "completed" ? new Date() : null,
        };
      }));
      await tx.insert(payments).values(sampleOrders.map(sample => {
        const created = sampleOrderByName.get(sample.name)!;
        return { userId: null, orderId: created.id, amountCents: created.amountCents, status: "mock_completed" as const, provider: "mock", transactionReference: `MONO-DEMO-${created.id}` };
      }));

      const completedOrders = allOrders.filter(order => order.status === "completed");
      const reviewRecords = demoReviews.map(review => {
        const designer = designerBySlug.get(review.designerSlug)!;
        const order = completedOrders.find(item => item.designerId === designer.id);
        return order ? {
          orderId: order.id,
          clientUserId: null,
          clientName: review.clientName,
          designerId: designer.id,
          rating: review.rating,
          quality: review.rating,
          communication: review.rating,
          timeliness: review.rating,
          professionalism: review.rating,
          reviewText: review.reviewText,
        } : null;
      }).filter((review): review is NonNullable<typeof review> => review !== null);
      if (reviewRecords.length) await tx.insert(reviews).values(reviewRecords);
      const reviewsByDesigner = new Map<number, typeof reviewRecords>();
      for (const review of reviewRecords) reviewsByDesigner.set(review.designerId, [...(reviewsByDesigner.get(review.designerId) || []), review]);
      for (const [designerId, designerReviews] of reviewsByDesigner) {
        const averageTenths = Math.round(designerReviews.reduce((sum, review) => sum + review.rating, 0) / designerReviews.length * 10);
        await tx.update(designerProfiles).set({ ratingTenths: averageTenths }).where(eq(designerProfiles.id, designerId));
      }

      await tx.insert(messages).values([
        { projectId: null, clientUserId: null, designerId: designerBySlug.get("maya-chen")!.id, senderUserId: null, senderName: "Amelia Parker", body: "The direction feels right. Could we explore one more packaging variation?", isRead: false },
        { projectId: null, clientUserId: null, designerId: designerBySlug.get("leo-moretti")!.id, senderUserId: null, senderName: "Marcus Reed", body: "I have added the latest product notes to the brief.", isRead: false },
        { projectId: null, clientUserId: null, designerId: designerBySlug.get("amina-yusuf")!.id, senderUserId: null, senderName: "Nadia Hassan", body: "The launch assets are ready for a first look.", isRead: true },
      ]);
      await tx.insert(quotes).values([
        { clientUserId: null, designerId: designerBySlug.get("grace-kim")!.id, projectName: "A refreshed identity for Kindred", category: "Branding", description: "A warm identity system for a new community wellness brand.", targetAudience: "Independent founders", deliverables: "Identity, type, color, usage guide", budgetRange: "$1,000–$2,000", amountCents: 145000, deliveryDays: 18, revisions: 3, terms: "50% to begin; final files on approval.", status: "quoted" as const, expiresAt: new Date(Date.now() + 8 * 86400000) },
      ]);

      await tx.insert(seedRuns).values({ seedKey: "mono-demo-v1" });
      return { designers: designerRows.length, portfolioItems: demoPortfolio.length, services: serviceRows.length, clients: demoClients.length, agencies: demoAgencies.length, reviews: reviewRecords.length, orders: sampleOrders.length };
    });

    console.log(seededStats ? JSON.stringify(seededStats, null, 2) : "Demo marketplace data is already seeded; leaving it untouched.");
  } finally {
    await db.$client.end();
  }
}

seed().catch(error => {
  console.error("Demo seed failed", error);
  process.exitCode = 1;
});
