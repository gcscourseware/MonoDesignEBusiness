import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartItem = {
  key: string; serviceId: number; title: string; designerId: number; designerName: string;
  imageUrl: string; priceCents: number; packageName: "Basic" | "Standard" | "Premium";
  deliveryDays: number; quantity: number;
};

type CartContextValue = { items: CartItem[]; count: number; subtotalCents: number; addItem: (item: Omit<CartItem, "key" | "quantity">) => void; removeItem: (key: string) => void; updateQuantity: (key: string, quantity: number) => void; clear: () => void };
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("mono-cart") || "[]") as CartItem[]; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem("mono-cart", JSON.stringify(items)); }, [items]);
  const value = useMemo<CartContextValue>(() => ({
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalCents: items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
    addItem: item => setItems(current => {
      const key = `${item.serviceId}:${item.packageName}`;
      const found = current.find(row => row.key === key);
      return found ? current.map(row => row.key === key ? { ...row, quantity: Math.min(10, row.quantity + 1) } : row) : [...current, { ...item, key, quantity: 1 }];
    }),
    removeItem: key => setItems(current => current.filter(item => item.key !== key)),
    updateQuantity: (key, quantity) => setItems(current => current.map(item => item.key === key ? { ...item, quantity: Math.max(1, Math.min(10, quantity)) } : item)),
    clear: () => setItems([]),
  }), [items]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart() { const context = useContext(CartContext); if (!context) throw new Error("useCart must be used inside CartProvider"); return context; }

export const formatPrice = (cents: number) => cents === 0 ? "Free" : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
export const formatRate = (cents: number) => `$${Math.round(cents / 100)}/hr`;

export function usePageMeta(title: string, description: string, noindex = false) {
  useEffect(() => {
    const fullTitle = `${title} | Mono`;
    document.title = fullTitle.length > 60 ? `${fullTitle.slice(0, 57).trimEnd()}…` : fullTitle;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = description.slice(0, 160);
    const setProperty = (property: string, content: string) => {
      let node = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
      if (!node) { node = document.createElement("meta"); node.setAttribute("property", property); document.head.appendChild(node); }
      node.content = content;
    };
    setProperty("og:title", document.title);
    setProperty("og:description", meta.content);
    setProperty("og:site_name", "MONO DESIGN AGENCY");
    setProperty("og:type", "website");
    const configuredOrigin = import.meta.env.VITE_PUBLIC_SITE_URL;
    let publicOrigin: URL | null = null;
    try { if (configuredOrigin) { const candidate = new URL(configuredOrigin); if (candidate.protocol === "https:") publicOrigin = candidate; } } catch { /* omit public URL metadata until a valid origin is configured */ }
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    let ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    let twitterImage = document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]');
    if (publicOrigin) {
      if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
      const publicUrl = new URL(window.location.pathname, publicOrigin).toString();
      canonical.href = publicUrl;
      setProperty("og:url", publicUrl);
      const imageUrl = new URL("/mono-mark.png", publicOrigin).toString();
      if (!ogImage) { ogImage = document.createElement("meta"); ogImage.setAttribute("property", "og:image"); document.head.appendChild(ogImage); }
      ogImage.content = imageUrl;
      if (!twitterImage) { twitterImage = document.createElement("meta"); twitterImage.name = "twitter:image"; document.head.appendChild(twitterImage); }
      twitterImage.content = imageUrl;
    } else {
      canonical?.remove();
      document.querySelector('meta[property="og:url"]')?.remove();
      ogImage?.remove();
      twitterImage?.remove();
    }
    const twitterTitle = document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]') ?? document.createElement("meta");
    twitterTitle.name = "twitter:title"; twitterTitle.content = document.title; document.head.appendChild(twitterTitle);
    const twitterDescription = document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]') ?? document.createElement("meta");
    twitterDescription.name = "twitter:description"; twitterDescription.content = meta.content; document.head.appendChild(twitterDescription);
    const twitter = document.querySelector<HTMLMetaElement>('meta[name="twitter:card"]') ?? document.createElement("meta");
    twitter.name = "twitter:card"; twitter.content = publicOrigin ? "summary_large_image" : "summary"; document.head.appendChild(twitter);
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.appendChild(robots); }
    robots.content = noindex ? "noindex, nofollow" : "index, follow";
    return () => { if (robots) robots.content = "index, follow"; };
  }, [title, description, noindex]);
}
