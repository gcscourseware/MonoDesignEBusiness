export type DemoDesigner = {
  name: string; slug: string; title: string; location: string; bio: string;
  yearsExperience: number; hourlyRateCents: number; ratingTenths: number;
  reviewCount: number; completedProjects: number; avatarUrl: string;
  skills: string[]; categories: string[]; tools: string[]; languages: string[];
};

const imageIds = [
  "photo-1523726491678-bf852e717f6a", "photo-1558655146-d09347e92766", "photo-1547658719-da2b51169166",
  "photo-1545235617-9465d2a55698", "photo-1498050108023-c5249f4df085", "photo-1500530855697-b586d89ba3ee",
  "photo-1541701494587-cb58502866ab", "photo-1549490349-8643362247b5", "photo-1561214115-f2f134cc4912",
  "photo-1579783902614-a3fb3927b6a5", "photo-1501472312651-726afe119ff1", "photo-1524758631624-e2822e304c36",
  "photo-1531058020387-3be344556be6", "photo-1550745165-9bc0b252726f", "photo-1551963831-b3b1ca40c98e",
  "photo-1559028012-481c04fa702d", "photo-1497366754035-f200968a6e72", "photo-1542744094-3a31f272c490",
  "photo-1507207611509-ec012433ff52", "photo-1556761175-b413da4baf72", "photo-1496181133206-80ce9b88a853",
  "photo-1541462608143-67571c6738dd", "photo-1581291518633-83b4ebd1d83e", "photo-1503602642458-232111445657",
  "photo-1554188248-986adbb73be4", "photo-1547826039-bfc35e0f1ea8", "photo-1513364776144-60967b0f800f",
  "photo-1519389950473-47ba0277781c", "photo-1524504388940-b1c1722653e1", "photo-1529139574466-a303027c1d8b",
];
export const demoImage = (index: number, width = 900) => `https://images.unsplash.com/${imageIds[index % imageIds.length]}?auto=format&fit=crop&w=${width}&q=85`;

