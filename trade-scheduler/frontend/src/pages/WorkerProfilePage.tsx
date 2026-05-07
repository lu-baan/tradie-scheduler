import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, Mail, Briefcase, DollarSign, Clock, Award } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

interface WorkerProfile {
  id: number;
  name: string;
  tradeType: string;
  phone: string | null;
  email: string | null;
  isAvailable: boolean;
  hourlyRate: number | null;
  skills: string[];
  createdAt: string;
  maxWeeklyHours: number | null;
}

interface WorkerJob {
  id: number;
  title: string;
  job_type: string;
  status: string;
  priority: string;
  price: number;
  scheduled_date: string | null;
  trade_type: string;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400",
  confirmed: "bg-blue-500/15 text-blue-400",
  in_progress: "bg-primary/15 text-primary",
  completed: "bg-green-500/15 text-green-400",
  cancelled: "bg-red-500/15 text-red-400",
  bumped: "bg-purple-500/15 text-purple-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  bumped: "Bumped",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-blue-500/15 text-blue-400",
  medium: "bg-amber-500/15 text-amber-400",
  high: "bg-red-500/15 text-red-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "d MMM yyyy, h:mm a");
  } catch {
    return "—";
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-secondary/40 rounded-xl p-4 border border-border/50 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
        <Icon size={16} className="text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-display uppercase tracking-wider">
          {label}
        </p>
        <p className="font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function avatarColor(name: string) {
  const colors = [
    "bg-blue-500",
    "bg-violet-500",
    "bg-emerald-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-amber-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++)
    h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const cls =
    size === "lg" ? "w-16 h-16 text-lg" : size === "md" ? "w-10 h-10 text-sm" : "w-8 h-8 text-xs";
  return (
    <div
      className={`${cls} rounded-full ${avatarColor(name)} flex items-center justify-center text-white font-bold shrink-0`}
    >
      {initials}
    </div>
  );
}

export function WorkerProfilePage() {
  const [, navigate] = useLocation();
  const params = useParams<{ workerId: string }>();
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [jobs, setJobs] = useState<WorkerJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.workerId) return;

    const workerId = parseInt(params.workerId, 10);
    if (isNaN(workerId)) return;

    const fetchData = async () => {
      try {
        // Fetch all workers and find the one matching workerId
        const res = await fetch("/api/workers", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch workers");

        const workers: WorkerProfile[] = await res.json();
        const worker = workers.find((w) => w.id === workerId);

        if (!worker) {
          toast.error("Worker not found");
          navigate("/workers");
          return;
        }

        setProfile(worker);

        // Fetch jobs for this worker
        try {
          const jobsRes = await fetch("/api/jobs", { credentials: "include" });
          if (jobsRes.ok) {
            const allJobs: WorkerJob[] = await jobsRes.json();
            // Filter jobs assigned to this worker (this is a simplified approach)
            // In a real app, you'd have a dedicated endpoint for worker's jobs
            setJobs(allJobs.slice(0, 10)); // Just showing recent jobs for now
          }
        } catch {
          // Silently fail on jobs fetch
        }
      } catch (error) {
        toast.error("Failed to load worker profile");
        navigate("/workers");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params.workerId, navigate]);

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/location")}>
            <ArrowLeft size={16} className="mr-2" />
            Back to Location
          </Button>
        </div>
        <div className="space-y-4">
          <div className="h-32 bg-card rounded-xl animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-card rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-6 animate-in fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate("/location")}>
          <ArrowLeft size={16} className="mr-2" />
          Back to Location
        </Button>
        <div className="py-20 text-center text-muted-foreground bg-card/30 rounded-xl border border-dashed border-white/10">
          <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-display uppercase">Worker Not Found</h3>
          <p className="text-sm mt-1">The requested worker profile could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/location")}>
          <ArrowLeft size={16} className="mr-2" />
          Back to Location
        </Button>
      </div>

      {/* Profile Card */}
      <Card className="p-6">
        <div className="flex items-start gap-6">
          <Avatar name={profile.name} size="lg" />
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h1 className="text-3xl font-display font-bold text-foreground">
                  {profile.name}
                </h1>
                <p className="text-lg text-primary font-medium">{profile.tradeType}</p>
              </div>
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full ${
                  profile.isAvailable
                    ? "bg-green-500/15 text-green-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {profile.isAvailable ? "Available" : "Off Duty"}
              </span>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              {profile.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-primary shrink-0" />
                  <a href={`tel:${profile.phone}`} className="hover:text-primary transition-colors">
                    {profile.phone}
                  </a>
                </div>
              )}
              {profile.email && (
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-primary shrink-0" />
                  <a
                    href={`mailto:${profile.email}`}
                    className="hover:text-primary transition-colors truncate"
                  >
                    {profile.email}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={DollarSign}
          label="Hourly Rate"
          value={
            profile.hourlyRate ? `$${profile.hourlyRate.toFixed(2)}/hour` : "Not set"
          }
        />
        <StatCard
          icon={Clock}
          label="Max Weekly Hours"
          value={profile.maxWeeklyHours ? `${profile.maxWeeklyHours} hours` : "Not set"}
        />
        <StatCard icon={Award} label="Trade Type" value={profile.tradeType} />
        <StatCard
          icon={Clock}
          label="Member Since"
          value={formatDate(profile.createdAt)}
        />
      </div>

      {/* Skills */}
      {profile.skills && profile.skills.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
            <Award size={18} className="text-primary" />
            Skills & Licences
          </h2>
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <span
                key={skill}
                className="text-sm bg-primary/15 text-primary px-3 py-1 rounded-full font-medium"
              >
                {skill}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Jobs */}
      {jobs.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-display font-bold mb-4">Recent Jobs</h2>
          <div className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="border border-border/50 rounded-lg p-4 hover:bg-card/60 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{job.title}</h3>
                    <p className="text-sm text-muted-foreground">{job.trade_type}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {job.status && (
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          STATUS_STYLES[job.status] || "bg-secondary text-foreground"
                        }`}
                      >
                        {STATUS_LABELS[job.status] || job.status}
                      </span>
                    )}
                    {job.priority && (
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          PRIORITY_STYLES[job.priority] || "bg-secondary text-foreground"
                        }`}
                      >
                        {PRIORITY_LABELS[job.priority] || job.priority}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  {job.scheduled_date && (
                    <div>
                      <p className="font-medium text-foreground">Scheduled</p>
                      <p>{formatDate(job.scheduled_date)}</p>
                    </div>
                  )}
                  {job.price && (
                    <div>
                      <p className="font-medium text-foreground">Price</p>
                      <p>${job.price.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
