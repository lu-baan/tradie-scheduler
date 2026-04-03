import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/jobs" component={JobsList} />
        <Route path="/calendar" component={CalendarView} />
        <Route path="/workers" component={WorkersList} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  // Simple auth state — replace with proper auth context/provider in production
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem("ts2_auth") === "true";
  });

  const handleLogin = () => {
    sessionStorage.setItem("ts2_auth", "true");
    setIsAuthenticated(true);
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
          {isAuthenticated ? <Router /> : <AuthPage onLogin={handleLogin} />}
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
