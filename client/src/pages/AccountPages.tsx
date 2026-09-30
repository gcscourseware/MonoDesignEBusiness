import { useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, LockKeyhole, Minus, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatPrice, useCart, usePageMeta } from "@/lib/market";

const roleOptions = [
  { id: "client", title: "I have a project", text: "I’m looking for a designer for myself or a small team.", badge: "INDIVIDUAL" },
  { id: "business", title: "I’m building a business", text: "I need clear creative support as my brand grows.", badge: "BUSINESS" },
  { id: "agency", title: "I work at an agency", text: "I need flexible creative capacity for client work.", badge: "AGENCY" },
  { id: "designer", title: "I’m a designer", text: "I’d like to share my work and find good collaborations.", badge: "CREATIVE" },
] as const;

export function LoginPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  usePageMeta("Log in to Mono", "Sign in securely with your Manus account to manage your Mono Design Agency profile and projects.", true);
  const login = () => { try { startLogin(); } catch { toast.error("Sign-in is not configured for this project yet."); } };
  return <main className="auth-page"><div className="auth-art"><img src="/manus-storage/async-images/z3yu4Jrsv1kuxSxtIcMrj3/image-2.webp" alt="A thoughtfully arranged Mono design studio still life" /><span className="auth-art-caption">GOOD WORK STARTS<br /><em>WITH THE RIGHT PEOPLE.</em></span></div><div className="auth-panel"><Link href="/" className="auth-back"><ArrowLeft size={15} /> Back to Mono</Link><p className="eyebrow">YOUR CREATIVE SPACE</p><h1>Good to see <em>you.</em></h1><p>Sign in to keep your projects, messages and creative partnerships moving.</p><div className="auth-benefits"><span><Check size={15} /> Pick up where you left off</span><span><Check size={15} /> Keep every project in one place</span><span><Check size={15} /> Find your next creative partner</span></div>{user ? <button className="btn btn-dark btn-full" onClick={() => setLocation("/dashboard")}>Continue to your dashboard <ArrowRight size={16} /></button> : <button className="btn btn-dark btn-full" onClick={login}>Continue with Manus <ArrowUpRight size={16} /></button>}<p className="auth-legal"><LockKeyhole size={13} /> Secure sign-in. Mono never sees your password.</p><div className="auth-switch">New to Mono? <Link href="/register">Create an account <ArrowRight size={14} /></Link></div></div></main>;
}

export function RegisterPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const query = new URLSearchParams(window.location.search);
  const givenType = query.get("type");
  const givenPlan = query.get("plan");
  const [role, setRole] = useState<(typeof roleOptions)[number]["id"]>((roleOptions.some(item => item.id === givenType) ? givenType : "client") as (typeof roleOptions)[number]["id"]);
  usePageMeta("Get started with Mono", "Choose how you want to use Mono Design Agency, then create your secure account.", true);
  const continueSignup = () => {
    sessionStorage.setItem("mono-pending-role", role);
    if (givenPlan) sessionStorage.setItem("mono-pending-plan", givenPlan);
    setLocation(user ? "/onboarding" : "/login");
  };
  return <main className="register-page"><div className="register-wrap"><Link href="/" className="auth-back"><ArrowLeft size={15} /> Back to Mono</Link><div className="register-heading"><p className="eyebrow">LET’S GET YOU SET UP</p><h1>How will you use <em>Mono?</em></h1><p>Choose the path that feels most like you. You can always update your profile later.</p></div><div className="role-choice-grid">{roleOptions.map(option => <button className={`role-choice ${role === option.id ? "selected" : ""}`} key={option.id} onClick={() => setRole(option.id)}><span className="role-choice-radio" /><small>{option.badge}</small><strong>{option.title}</strong><p>{option.text}</p><ArrowUpRight className="role-choice-arrow" size={16} /></button>)}</div><div className="register-footer"><span><LockKeyhole size={14} /> Secure sign-in with your Manus account</span><button className="btn btn-dark" onClick={continueSignup}>Continue <ArrowRight size={16} /></button></div><p className="register-login">Already have an account? <Link href="/login">Log in</Link></p></div></main>;
}

