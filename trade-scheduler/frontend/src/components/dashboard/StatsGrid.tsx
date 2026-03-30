import { Job, JobStatus } from "@/lib/api-client";
import { Briefcase, CheckCircle2, Clock, DollarSign } from "lucide-react";

interface StatsGridProps {
  jobs: Job[] | undefined;
}

export function StatsGrid({ jobs = [] }: StatsGridProps) {
  const total = jobs.length;
  const completed = jobs.filter(j => j.status === JobStatus.completed).length;
  const pending = jobs.filter(j => j.status === JobStatus.pending).length;
  const revenue = jobs.filter(j => j.status === JobStatus.completed).reduce((sum, j) => sum + j.price, 0);

  const stats = [
    {
      label: "Total Jobs",
      value: total,
      icon: Briefcase,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Completed",
      value: completed,
      icon: CheckCircle2,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      label: "Pending",
      value: pending,
      icon: Clock,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
    },
    {
      label: "Total Revenue",
      value: `$${revenue.toLocaleString()}`,
      icon: DollarSign,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <div key={i} className="bg-card p-4 md:p-6 rounded-2xl border border-border/50 shadow-lg relative overflow-hidden group">
            <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full ${stat.bg} blur-2xl group-hover:scale-150 transition-transform duration-500`} />
            <div className="relative z-10 flex items-center justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
            <div className="relative z-10">
              <h4 className="text-3xl font-display font-bold text-foreground">{stat.value}</h4>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mt-1">{stat.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
