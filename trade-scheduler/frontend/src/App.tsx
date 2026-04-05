import { useState } from "react";
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
import { AuthPage } from "@/pages/AuthPage";
import { AuthManage } from "@/pages/AuthManage";
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

function Router({ userRole, onLogout }: { userRole: UserRole; onLogout: () => void }) {
  return (
    <AppLayout userRole={userRole} onLogout={onLogout}>
      <Switch>
        <Route path="/">
          {userRole === "admin" ? <Dashboard /> : <Redirect to="/jobs" />}
        </Route>
        <Route path="/jobs" component={JobsList} />
        <Route path="/calendar">
          <CalendarView userRole={userRole} />
        </Route>
        <Route path="/workers">
          {userRole === "admin" ? <WorkersList /> : <Redirect to="/jobs" />}
        </Route>
        <Route path="/settings">
          {userRole === "admin" ? <Settings /> : <Redirect to="/jobs" />}
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

  const handleLogin = (role: UserRole) => {
    sessionStorage.setItem("ts2_auth", "true");
    sessionStorage.setItem("ts2_role", role);
    setIsAuthenticated(true);
    setUserRole(role);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("ts2_auth");
    sessionStorage.removeItem("ts2_role");
    setIsAuthenticated(false);
  };

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
            <Router userRole={userRole} onLogout={handleLogout} />
          ) : (
            <AuthPage onLogin={handleLogin} />
          )}
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
