import { useState, useEffect } from "react";
import { useListWorkers } from "@/lib/api-client";
import type { LeaveRequest } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, CalendarDays, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: "Sick Leave", annual: "Annual Leave", training: "Training",
  personal: "Personal", other: "Other",
};

const LEAVE_STATUS_STYLES: Record<string, string> = {
  pending:  "bg-yellow-500/10 border-yellow-500/30",
  approved: "bg-green-500/10  border-green-500/30",
  denied:   "bg-destructive/10 border-destructive/30",
};

const STATUS_LABEL_STYLES: Record<string, string> = {
  pending:  "text-yellow-400",
  approved: "text-green-400",
  denied:   "text-destructive",
};

export function LeavePage() {
  const { data: workers = [] } = useListWorkers();
  const [requests, setRequests]   = useState<LeaveRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [adminNote, setAdminNote] = useState<Record<number, string>>({});
  const [filter, setFilter]       = useState<"all" | "pending" | "approved" | "denied">("pending");

  const workerName = (id: number) =>
    workers.find(w => w.id === id)?.name ?? `Worker #${id}`;

  const load = () => {
    setLoading(true);
    fetch("/api/leave", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: LeaveRequest[]) => {
        // Newest first, pending on top
        setRequests(
          data.sort((a, b) => {
            if (a.status === "pending" && b.status !== "pending") return -1;
            if (a.status !== "pending" && b.status === "pending") return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          })
        );
      })
      .catch(() => toast.error("Failed to load leave requests"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handle = async (id: number, status: "approved" | "denied") => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, adminNote: adminNote[id] || null }),
      });
      if (!res.ok) throw new Error();
      toast.success(status === "approved" ? "Leave approved" : "Leave denied");
      load();
    } catch {
      toast.error("Failed to update leave request");
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);
  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground">Leave Requests</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Review and action worker leave requests.
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded-lg px-4 py-2 text-sm font-semibold">
            <Clock size={15} />
            {pendingCount} pending
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["pending", "all", "approved", "denied"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-display uppercase tracking-wider border transition-all ${
              filter === f
                ? "bg-primary text-black border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 bg-yellow-500 text-black rounded-full px-1.5 py-0.5 text-[10px]">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="min-h-[calc(100vh-16rem)] flex items-center justify-center text-muted-foreground">
          <Loader2 className="animate-spin w-6 h-6 mr-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground bg-card/30 rounded-xl border border-dashed border-white/10">
          <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-display uppercase">No {filter === "all" ? "" : filter} requests</h3>
          <p className="text-sm mt-1">
            {filter === "pending" ? "All caught up — no pending leave requests." : "Nothing to show here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <Card
              key={r.id}
              className={`p-4 border ${LEAVE_STATUS_STYLES[r.status]} bg-card`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                {/* Info */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-foreground text-base">
                      {workerName(r.workerId)}
                    </span>
                    <span className="text-xs bg-secondary rounded-full px-2 py-0.5 text-muted-foreground">
                      {LEAVE_TYPE_LABELS[r.leaveType]}
                    </span>
                    <span className={`text-xs font-semibold capitalize ${STATUS_LABEL_STYLES[r.status]}`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}
                    {r.startTime ? ` · ${r.startTime}–${r.endTime}` : ""}
                  </p>
                  {r.reason && (
                    <p className="text-sm italic text-muted-foreground">"{r.reason}"</p>
                  )}
                  {r.adminNote && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">Note:</span> {r.adminNote}
                    </p>
                  )}
                </div>

                {/* Actions — pending only */}
                {r.status === "pending" && (
                  <div className="flex flex-col gap-2 sm:items-end shrink-0 min-w-[180px]">
                    <Input
                      placeholder="Note for worker (optional)"
                      value={adminNote[r.id] ?? ""}
                      onChange={e => setAdminNote(n => ({ ...n, [r.id]: e.target.value }))}
                      className="text-xs h-8"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-500 text-white"
                        disabled={processingId === r.id}
                        onClick={() => handle(r.id, "approved")}
                      >
                        {processingId === r.id ? (
                          <Loader2 size={13} className="animate-spin mr-1" />
                        ) : (
                          <CheckCircle2 size={13} className="mr-1" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={processingId === r.id}
                        onClick={() => handle(r.id, "denied")}
                      >
                        {processingId === r.id ? (
                          <Loader2 size={13} className="animate-spin mr-1" />
                        ) : (
                          <XCircle size={13} className="mr-1" />
                        )}
                        Decline
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
