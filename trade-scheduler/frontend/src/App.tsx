import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dashboard } from "@/pages/Dashboard";
import { JobsList } from "@/pages/JobsList";
import { WorkersList } from "@/pages/WorkersList";
import { CalendarView } from "@/pages/CalendarView";
import { Settings } from "@/pages/Settings";
import { WorkerSettings } from "@/pages/WorkerSettings";
import { AuthPage } from "@/pages/AuthPage";
import { AuthManage } from "@/pages/AuthManage";
import { DispatchBoard } from "@/pages/DispatchBoard";
import NotFound from "@/pages/not-found";

export type UserRole = "admin" | "worker";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function Router({ userRole, onLogout, theme, onToggleTheme }: { userRole: UserRole; onLogout: () => void; theme: "dark" | "light"; onToggleTheme: () => void }) {
  return (
    <AppLayout userRole={userRole} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme}>
      <Switch>
        <Route path="/">
          {userRole === "admin" ? <Dashboard /> : <Redirect to="/jobs" />}
        </Route>
        <Route path="/jobs">
          <JobsList userRole={userRole} />
        </Route>
        <Route path="/calendar">
          <CalendarView userRole={userRole} />
        </Route>
        <Route path="/workers">
          {userRole === "admin" ? <WorkersList /> : <Redirect to="/jobs" />}
        </Route>
        <Route path="/dispatch">
          {userRole === "admin" ? <DispatchBoard /> : <Redirect to="/jobs" />}
        </Route>
        <Route path="/settings">
          {userRole === "admin" ? <Settings /> : <WorkerSettings />}
        </Route>
        <Route path="/auth/manage">
          {userRole === "admin" ? <AuthManage /> : <Redirect to="/jobs" />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem("ts2_auth") === "true";
  });
  const [userRole, setUserRole] = useState<UserRole>(() => {
    return (sessionStorage.getItem("ts2_role") as UserRole) ?? "worker";
  });
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("ts2_theme") as "dark" | "light") ?? "dark";
  });

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
    localStorage.setItem("ts2_theme", theme);
  }, [theme]);

  const handleLogin = (role: UserRole) => {
    sessionStorage.setItem("ts2_auth", "true");
    sessionStorage.setItem("ts2_role", role);
    setIsAuthenticated(true);
    setUserRole(role);
  };

  const handleLogout = () => {
    // Invalidate the server session before clearing local state
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    sessionStorage.removeItem("ts2_auth");
    sessionStorage.removeItem("ts2_role");
    sessionStorage.removeItem("ts2_worker_id");
    sessionStorage.removeItem("ts2_full_name");
    sessionStorage.removeItem("ts2_login_number");
    sessionStorage.removeItem("ts2_email");
    setIsAuthenticated(false);
  };

  const handleToggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              color: "hsl(var(--foreground))",
            },
          }}
        />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          {isAuthenticated ? (
            <Router userRole={userRole} onLogout={handleLogout} theme={theme} onToggleTheme={handleToggleTheme} />
          ) : (
            <AuthPage onLogin={handleLogin} theme={theme} onToggleTheme={handleToggleTheme} />
          )}
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
