import { Link, useLocation } from "wouter";
import { ArrowUpRight, Menu, ShoppingBag, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useCart } from "@/lib/market";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const cart = useCart();
  const items = [["Find designers", "/designers"], ["Services", "/services"], ["Categories", "/categories"], ["How it works", "/how-it-works"], ["Pricing", "/pricing"]] as const;
  return <header className="site-header"><div className="nav-inner">
    <Link href="/" className="brand-lockup" onClick={() => setOpen(false)}><img src="/mono-mark.png" alt="" className="brand-mark" /><span className="brand-word">MONO<span>DESIGN AGENCY</span></span></Link>
    <nav className={`main-nav ${open ? "is-open" : ""}`} aria-label="Main navigation">
      {items.map(([label, href]) => <Link key={href} href={href} className={location === href ? "active" : ""} onClick={() => setOpen(false)}>{label}</Link>)}
      <Link className="mobile-only" href="/become-a-designer" onClick={() => setOpen(false)}>Become a designer <ArrowUpRight size={14} /></Link>
    </nav>
    <div className="nav-actions">
      <Link href="/cart" aria-label={`Shopping cart, ${cart.count} items`} className="cart-link"><ShoppingBag size={18} /><span className="cart-count">{cart.count}</span></Link>
      {user ? <><Link href="/dashboard" className="nav-login">Dashboard</Link><button className="nav-logout" onClick={() => void logout()}>Log out</button></> : <><Link href="/login" className="nav-login">Log in</Link><Link href="/register" className="btn btn-dark btn-nav">Get started <ArrowUpRight size={15} /></Link></>}
      <button className="menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
    </div>
  </div></header>;
}

export function SiteFooter() {
  return <footer className="site-footer"><div className="footer-top"><div className="footer-brand"><div className="brand-lockup"><img src="/mono-mark.png" alt="" className="brand-mark" /><span className="brand-word">MONO<span>DESIGN AGENCY</span></span></div><p>Good work starts with the right people.</p></div><div className="footer-links"><div><small>EXPLORE</small><Link href="/designers">Designers</Link><Link href="/services">Services</Link><Link href="/categories">Categories</Link></div><div><small>MONO</small><Link href="/how-it-works">How it works</Link><Link href="/pricing">Membership</Link><Link href="/become-a-designer">For designers</Link></div><div><small>YOUR SPACE</small><Link href="/dashboard">Dashboard</Link><Link href="/cart">Cart</Link><Link href="/login">Log in</Link></div></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Mono Design Agency</span><span>Thoughtfully matched. Beautifully made.</span></div></footer>;
}
