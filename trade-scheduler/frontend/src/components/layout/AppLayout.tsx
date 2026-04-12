import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, BriefcaseBusiness, Calendar, Users, Settings,
  X, Menu, LogOut, ShieldCheck, UserPlus, Sun, Moon, Radio,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/App";

const MAIN_NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness, adminOnly: false },
  { href: "/calendar", label: "Calendar", icon: Calendar, adminOnly: false },
  { href: "/dispatch", label: "Dispatch", icon: Radio, adminOnly: true },
  { href: "/workers", label: "Workforce", icon: Users, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: false },
];

const AUTH_NAV_ITEMS = [
  { href: "/auth/manage", label: "Register Account", icon: UserPlus },
];

export function AppLayout({
  children,
  userRole,
  onLogout,
  theme,
  onToggleTheme,
}: {
  children: React.ReactNode;
  userRole: UserRole;
  onLogout: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const mainNavItems = MAIN_NAV_ITEMS.filter(item =>
    !item.adminOnly || userRole === "admin"
  );

  const NavLink = ({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: any; onClick?: () => void }) => {
    const active = location === href;
    return (
      <Link
        href={href}
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-lg font-display text-base uppercase tracking-wider transition-all duration-200 group",
          active
            ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(234,88,12,0.25)]"
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
        )}
      >
        <Icon
          size={18}
          className={cn(
            "transition-transform group-hover:scale-110 shrink-0",
            active ? "text-white" : "text-muted-foreground"
          )}
        />
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row font-sans">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-black font-display font-bold">
            TS2
          </div>
          <span className="font-display font-bold text-xl tracking-wide">Trade Sched</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={22} /> : <Moon size={22} />}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            title="Log out"
          >
            <LogOut size={22} />
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-foreground"
          >
            {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[73px] bg-background/95 backdrop-blur-lg z-30 p-4 animate-in slide-in-from-top-2 overflow-y-auto">
          <nav className="flex flex-col space-y-1">
            {mainNavItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-xl font-display text-base uppercase tracking-wider transition-all",
                  location === item.href
                    ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(234,88,12,0.3)]"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon size={22} />
                {item.label}
              </Link>
            ))}

            {/* Auth section on mobile (admin only) */}
            {userRole === "admin" && (
              <>
                <div className="pt-4 pb-1 px-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
                    <ShieldCheck size={11} /> Auth
                  </p>
                </div>
                {AUTH_NAV_ITEMS.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl font-display text-base uppercase tracking-wider transition-all",
                      location === item.href
                        ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(234,88,12,0.3)]"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <item.icon size={22} />
                    {item.label}
                  </Link>
                ))}
              </>
            )}

            <div className="pt-4">
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-4 p-4 rounded-xl font-display text-base uppercase tracking-wider transition-all w-full text-left text-destructive hover:bg-destructive/10"
              >
                <LogOut size={22} />
                Log Out
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-card border-r border-border h-screen sticky top-0">
        {/* Brand */}
        <div className="p-5 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-black font-display font-bold text-xl shadow-[0_0_20px_rgba(234,88,12,0.5)]">
            TS2
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl leading-none text-foreground">TRADE</h1>
            <p className="font-display text-primary text-sm font-semibold tracking-widest">SCHEDULER 2</p>
          </div>
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-3 space-y-1 mt-2 overflow-y-auto">
          {mainNavItems.map(item => (
            <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
          ))}

          {/* Auth section (admin only) */}
          {userRole === "admin" && (
            <div className="pt-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold px-4 mb-1.5 flex items-center gap-1.5">
                <ShieldCheck size={10} /> Auth
              </p>
              {AUTH_NAV_ITEMS.map(item => (
                <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
              ))}
            </div>
          )}
        </nav>

        {/* Bottom area: status + logout */}
        <div className="p-4 space-y-3 shrink-0">
          <div className="bg-secondary/50 rounded-xl p-3 border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl -mr-8 -mt-8" />
            <h3 className="font-display text-xs text-muted-foreground mb-0.5">Status</h3>
            <div className="flex items-center gap-2 text-green-400 font-semibold text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              SYSTEM ONLINE
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide font-display">
              {userRole === "admin" ? "Admin / Foreman" : "Worker"}
            </p>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-display uppercase tracking-wider text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-display uppercase tracking-wider text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
          >
            <LogOut size={16} />
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <div className="max-w-7xl mx-auto p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
