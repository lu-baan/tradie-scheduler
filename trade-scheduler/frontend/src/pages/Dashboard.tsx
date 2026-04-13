import { useListJobs, useListWorkers } from "@/lib/api-client";
import { formatAUD } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, Clock, TrendingUp, Users, Inbox, Activity } from "lucide-react";
import { addDays, startOfWeek } from "date-fns";

import { JobCard } from "@/components/jobs/JobCard";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";

export function Dashboard() {
  const { data: jobs, isLoading } = useListJobs();
  const { data: workers = [] } = useListWorkers();

  if (isLoading) {
    return <div className="h-[50vh] flex items-center justify-center font-display text-xl animate-pulse text-primary">Loading Systems...</div>;
  }

  const allJobs = Array.isArray(jobs) ? jobs : [];
  const completedJobs = allJobs.filter(j => j.status === "completed");
  const pendingJobs = (allJobs ?? []).filter(j => j.status === "pending" || j.status === "confirmed");
  const emergencyJobs = allJobs.filter(j => j.isEmergency && j.status !== "completed");

  const activeJobs = allJobs.filter(j => j.status !== "completed" && j.status !== "cancelled");
  const totalRevenue = completedJobs.reduce((acc, job) => acc + job.price, 0);
  const predictedRevenue = activeJobs.reduce((acc, job) => acc + job.price, 0);

  // ── WFM KPIs ──────────────────────────────────────────────────────────────
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);

  const weekJobs = allJobs.filter(j => {
    if (!j.scheduledDate) return false;
    const d = new Date(j.scheduledDate);
    return d >= weekStart && d < weekEnd && j.status !== "cancelled" && j.status !== "bumped";
  });

  // Utilisation: total scheduled hours / total available capacity this week
  const totalCapacityHrs = workers.reduce((s, w) => s + (w.maxWeeklyHours ?? 38), 0);
  const totalScheduledHrs = weekJobs.reduce((s, j) => s + (j.estimatedHours ?? 0) * (j.assignedWorkerIds?.length ?? 1), 0);
  const utilPct = totalCapacityHrs > 0 ? Math.round((totalScheduledHrs / totalCapacityHrs) * 100) : 0;

  // Fill rate: bookings with ≥1 worker assigned / all active (pending/confirmed) bookings
  const activeBookings = allJobs.filter(j =>
    j.jobType === "booking" &&
    j.status !== "cancelled" &&
    j.status !== "completed" &&
    j.status !== "bumped"
  );
  const assignedBookings = activeBookings.filter(j => (j.assignedWorkers ?? []).length > 0);
  const fillRate = activeBookings.length > 0 ? Math.round((assignedBookings.length / activeBookings.length) * 100) : 100;

  // Unassigned today
  const todayStr = new Date().toISOString().slice(0, 10);
  const unassignedToday = allJobs.filter(j =>
    j.scheduledDate?.startsWith(todayStr) &&
    j.jobType === "booking" &&
    (j.assignedWorkerIds ?? []).length === 0 &&
    j.status !== "cancelled"
  ).length;

  // Overtime risk: workers over 80% of their weekly cap
  const overtimeRisk = workers.filter(w => {
    const hrs = weekJobs
      .filter(j => (j.assignedWorkerIds ?? []).includes(w.id))
      .reduce((s, j) => s + (j.estimatedHours ?? 0), 0);
    return hrs >= (w.maxWeeklyHours ?? 38) * 0.8;
  }).length;

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

      {/* ── WFM KPI strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Utilization */}
        <Card className="p-4 border-white/5">
          <p className="text-[10px] uppercase font-display tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
            <Activity size={10} /> Utilisation
          </p>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-2xl font-display font-bold">{utilPct}%</span>
            <span className="text-xs text-muted-foreground mb-0.5">this week</span>
          </div>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${utilPct >= 90 ? "bg-destructive" : utilPct >= 70 ? "bg-orange-400" : "bg-green-500"}`}
              style={{ width: `${utilPct}%` }}
            />
          </div>
        </Card>

        {/* Fill rate */}
        <Card className="p-4 border-white/5">
          <p className="text-[10px] uppercase font-display tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
            <Users size={10} /> Fill Rate
          </p>
          <div className="flex items-end gap-2 mb-2">
            <span className={`text-2xl font-display font-bold ${fillRate < 80 ? "text-destructive" : fillRate < 100 ? "text-orange-400" : "text-green-400"}`}>
              {fillRate}%
            </span>
            <span className="text-xs text-muted-foreground mb-0.5">active bookings staffed</span>
          </div>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${fillRate < 80 ? "bg-destructive" : fillRate < 100 ? "bg-orange-400" : "bg-green-500"}`}
              style={{ width: `${fillRate}%` }}
            />
          </div>
        </Card>

        {/* Unassigned today */}
        <Card className={`p-4 border-white/5 ${unassignedToday > 0 ? "border-yellow-500/30" : ""}`}>
          <p className="text-[10px] uppercase font-display tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
            <Inbox size={10} /> Unassigned Today
          </p>
          <span className={`text-2xl font-display font-bold ${unassignedToday > 0 ? "text-yellow-400" : "text-green-400"}`}>
            {unassignedToday}
          </span>
          <p className="text-xs text-muted-foreground mt-1">
            {unassignedToday === 0 ? "All jobs staffed" : `${unassignedToday} job${unassignedToday > 1 ? "s" : ""} need workers`}
          </p>
        </Card>

        {/* Overtime risk */}
        <Card className={`p-4 border-white/5 ${overtimeRisk > 0 ? "border-orange-500/30" : ""}`}>
          <p className="text-[10px] uppercase font-display tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
            <AlertTriangle size={10} /> Overtime Risk
          </p>
          <span className={`text-2xl font-display font-bold ${overtimeRisk > 0 ? "text-orange-400" : "text-green-400"}`}>
            {overtimeRisk}
          </span>
          <p className="text-xs text-muted-foreground mt-1">
            {overtimeRisk === 0 ? "No workers near cap" : `worker${overtimeRisk > 1 ? "s" : ""} ≥80% weekly cap`}
          </p>
        </Card>
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
              <h3 className="text-3xl font-display font-bold text-primary">{formatAUD(totalRevenue)}</h3>
              <p className="text-[10px] text-muted-foreground mt-1">Completed jobs only</p>
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
            <h3 className="font-display text-xl font-bold mb-4 border-b border-border pb-4">Activity Breakdown</h3>
            <div className="h-56">
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
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Predicted Revenue</span>
                <span className="font-display font-bold text-primary">{formatAUD(predictedRevenue)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">From all active (non-completed) jobs</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
