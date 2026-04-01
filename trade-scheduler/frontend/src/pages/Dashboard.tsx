import { useListJobs } from "@/lib/api-client";
import { formatAUD } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, Clock, DollarSign, TrendingUp } from "lucide-react";
import { JobCard } from "@/components/jobs/JobCard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function Dashboard() {
  const { data: jobs, isLoading } = useListJobs();
  console.log('jobs:', jobs, 'type:', typeof jobs, 'isArray:', Array.isArray(jobs));

  if (isLoading) {
    return <div className="h-[50vh] flex items-center justify-center font-display text-xl animate-pulse text-primary">Loading Systems...</div>;
  }

  const allJobs = Array.isArray(jobs) ? jobs : [];
  const completedJobs = allJobs.filter(j => j.status === "completed");
  const pendingJobs = (allJobs ?? []).filter(j => j.status === "pending" || j.status === "confirmed");
  const emergencyJobs = allJobs.filter(j => j.isEmergency && j.status !== "completed");
  
  const revenue = completedJobs.reduce((acc, job) => acc + job.price, 0);

  // Mock chart data for visual appeal based on job types
  const chartData = [
    { name: "Quote", count: allJobs.filter(j => j.jobType === "quote").length },
    { name: "Booking", count: allJobs.filter(j => j.jobType === "booking").length },
    { name: "Completed", count: completedJobs.length },
    { name: "Bumped", count: allJobs.filter(j => j.status === "bumped").length },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground text-glow">Overview</h1>
          <p className="text-muted-foreground mt-2 text-lg">System status and operational metrics.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-white/10 hover:border-primary/50 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-muted-foreground font-display uppercase tracking-widest text-xs mb-2">Total Jobs</p>
              <h3 className="text-4xl font-display font-bold">{allJobs.length}</h3>
            </div>
            <div className="p-3 bg-primary/10 rounded-lg text-primary">
              <BriefcaseBusiness size={24} />
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-white/10 hover:border-status-completed/50 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-muted-foreground font-display uppercase tracking-widest text-xs mb-2">Completed</p>
              <h3 className="text-4xl font-display font-bold">{completedJobs.length}</h3>
            </div>
            <div className="p-3 bg-status-completed/10 rounded-lg text-status-completed">
              <CheckCircle2 size={24} />
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-white/10 hover:border-status-pending/50 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-muted-foreground font-display uppercase tracking-widest text-xs mb-2">Pending</p>
              <h3 className="text-4xl font-display font-bold">{pendingJobs.length}</h3>
            </div>
            <div className="p-3 bg-status-pending/10 rounded-lg text-status-pending">
              <Clock size={24} />
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-card to-primary/5 border-white/10 shadow-[0_0_30px_rgba(234,88,12,0.1)] hover:border-primary transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-muted-foreground font-display uppercase tracking-widest text-xs mb-2">Total Revenue</p>
              <h3 className="text-4xl font-display font-bold text-primary">{formatAUD(revenue)}</h3>
            </div>
            <div className="p-3 bg-primary/20 rounded-lg text-primary">
              <TrendingUp size={24} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-destructive" />
            <h2 className="font-display text-2xl font-bold">Active Emergencies (Code 9)</h2>
          </div>
          {emergencyJobs.length === 0 ? (
            <div className="bg-card/50 border border-dashed border-white/10 rounded-xl p-8 text-center text-muted-foreground">
              No active Code 9 emergencies. Standard operations active.
            </div>
          ) : (
            <div className="grid gap-6">
              {emergencyJobs.map(job => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}

          <h2 className="font-display text-2xl font-bold mt-8">Recent Pending Jobs</h2>
          <div className="grid gap-6">
            {pendingJobs.slice(0, 3).map(job => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </div>

        <div>
          <Card className="p-6 border-white/5 sticky top-24">
            <h3 className="font-display text-xl font-bold mb-6 border-b border-border pb-4">Activity Breakdown</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" stroke="#666" tick={{fontFamily: 'Inter', fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                    itemStyle={{ color: '#ea580c' }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
