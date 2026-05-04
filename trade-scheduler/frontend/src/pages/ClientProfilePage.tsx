import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, Mail, MapPin, Briefcase, DollarSign, Calendar, Clock } from "lucide-react";
import { toast } from "sonner";

interface ClientJob {
  id:             number;
  title:          string;
  job_type:       string;
  status:         string;
  priority:       string;
  price:          number;
  scheduled_date: string | null;
  address:        string;
  trade_type:     string;
  created_at:     string;
}

interface ClientProfile {
  clientId:    number;
  clientName:  string;
  clientPhone: string | null;
  clientEmail: string | null;
  address:     string;
  jobCount:    number;
  lastJobDate: string | null;
  firstJobDate: string | null;
  totalRevenue: number;
  jobs:         ClientJob[];
}

const STATUS_STYLES: Record<string, string> = {
  pending:     "bg-yellow-500/15 text-yellow-400",
  confirmed:   "bg-blue-500/15 text-blue-400",
  in_progress: "bg-primary/15 text-primary",
  completed:   "bg-green-500/15 text-green-400",
  cancelled:   "bg-red-500/15 text-red-400",
  bumped:      "bg-purple-500/15 text-purple-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending:     "Pending",
  confirmed:   "Confirmed",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
  bumped:      "Bumped",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-secondary/40 rounded-xl p-4 border border-border/50 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
        <Icon size={16} className="text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-display uppercase tracking-wider">{label}</p>
        <p className="font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function ClientProfilePage() {
  const [, navigate] = useLocation();
  const params = useParams<{ clientId: string }>();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.clientId) return;
    fetch(`/api/clients/${params.clientId}`, { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setProfile)
      .catch(() => toast.error("Failed to load client profile"))
      .finally(() => setLoading(false));
  }, [params.clientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/clients")}>
          <ArrowLeft size={14} className="mr-1.5" /> Back to Clients
        </Button>
        <p className="text-muted-foreground">Client not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/clients")} className="-ml-2">
        <ArrowLeft size={14} className="mr-1.5" /> Back to Clients
      </Button>

      {/* Client header */}
      <Card className="p-6 bg-card border-white/5 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">{profile.clientName}</h1>
            <div className="mt-3 space-y-1.5">
              {profile.clientPhone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone size={13} className="text-primary shrink-0" />
                  {profile.clientPhone}
                </div>
              )}
              {profile.clientEmail && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail size={13} className="text-primary shrink-0" />
                  {profile.clientEmail}
                </div>
              )}
              {profile.address && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin size={13} className="text-primary shrink-0" />
                  {profile.address}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <StatCard icon={Briefcase}   label="Total Jobs"    value={String(profile.jobCount)} />
          <StatCard icon={DollarSign}  label="Total Revenue" value={`$${profile.totalRevenue.toFixed(2)}`} />
          <StatCard icon={Calendar}    label="First Job"     value={formatDate(profile.firstJobDate)} />
          <StatCard icon={Clock}       label="Last Job"      value={formatDate(profile.lastJobDate)} />
        </div>
      </Card>

      {/* Job history */}
      <div>
        <h2 className="text-xl font-display font-bold text-foreground mb-3">
          Job History <span className="text-muted-foreground font-normal text-base">({profile.jobCount})</span>
        </h2>

        <Card className="bg-card border-white/5 shadow-2xl overflow-hidden">
          {profile.jobs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No jobs found.</div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left px-5 py-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Title</th>
                      <th className="text-left px-5 py-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Type</th>
                      <th className="text-left px-5 py-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="text-left px-5 py-3 font-display text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Trade</th>
                      <th className="text-right px-5 py-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Price</th>
                      <th className="text-left px-5 py-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.jobs.map((j, i) => (
                      <tr
                        key={j.id}
                        className={`border-b border-border/50 ${i % 2 === 0 ? "bg-background/20" : ""}`}
                      >
                        <td className="px-5 py-3.5 font-medium text-foreground">{j.title}</td>
                        <td className="px-5 py-3.5 text-muted-foreground capitalize">{j.job_type}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[j.status] ?? "bg-secondary text-muted-foreground"}`}>
                            {STATUS_LABELS[j.status] ?? j.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground hidden lg:table-cell">{j.trade_type}</td>
                        <td className="px-5 py-3.5 text-right font-semibold text-foreground">${j.price.toFixed(2)}</td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs">
                          {j.scheduled_date ? formatDate(j.scheduled_date) : formatDate(j.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-border/50">
                {profile.jobs.map(j => (
                  <div key={j.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{j.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{j.trade_type} · {j.job_type}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold text-foreground">${j.price.toFixed(2)}</p>
                        <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold mt-1 ${STATUS_STYLES[j.status] ?? "bg-secondary text-muted-foreground"}`}>
                          {STATUS_LABELS[j.status] ?? j.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {j.scheduled_date ? formatDate(j.scheduled_date) : formatDate(j.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