export function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [role, setRole] = useState<(typeof roleOptions)[number]["id"]>((sessionStorage.getItem("mono-pending-role") as (typeof roleOptions)[number]["id"]) || "client");
  const [planCode, setPlanCode] = useState((sessionStorage.getItem("mono-pending-plan") || "BASIC") as "BASIC" | "BUSINESS" | "AGENCY");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const onboard = trpc.account.onboard.useMutation({ onSuccess: () => { sessionStorage.removeItem("mono-pending-role"); sessionStorage.removeItem("mono-pending-plan"); toast.success(role === "designer" ? "Your designer profile is ready to build." : "Your Mono workspace is ready."); setLocation("/dashboard"); }, onError: error => toast.error(error.message) });
  usePageMeta("Set up your Mono workspace", "Choose your workspace type and plan to begin using the creative marketplace.", true);
  if (!user) return <main className="register-page"><div className="empty-state"><div className="empty-icon"><LockKeyhole /></div><p className="eyebrow">SIGN IN REQUIRED</p><h1>Let’s make this <em>yours.</em></h1><p>Sign in to finish setting up your Mono workspace.</p><button className="btn btn-dark" onClick={() => setLocation("/login")}>Go to sign in <ArrowRight size={15} /></button></div></main>;
  return <main className="register-page"><div className="register-wrap onboarding-wrap"><Link href="/" className="auth-back"><ArrowLeft size={15} /> Back to Mono</Link><div className="register-heading"><p className="eyebrow">STEP 01 / YOUR WORKSPACE</p><h1>Let’s set up your <em>space.</em></h1><p>Your workspace is where your briefs, projects and creative conversations live.</p></div><div className="onboard-type-row">{roleOptions.map(option => <button className={`onboard-type ${role === option.id ? "selected" : ""}`} key={option.id} onClick={() => setRole(option.id)}><span>{option.badge}</span><strong>{option.title}</strong><small>{option.text}</small></button>)}</div>{role !== "designer" && <div className="onboard-details"><label>{role === "client" ? "Your name" : "Company or agency name"}<input value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder={role === "client" ? (user.name || "Your name") : "e.g. Northstar Studio"} /></label><label>Industry <select value={industry} onChange={event => setIndustry(event.target.value)}><option value="">Choose one</option>{["Arts & culture", "Consumer goods", "Education", "Food & beverage", "Health & wellness", "Media & entertainment", "Professional services", "Technology", "Other"].map(item => <option key={item}>{item}</option>)}</select></label></div>}{role !== "designer" && <div className="onboard-plans"><div><p className="eyebrow">STEP 02 / YOUR PLAN</p><h2>A little room to <em>grow.</em></h2></div><div className="onboard-plan-row">{(["BASIC", "BUSINESS", "AGENCY"] as const).map(code => <button className={`onboard-plan ${planCode === code ? "selected" : ""}`} onClick={() => setPlanCode(code)} key={code}><span>{code === "BASIC" ? "MONO BASIC" : code === "BUSINESS" ? "MONO BUSINESS" : "MONO AGENCY"}</span><strong>{code === "BASIC" ? "Free" : code === "BUSINESS" ? "$29" : "$89"}<small>{code === "BASIC" ? "" : "/ month"}</small></strong></button>)}</div></div>}<div className="register-footer"><span><ShieldCheck size={15} /> {role === "designer" ? "Designer applications are reviewed before public listing." : "No real payment is collected during setup."}</span><button className="btn btn-dark" disabled={onboard.isPending} onClick={() => onboard.mutate({ role, companyName: companyName || undefined, industry: industry || undefined, planCode: role === "designer" ? undefined : planCode })}>{onboard.isPending ? "Setting up…" : "Create workspace"} <ArrowRight size={16} /></button></div></div></main>;
}

export function CartPage() {
  const cart = useCart();
  usePageMeta("Your project cart", "Review the creative services you’re considering before sharing your brief and starting a Mono project.", true);
  return <main className="page-shell cart-page"><div className="breadcrumb"><Link href="/services"><ArrowLeft size={14} /> Back to services</Link><span>/</span><span>Your cart</span></div><section className="page-hero cart-hero"><div><p className="eyebrow">GOOD WORK STARTS HERE</p><h1>Your project <em>line-up.</em></h1><p>Review your services, then tell your designer what you’re making.</p></div><span className="cart-hero-count">{String(cart.count).padStart(2, "0")}<small>ITEMS</small></span></section>{cart.items.length === 0 ? <div className="empty-state"><div className="empty-icon"><span>+</span></div><p className="eyebrow">NOTHING IN THE CART YET</p><h2>Good things are <em>out there.</em></h2><p>Find a service that feels right, or meet a designer to plan something custom.</p><Link className="btn btn-dark" href="/services">Explore services <ArrowRight size={16} /></Link></div> : <div className="cart-layout"><div className="cart-items">{cart.items.map(item => <article className="cart-item" key={item.key}><img src={item.imageUrl} alt={item.title} /><div className="cart-item-main"><span className="eyebrow">{item.packageName.toUpperCase()} PACKAGE</span><h2>{item.title}</h2><p>by {item.designerName}</p><small>{item.deliveryDays} day delivery</small></div><div className="cart-quantity"><button onClick={() => cart.updateQuantity(item.key, item.quantity - 1)} aria-label="Decrease quantity"><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => cart.updateQuantity(item.key, item.quantity + 1)} aria-label="Increase quantity"><Plus size={14} /></button></div><strong className="cart-price">{formatPrice(item.priceCents * item.quantity)}</strong><button className="remove-cart" aria-label="Remove item" onClick={() => cart.removeItem(item.key)}><Trash2 size={16} /></button></article>)}<Link href="/services" className="text-link"><ArrowLeft size={14} /> Keep exploring</Link></div><aside className="cart-summary"><p className="eyebrow">YOUR SUMMARY</p><h2>Before you <em>begin.</em></h2><div className="summary-line"><span>Services ({cart.count})</span><strong>{formatPrice(cart.subtotalCents)}</strong></div><div className="summary-line"><span>Platform fee</span><strong>Included</strong></div><div className="summary-total"><span>Subtotal</span><strong>{formatPrice(cart.subtotalCents)}</strong></div><p className="mock-payment-note"><ShieldCheck size={15} /> Checkout uses a clearly labeled demo payment state. No card details are collected.</p><Link href="/checkout" className="btn btn-dark btn-full">Continue to brief <ArrowRight size={16} /></Link><small className="summary-footnote">You’ll confirm your project scope before an order is created.</small></aside></div>}</main>;
}