export const demoDesigners: DemoDesigner[] = [
  { name: "Maya Chen", slug: "maya-chen", title: "Brand identity & art direction", location: "New York, NY", bio: "I build thoughtful visual identities for ambitious founders, culture brands and independent makers. My practice brings clarity to complex ideas through type, image and a little bit of play.", yearsExperience: 8, hourlyRateCents: 9500, ratingTenths: 49, reviewCount: 82, completedProjects: 146, avatarUrl: "https://i.pravatar.cc/240?img=47", skills: ["Branding", "Art direction", "Packaging"], categories: ["Branding", "Logo Design", "Packaging Design"], tools: ["Illustrator", "Figma", "InDesign"], languages: ["English", "Mandarin"] },
  { name: "Leo Moretti", slug: "leo-moretti", title: "Digital product & UI/UX designer", location: "Milan, Italy", bio: "I turn nuanced product problems into calm, confident digital experiences. From first principles to polished interfaces, I help early-stage teams move with intent.", yearsExperience: 7, hourlyRateCents: 11000, ratingTenths: 50, reviewCount: 64, completedProjects: 119, avatarUrl: "https://i.pravatar.cc/240?img=12", skills: ["Product design", "UI/UX", "Design systems"], categories: ["UI/UX Design", "Web Design", "Product Design"], tools: ["Figma", "Framer", "Principle"], languages: ["English", "Italian"] },
  { name: "Amina Yusuf", slug: "amina-yusuf", title: "Visual designer for modern culture", location: "London, UK", bio: "A multidisciplinary designer partnering with people building a more interesting world. I create distinctive campaign systems, expressive typography and work that travels well across screens and spaces.", yearsExperience: 6, hourlyRateCents: 7800, ratingTenths: 48, reviewCount: 51, completedProjects: 98, avatarUrl: "https://i.pravatar.cc/240?img=44", skills: ["Graphic design", "Campaigns", "Typography"], categories: ["Graphic Design", "Social Media Design", "Advertising Design"], tools: ["Photoshop", "Illustrator", "After Effects"], languages: ["English", "Arabic"] },
  { name: "Theo Park", slug: "theo-park", title: "Packaging designer & illustrator", location: "Seoul, South Korea", bio: "I help good products find their visual voice. My work spans packaging, illustration and the small details that make a customer want to pick something up.", yearsExperience: 9, hourlyRateCents: 10200, ratingTenths: 49, reviewCount: 73, completedProjects: 132, avatarUrl: "https://i.pravatar.cc/240?img=60", skills: ["Packaging", "Illustration", "Print"], categories: ["Packaging Design", "Illustration", "Print Design"], tools: ["Illustrator", "Procreate", "InDesign"], languages: ["English", "Korean"] },
  { name: "Sofia Alvarez", slug: "sofia-alvarez", title: "Social-first brand designer", location: "Mexico City, Mexico", bio: "I make brands feel like themselves everywhere they show up. Social campaigns, launch kits and flexible identity systems built for real teams and real timelines.", yearsExperience: 5, hourlyRateCents: 6800, ratingTenths: 48, reviewCount: 43, completedProjects: 87, avatarUrl: "https://i.pravatar.cc/240?img=32", skills: ["Branding", "Social media", "Motion"], categories: ["Branding", "Social Media Design", "Motion Graphics"], tools: ["Figma", "Illustrator", "CapCut"], languages: ["English", "Spanish"] },
  { name: "Noah Williams", slug: "noah-williams", title: "Web designer for growing teams", location: "Austin, TX", bio: "I design web experiences that make the next step feel obvious. My process brings together editorial storytelling, conversion thinking and practical systems your team can maintain.", yearsExperience: 11, hourlyRateCents: 12500, ratingTenths: 50, reviewCount: 106, completedProjects: 204, avatarUrl: "https://i.pravatar.cc/240?img=15", skills: ["Web design", "Landing pages", "Webflow"], categories: ["Web Design", "UI/UX Design", "Marketing Design"], tools: ["Figma", "Webflow", "Framer"], languages: ["English"] },
  { name: "Rina Patel", slug: "rina-patel", title: "Presentation designer & storyteller", location: "Toronto, Canada", bio: "I help teams make a complicated story easy to follow. From investor decks to internal strategy, I bring a sharp editorial eye and a human point of view to every slide.", yearsExperience: 8, hourlyRateCents: 8200, ratingTenths: 49, reviewCount: 58, completedProjects: 116, avatarUrl: "https://i.pravatar.cc/240?img=49", skills: ["Presentations", "Information design", "Editorial"], categories: ["Presentation Design", "Graphic Design", "Marketing Design"], tools: ["Figma", "Keynote", "PowerPoint"], languages: ["English", "Gujarati"] },
  { name: "Luca Fischer", slug: "luca-fischer", title: "Motion designer & visual systems", location: "Berlin, Germany", bio: "I create motion languages and graphic systems that bring digital products to life. I love work that sits between a clear idea and a surprising detail.", yearsExperience: 7, hourlyRateCents: 9200, ratingTenths: 48, reviewCount: 39, completedProjects: 92, avatarUrl: "https://i.pravatar.cc/240?img=11", skills: ["Motion graphics", "Animation", "Branding"], categories: ["Motion Graphics", "Video Design", "Branding"], tools: ["After Effects", "Cinema 4D", "Figma"], languages: ["English", "German"] },
  { name: "Grace Kim", slug: "grace-kim", title: "Brand strategist & identity designer", location: "Los Angeles, CA", bio: "I partner closely with founders to build brands with a point of view. The work is strategic at its core, beautifully executed and made to grow with the business.", yearsExperience: 12, hourlyRateCents: 14500, ratingTenths: 50, reviewCount: 118, completedProjects: 232, avatarUrl: "https://i.pravatar.cc/240?img=45", skills: ["Strategy", "Identity", "Naming"], categories: ["Branding", "Logo Design", "Marketing Design"], tools: ["Figma", "Illustrator", "Notion"], languages: ["English", "Korean"] },
  { name: "Idris Okafor", slug: "idris-okafor", title: "Graphic designer for good ideas", location: "Lagos, Nigeria", bio: "A graphic designer making ambitious ideas more legible, memorable and useful. I work across print, campaigns and early-stage identities with a generous collaborative process.", yearsExperience: 6, hourlyRateCents: 7200, ratingTenths: 49, reviewCount: 47, completedProjects: 103, avatarUrl: "https://i.pravatar.cc/240?img=53", skills: ["Graphic design", "Print", "Campaigns"], categories: ["Graphic Design", "Print Design", "Advertising Design"], tools: ["Photoshop", "Illustrator", "InDesign"], languages: ["English", "Yoruba"] },
];

