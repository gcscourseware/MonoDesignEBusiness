import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { SiteFooter, SiteHeader } from "./components/SiteShell";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CartProvider } from "./lib/market";
import Home from "./pages/Home";
import { BecomeDesignerPage, CategoriesPage, DesignerProfilePage, DesignersPage, HowItWorksPage, PricingPage, ServiceDetailPage, ServicesPage } from "./pages/ExplorePages";
import { CartPage, CheckoutPage, LoginPage, OnboardingPage, RegisterPage } from "./pages/AccountPages";
import { DashboardPage, ProjectDetailPage } from "./pages/Dashboard";

function PublicPage({ children }: { children: React.ReactNode }) {
  return <><SiteHeader />{children}<SiteFooter /></>;
}
function RouteNotFound() {
  return <PublicPage><NotFound /></PublicPage>;
}
function Router() {
  return <Switch>
    <Route path="/" component={() => <PublicPage><Home /></PublicPage>} />
    <Route path="/designers" component={() => <PublicPage><DesignersPage /></PublicPage>} />
    <Route path="/designer/dashboard" component={DashboardPage} />
    <Route path="/designer/:slug" component={() => <PublicPage><DesignerProfilePage /></PublicPage>} />
    <Route path="/services" component={() => <PublicPage><ServicesPage /></PublicPage>} />
    <Route path="/service/:id" component={() => <PublicPage><ServiceDetailPage /></PublicPage>} />
    <Route path="/categories" component={() => <PublicPage><CategoriesPage /></PublicPage>} />
    <Route path="/how-it-works" component={() => <PublicPage><HowItWorksPage /></PublicPage>} />
    <Route path="/pricing" component={() => <PublicPage><PricingPage /></PublicPage>} />
    <Route path="/become-a-designer" component={() => <PublicPage><BecomeDesignerPage /></PublicPage>} />
    <Route path="/login" component={() => <PublicPage><LoginPage /></PublicPage>} />
    <Route path="/register" component={() => <PublicPage><RegisterPage /></PublicPage>} />
    <Route path="/onboarding" component={() => <PublicPage><OnboardingPage /></PublicPage>} />
    <Route path="/cart" component={() => <PublicPage><CartPage /></PublicPage>} />
    <Route path="/checkout" component={() => <PublicPage><CheckoutPage /></PublicPage>} />
    <Route path="/admin/dashboard" component={DashboardPage} />
    <Route path="/client/dashboard" component={DashboardPage} />
    <Route path="/dashboard" component={DashboardPage} />
    <Route path="/orders" component={DashboardPage} />
    <Route path="/projects" component={DashboardPage} />
    <Route path="/messages" component={DashboardPage} />
    <Route path="/quotes" component={DashboardPage} />
    <Route path="/notifications" component={DashboardPage} />
    <Route path="/settings" component={DashboardPage} />
    <Route path="/project/:id" component={ProjectDetailPage} />
    <Route path="/404" component={RouteNotFound} />
    <Route component={RouteNotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><CartProvider><Toaster /><Router /></CartProvider></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
