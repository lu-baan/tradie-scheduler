import { Link, useLocation } from "wouter";
import { LayoutDashboard, Briefcase, Calendar, Users, Settings, Plus, X, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/workers", label: "Workers", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-foreground">
          {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[73px] bg-background/95 backdrop-blur-lg z-30 p-4 animate-in slide-in-from-top-2">
          <nav className="flex flex-col space-y-2">
            {NAV_ITEMS.map((item) => {
              const active = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl font-display text-lg uppercase tracking-wider transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(234,88,12,0.3)]"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <item.icon size={24} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-72 flex-col bg-card border-r border-border h-screen sticky top-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-black font-display font-bold text-xl shadow-[0_0_20px_rgba(234,88,12,0.5)]">
            TS2
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl leading-none text-foreground">TRADE</h1>
            <p className="font-display text-primary text-sm font-semibold tracking-widest">SCHEDULER 2</p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {NAV_ITEMS.map((item) => {
            const active = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg font-display text-lg uppercase tracking-wider transition-all duration-200 group",
                  active
                    ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(234,88,12,0.25)]"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <item.icon
                  size={20}
                  className={cn("transition-transform group-hover:scale-110", active ? "text-white" : "text-muted-foreground")}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-6">
          <div className="bg-secondary/50 rounded-xl p-4 border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10" />
            <h3 className="font-display text-sm text-muted-foreground mb-1">Status</h3>
            <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              SYSTEM ONLINE
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