export const demoCategories = ["Branding", "Logo Design", "Graphic Design", "UI/UX Design", "Web Design", "Social Media Design", "Advertising Design", "Packaging Design", "Print Design", "Presentation Design", "Illustration", "Motion Graphics", "Video Design", "Product Design", "Marketing Design"];
export const demoClients = ["Amelia Parker", "Marcus Reed", "Olivia Bennett", "Daniel Kim", "Nadia Hassan", "Ethan Brooks", "Chloe Martin", "Oliver James", "Priya Shah", "Mateo Cruz"];
export const demoAgencies = ["Northstar Studio", "Fieldwork Creative", "Good Form Agency"];
export const demoPlans = [
  { code: "BASIC", name: "Mono Basic", audience: "For individuals", monthlyPriceCents: 0, annualPriceCents: 0, features: ["Browse every designer", "Save your favourites", "Simple project tracking", "Email notifications"] },
  { code: "BUSINESS", name: "Mono Business", audience: "For growing teams", monthlyPriceCents: 2900, annualPriceCents: 29000, features: ["Everything in Basic", "Multiple active projects", "Priority enquiries & quotes", "Team briefs and history", "Business analytics"] },
  { code: "AGENCY", name: "Mono Agency", audience: "For creative agencies", monthlyPriceCents: 8900, annualPriceCents: 89000, features: ["Everything in Business", "Unlimited client workspaces", "Team assignments & collaboration", "Recurring service requests", "Priority designer matching", "Dedicated support"] },
];

const portfolioTitles = ["A softer kind of everyday", "Forms in motion", "Objects for slow mornings", "The good things club", "A little more color", "Open field journal"];
export const demoPortfolio = demoDesigners.flatMap((designer, designerIndex) => Array.from({ length: 3 }, (_, workIndex) => {
  const itemIndex = designerIndex * 3 + workIndex;
  const category = designer.categories[workIndex % designer.categories.length];
  return {
    designerSlug: designer.slug,
    title: portfolioTitles[itemIndex % portfolioTitles.length],
    category,
    description: `A considered ${category.toLowerCase()} project created for a growing independent brand.`,
    imageUrl: demoImage(itemIndex),
    tools: designer.tools.slice(0, 2).join(", "),
    projectType: ["Independent brand", "Small business", "Culture project"][workIndex],
  };
}));

const serviceTitles = ["Identity Starter", "Social Campaign Kit", "Brand Story & Direction", "Digital Launch System", "Packaging Essentials", "Presentation Polish"];
export const demoServices = demoDesigners.flatMap((designer, designerIndex) => Array.from({ length: 3 }, (_, serviceIndex) => {
  const serviceIndexGlobal = designerIndex * 3 + serviceIndex;
  const category = designer.categories[serviceIndex % designer.categories.length];
  const priceCents = 12500 + ((designerIndex * 7300 + serviceIndex * 5400) % 28000);
  return {
    designerSlug: designer.slug,
    title: serviceTitles[(designerIndex + serviceIndex) % serviceTitles.length],
    slug: `${designer.slug}-${serviceIndex + 1}`,
    category,
    description: `A focused ${category.toLowerCase()} package with thoughtful direction, clear deliverables and a smooth collaboration from first brief to final files.`,
    priceCents,
    deliveryDays: 4 + ((designerIndex + serviceIndex) % 8),
    revisions: 2 + (serviceIndex % 2),
    deliverables: ["Concept direction", "Polished final files", "Two rounds of revisions"],
    imageUrl: demoImage(serviceIndexGlobal + 6),
    tags: [category, "Creative", "Professional"],
  };
}));

export const demoReviews = [
  { designerSlug: "maya-chen", clientName: "Amelia Parker", rating: 5, reviewText: "Maya brought real clarity to our brand. The process felt thoughtful from the very first call, and the final system is exactly what we needed." },
  { designerSlug: "leo-moretti", clientName: "Marcus Reed", rating: 5, reviewText: "A generous collaborator and a precise designer. Our product finally feels as good to use as it is to talk about." },
  { designerSlug: "amina-yusuf", clientName: "Nadia Hassan", rating: 5, reviewText: "Amina understood the energy we were after and translated it into a campaign that felt like us." },
  { designerSlug: "theo-park", clientName: "Olivia Bennett", rating: 5, reviewText: "Beautiful work, excellent communication, and the packaging came together ahead of schedule." },
  { designerSlug: "sofia-alvarez", clientName: "Chloe Martin", rating: 4, reviewText: "Sofia made our launch feel cohesive across every channel. We loved the adaptable social kit." },
  { designerSlug: "noah-williams", clientName: "Daniel Kim", rating: 5, reviewText: "Noah made a complex site feel effortless. The handoff was clear and easy for our team to maintain." },
];
