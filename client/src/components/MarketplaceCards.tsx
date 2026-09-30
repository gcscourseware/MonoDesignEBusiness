import { ArrowUpRight, Heart, MapPin, Star } from "lucide-react";
import { Link } from "wouter";
import { useCart, formatPrice, formatRate } from "@/lib/market";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export function DesignerCard({ designer, index = 0 }: { designer: any; index?: number }) {
  const avatar = designer.avatarUrl || `https://i.pravatar.cc/240?img=${30 + index}`;
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: saved } = trpc.favorites.list.useQuery(undefined, { enabled: Boolean(user) });
  const toggleFavorite = trpc.favorites.toggle.useMutation({ onSuccess: result => { void utils.favorites.list.invalidate(); toast.success(result.saved ? "Designer saved" : "Removed from saved designers"); }, onError: error => toast.error(error.message) });
  const isSaved = Boolean(saved?.some(item => item.id === designer.id));
  return <article className="designer-card reveal-card">
    <div className="designer-card-top"><Link href={`/designer/${designer.slug}`} className="avatar-wrap"><img src={avatar} alt={designer.name} loading="lazy" /></Link><span className="verified-badge">{designer.available ? "Available" : "Booked"}</span><button className={`icon-button ${isSaved ? "saved" : ""}`} aria-label={isSaved ? `Remove ${designer.name} from saved designers` : `Save ${designer.name}`} aria-pressed={isSaved} onClick={() => user ? toggleFavorite.mutate({ designerId: designer.id }) : toast.info("Sign in to save designers", { action: { label: "Log in", onClick: () => window.location.assign("/login") } })}><Heart size={17} fill={isSaved ? "currentColor" : "none"} /></button></div>
    <Link href={`/designer/${designer.slug}`} className="designer-name">{designer.name}<ArrowUpRight size={15} /></Link>
    <p className="designer-title">{designer.title}</p><p className="designer-location"><MapPin size={13} /> {designer.location}</p><p className="designer-summary">{String(designer.bio || "Independent creative partner.").slice(0, 118)}{String(designer.bio || "").length > 118 ? "…" : ""}</p>
    <div className="tag-row">{(designer.skills || []).slice(0, 3).map((skill: string) => <span className="tag" key={skill}>{skill}</span>)}</div>
    <div className="card-meta"><span className="rating"><Star size={14} fill="currentColor" /> {Number(designer.rating ?? designer.ratingTenths / 10).toFixed(1)} <span>({designer.reviewCount})</span></span><span>from {formatRate(designer.hourlyRateCents)}</span></div><div className="designer-card-foot"><span>{designer.completedProjects || 0} projects completed</span><Link href={`/designer/${designer.slug}?contact=1`}>View & contact <ArrowUpRight size={14} /></Link></div>
  </article>;
}

export function ServiceCard({ service, designer }: { service: any; designer?: any }) {
  const cart = useCart();
  const profile = designer || service.designer || {};
  const serviceId = Number(service.id || 1);
  const onAdd = () => {
    cart.addItem({ serviceId, title: service.title, designerId: Number(profile.id || 1), designerName: profile.name || "Mono designer", imageUrl: service.imageUrl, priceCents: service.priceCents, packageName: "Standard", deliveryDays: service.deliveryDays });
    toast.success("Added to your project cart");
  };
  return <article className="service-card reveal-card"><Link href={`/service/${service.id}`} className="service-image"><img src={service.imageUrl} alt={service.title} loading="lazy" /><span>{service.category || service.tags?.[0] || "Design service"}</span></Link><div className="service-body"><div className="service-designer"><img src={profile.avatarUrl || "https://i.pravatar.cc/64?img=47"} alt="" /><span>by <strong>{profile.name || "Independent designer"}</strong></span></div><Link href={`/service/${service.id}`} className="service-title">{service.title}<ArrowUpRight size={15} /></Link><p>{service.description}</p><div className="service-meta"><span>Delivery in {service.deliveryDays} days</span><span>★ {Number(profile.rating ?? 4.9).toFixed(1)}</span></div><div className="service-buy"><span>from <strong>{formatPrice(service.priceCents)}</strong></span><button className="btn btn-light btn-small" onClick={onAdd}>Add to cart <span className="plus-sign">+</span></button></div></div></article>;
}