export function CheckoutPage() {
  const cart = useCart();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [projectName, setProjectName] = useState("");
  const [requirements, setRequirements] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const checkout = trpc.orders.checkout.useMutation();
  usePageMeta("Share your project brief", "Tell your Mono designer what you’re making before starting a demo order.", true);
  const normalizedPromo = promoCode.trim().toUpperCase();
  const discountRate = normalizedPromo === "MONO10" ? 0.1 : normalizedPromo === "MONO15" ? 0.15 : 0;
  const discountCents = Math.round(cart.subtotalCents * discountRate);
  const totalCents = cart.subtotalCents - discountCents;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return setLocation("/login");
    if (!cart.items.length) return setLocation("/services");
    try {
      await checkout.mutateAsync({ items: cart.items.map(item => ({ serviceId: item.serviceId, packageName: item.packageName, quantity: item.quantity })), projectName: projectName.trim(), requirements: requirements.trim(), promoCode: promoCode.trim() || undefined });
      cart.clear();
      toast.success("Projects created. No real payment was processed.");
      setLocation("/client/dashboard?tab=orders");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create your project."); }
  };
  return <main className="page-shell checkout-page">
    <div className="breadcrumb"><Link href="/cart"><ArrowLeft size={14} /> Your cart</Link><span>/</span><span>Project brief</span></div>
    <section className="page-hero compact-hero"><div><p className="eyebrow">ONE LAST THING</p><h1>Tell us what you’re <em>making.</em></h1><p>A good brief gives your designer a clear place to start.</p></div><span className="checkout-lock"><LockKeyhole size={20} /></span></section>
    {!user ? <div className="auth-required"><p>Sign in to save your brief and project.</p><Link href="/login" className="btn btn-dark">Sign in to continue <ArrowRight size={15} /></Link></div> : cart.items.length === 0 ? <div className="empty-state"><p>Your cart is empty.</p><Link href="/services" className="btn btn-dark">Browse services</Link></div> : <div className="checkout-layout">
      <form className="brief-form" onSubmit={submit}><p className="eyebrow">PROJECT BRIEF / 01</p><h2>Start with the <em>essentials.</em></h2>
        <label>What should we call this project?<input required minLength={3} maxLength={180} value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="e.g. Olive & Oak visual identity" /></label>
        <label>What would you like to make?<textarea required minLength={10} maxLength={4000} rows={7} value={requirements} onChange={event => setRequirements(event.target.value)} placeholder="Tell your designers about the goal, audience, timing and anything that would help them get to know the project…" /></label>
        <div className="brief-tip"><span>GOOD BRIEFS INCLUDE</span><p>A little context, what success looks like, any timeline you’re working towards and the deliverables you have in mind.</p></div>
        <button className="btn btn-dark btn-full" type="submit" disabled={checkout.isPending}>{checkout.isPending ? "Creating your projects…" : "Create orders · demo checkout"} <ArrowRight size={16} /></button><small className="demo-disclaimer">Demo checkout only. No card data, real payment, or external charge is used.</small>
      </form>
      <aside className="checkout-summary"><p className="eyebrow">YOUR PROJECT</p><h2>What’s in the <em>works.</em></h2>
        {cart.items.map(item => <div className="checkout-item" key={item.key}><img src={item.imageUrl} alt="" /><div><strong>{item.title}</strong><small>{item.packageName} · {item.designerName} · Qty {item.quantity}</small></div><span>{formatPrice(item.priceCents * item.quantity)}</span></div>)}
        <label className="promo-code-field">Demo promo code<input value={promoCode} onChange={event => setPromoCode(event.target.value)} placeholder="MONO10 or MONO15" maxLength={40} /></label>
        <div className="summary-line"><span>Subtotal</span><strong>{formatPrice(cart.subtotalCents)}</strong></div>{discountCents > 0 && <div className="summary-line"><span>{normalizedPromo} discount</span><strong>−{formatPrice(discountCents)}</strong></div>}
        <div className="summary-total"><span>Demo total</span><strong>{formatPrice(totalCents)}</strong></div>
        <div className="payment-state"><ShieldCheck size={17} /><span><strong>Protected demo checkout</strong><small>Records a mock payment state only. No card data or real charge is collected. Codes MONO10 and MONO15 apply demo discounts.</small></span></div>
      </aside>
    </div>}
  </main>;
}
