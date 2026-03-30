import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dashboard } from "@/pages/Dashboard";
import { JobsList } from "@/pages/JobsList";
import { WorkersList } from "@/pages/WorkersList";
import { CalendarView } from "@/pages/CalendarView";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function Settings() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl">
      <div>
        <h1 className="text-4xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your app preferences.</p>
      </div>
      <div className="bg-card p-8 rounded-xl border border-white/5 shadow-2xl">
        <h3 className="font-display text-xl text-primary mb-4 uppercase">System Defaults</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 border border-border rounded-lg bg-background/50">
            <div>
              <div className="font-bold">Australian GST Rate</div>
              <div className="text-sm text-muted-foreground">Used for invoice generation</div>
            </div>
            <div className="font-mono text-lg">10.0%</div>
          </div>
          <div className="flex justify-between items-center p-4 border border-border rounded-lg bg-background/50">
            <div>
              <div className="font-bold">Default Currency</div>
            </div>
            <div className="font-mono text-lg">AUD ($)</div>
          </div>
          <div className="flex justify-between items-center p-4 border border-border rounded-lg bg-background/50">
            <div>
              <div className="font-bold">Distance Units</div>
            </div>
            <div className="font-mono text-lg">Kilometers (km)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
