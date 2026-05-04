import { Job, Worker, useDeleteJob, useTriggerEmergency, useConvertToBooking, useUpdateJob } from "@/lib/api-client";
import type { UserRole } from "@/App";
import { formatAUD, formatAusDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin, Phone, Mail, Clock, Calendar, Users, AlertTriangle, FileText,
  Check, Trash2, Edit2, CheckCircle2, Car, XCircle, ImagePlus, X, Loader2, Images, Save,
  ShieldCheck, Navigation, MapPinned, LogIn, Timer,
} from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useRef, useState } from "react";
import { JobForm } from "./JobForm";
import { toast } from "sonner";

// ── Validity code descriptions ────────────────────────────────────────────────

const VALIDITY_LABELS: Record<number, { label: string; description: string }> = {
  1: { label: "Low", description: "Low-value or low-priority job" },
  2: { label: "Standard", description: "Normal priority job" },
  3: { label: "High", description: "High-value or urgent client" },
};

// ── Confirmation Dialog ───────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  variant = "default",
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
  isPending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => { onConfirm(); onOpenChange(false); }}
            disabled={isPending}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── WorkerDistanceList ────────────────────────────────────────────────────────

interface WorkerDistanceEntry {
  workerId: number;
  name: string;
  suburb: string | null;
  lastSeenAt: string | null;
  lastAction: string | null;
  distanceKm: number | null;
  durationMinutes: number | null;
}

function WorkerDistanceList({ jobId, workers }: { jobId: number; workers: Worker[] }) {
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: distances, isLoading } = useQuery<WorkerDistanceEntry[]>({
    queryKey: ["worker-distances", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/worker-distances`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60_000,
    enabled: workers.length > 0,
  });

  if (workers.length === 0) return null;

  const merged = workers.map(w => {
    const d = distances?.find(x => x.workerId === w.id);
    return { ...w, distanceKm: d?.distanceKm ?? null, durationMinutes: d?.durationMinutes ?? null, suburb: d?.suburb ?? null };
  });

  const hasAnyDistance = merged.some(w => w.distanceKm !== null);

  const sorted = [...merged].sort((a, b) => {
    const da = a.distanceKm ?? (sortDir === "asc" ? Infinity : -Infinity);
    const db = b.distanceKm ?? (sortDir === "asc" ? Infinity : -Infinity);
    return sortDir === "asc" ? da - db : db - da;
  });

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-display">Assigned Workers</span>
        {hasAnyDistance && (
          <button
            onClick={() => setSortDir(s => s === "asc" ? "desc" : "asc")}
            className="flex items-center gap-0.5 text-[10px] text-primary hover:underline"
          >
            <Navigation size={9} />
            {sortDir === "asc" ? "Closest first" : "Furthest first"}
          </button>
        )}
      </div>
      {sorted.map(w => (
        <div key={w.id} className="flex items-center justify-between bg-secondary/50 rounded px-2 py-1.5 gap-2">
          <span className="text-xs font-bold truncate">{w.name}</span>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
            {isLoading ? (
              <Loader2 size={10} className="animate-spin" />
            ) : w.distanceKm !== null ? (
              <>
                <span className="text-orange-400 font-semibold">{w.distanceKm} km</span>
                {w.durationMinutes !== null && <span>~{w.durationMinutes} min</span>}
              </>
            ) : (
              <span className="opacity-40">No location</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── JobPhotos ─────────────────────────────────────────────────────────────────

function JobPhotos({ job, canEdit, noBorder }: { job: Job; canEdit: boolean; noBorder?: boolean }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`/api/jobs/${job.id}/images`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast.success("Photo uploaded");
    } catch (err: any) {
      toast.error("Upload failed", { description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (url: string) => {
    setDeletingUrl(url);
    try {
      const res = await fetch(`/api/jobs/${job.id}/images`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("Delete failed");
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast.success("Photo removed");
    } catch {
      toast.error("Failed to remove photo");
    } finally {
      setDeletingUrl(null);
    }
  };

  const images: string[] = job.imageUrls ?? [];

  if (!canEdit && images.length === 0) return null;

  return (
    <div className={noBorder ? "" : "mt-4 pt-4 border-t border-border"}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase text-muted-foreground font-semibold flex items-center gap-1.5">
          <Images size={13} /> Photos {images.length > 0 && `(${images.length})`}
        </span>
        {canEdit && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={12} className="animate-spin mr-1" /> : <ImagePlus size={12} className="mr-1" />}
              {uploading ? "Uploading..." : "Add Photo"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}
      </div>

      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images.map(url => (
            <div key={url} className="relative group">
              <img
                src={url}
                alt="Job photo"
                className="w-20 h-20 object-cover rounded-lg border border-border cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setLightbox(url)}
              />
              {canEdit && (
                <button
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                  onClick={() => handleDelete(url)}
                  disabled={deletingUrl === url}
                >
                  {deletingUrl === url
                    ? <Loader2 size={10} className="animate-spin" />
                    : <X size={10} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
          <DialogContent className="max-w-3xl p-2 bg-black/90 border-white/10">
            <DialogHeader className="sr-only">
              <DialogTitle>Photo</DialogTitle>
            </DialogHeader>
            <img src={lightbox} alt="Job photo" className="w-full max-h-[80vh] object-contain rounded" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── WorkerNotes ───────────────────────────────────────────────────────────────

function WorkerNotes({ job }: { job: Job }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(job.notes ?? "");
  const [saving, setSaving] = useState(false);
  const isDirty = notes !== (job.notes ?? "");

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast.success("Notes saved");
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground font-semibold flex items-center gap-1.5 mb-2">
        <FileText size={13} /> Notes
      </p>
      <textarea
        className="w-full text-sm bg-secondary/30 border border-white/10 rounded-lg p-2.5 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[80px]"
        placeholder="Add notes about this job..."
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      {isDirty && (
        <div className="flex justify-end mt-1.5">
          <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={11} className="animate-spin mr-1" /> : <Save size={11} className="mr-1" />}
            Save Notes
          </Button>
        </div>
      )}
    </div>
  );
}

// ── TimeAttendance panel ──────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; next: string | null; color: string }> = {
  clock_in:    { label: "Clocked In",   icon: <LogIn size={11} />,        next: "en_route",    color: "text-blue-400" },
  en_route:    { label: "En Route",     icon: <Navigation size={11} />,   next: "on_site",     color: "text-cyan-400" },
  on_site:     { label: "On Site",      icon: <MapPinned size={11} />,    next: null,           color: "text-green-400" },
  complete:    { label: "Completed",    icon: <CheckCircle2 size={11} />, next: null,           color: "text-green-400" },
};

const NEXT_BUTTON: Record<string, { label: string; action: string }> = {
  clock_in:    { label: "En Route",    action: "en_route" },
  en_route:    { label: "On Site",     action: "on_site" },
};

function fmtTs(iso: string) {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// Actions that require a confirmation dialog before being logged
const START_ACTIONS = new Set(["clock_in"]);

function TimeAttendancePanel({
  job,
  userRole,
  currentWorkerId,
}: {
  job: Job;
  userRole: UserRole;
  currentWorkerId?: number | null;
}) {
  const queryClient = useQueryClient();
  const [logging, setLogging] = useState<string | null>(null);
  const [pendingStartAction, setPendingStartAction] = useState<string | null>(null);

  const attendance = job.attendance ?? [];

  const getCoords = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 6000, maximumAge: 60000 },
      );
    });

  const logAction = async (action: string, workerId?: number) => {
    setLogging(action);
    try {
      const body: Record<string, unknown> = { action };
      if (workerId !== undefined) body.workerId = workerId;
      const coords = await getCoords();
      if (coords) { body.lat = coords.lat; body.lng = coords.lng; }
      const res = await fetch(`/api/jobs/${job.id}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast.success(`Logged: ${ACTION_META[action]?.label ?? action}`);
    } catch {
      toast.error("Failed to log attendance event");
    } finally {
      setLogging(null);
    }
  };

  // Route an action through the confirmation dialog if it's a "start" action
  const handleAction = (action: string) => {
    if (START_ACTIONS.has(action)) {
      setPendingStartAction(action);
    } else {
      logAction(action);
    }
  };

  // ── Worker view: show their own status + next action button ──────────────
  if (userRole === "worker" && currentWorkerId) {
    const myEvents = attendance
      .filter(e => e.workerId === currentWorkerId)
      .sort((a, b) => a.ts.localeCompare(b.ts));

    const latest = myEvents[myEvents.length - 1];
    const latestAction = latest?.action ?? null;

    if (latestAction === "complete") {
      return (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs flex items-center gap-1.5 text-green-400 font-semibold">
            <CheckCircle2 size={13} /> Completed at {fmtTs(latest.ts)}
          </p>
        </div>
      );
    }

    const nextBtn = latestAction ? NEXT_BUTTON[latestAction] : null;

    return (
      <>
        <ConfirmDialog
          open={pendingStartAction !== null}
          onOpenChange={(open) => { if (!open) setPendingStartAction(null); }}
          title="Start job?"
          description={`You are about to start working on "${job.title}". Ready to begin?`}
          confirmLabel="Start Job"
          onConfirm={() => {
            if (pendingStartAction) logAction(pendingStartAction);
            setPendingStartAction(null);
          }}
        />

        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <p className="text-[10px] uppercase font-display tracking-widest text-muted-foreground flex items-center gap-1">
            <Timer size={10} /> Time & Attendance
          </p>
          <div className="flex flex-wrap gap-2">
            {latestAction === null ? (
              <Button size="sm" variant="outline" className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                disabled={!!logging} onClick={() => handleAction("clock_in")}>
                {logging === "clock_in" ? <Loader2 size={12} className="animate-spin mr-1" /> : <LogIn size={12} className="mr-1" />}
                Clock In
              </Button>
            ) : nextBtn ? (
              <Button
                size="sm"
                variant="outline"
                className="border-primary/50 text-primary hover:bg-primary/10"
                disabled={!!logging}
                onClick={() => handleAction(nextBtn.action)}
              >
                {logging === nextBtn.action
                  ? <Loader2 size={12} className="animate-spin mr-1" />
                  : ACTION_META[nextBtn.action]?.icon && (
                      <span className="mr-1">{ACTION_META[nextBtn.action].icon}</span>
                    )
                }
                {nextBtn.label}
              </Button>
            ) : null}

            {latestAction === "on_site" && (
              <Button size="sm" variant="outline" className="border-green-500/50 text-green-400 hover:bg-green-500/10"
                disabled={!!logging} onClick={() => logAction("complete")}>
                {logging === "complete" ? <Loader2 size={12} className="animate-spin mr-1" /> : <CheckCircle2 size={12} className="mr-1" />}
                Complete
              </Button>
            )}
          </div>

          {myEvents.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {myEvents.map((e, i) => (
                <span key={i} className={`flex items-center gap-0.5 text-[10px] ${ACTION_META[e.action]?.color ?? "text-muted-foreground"}`}>
                  {ACTION_META[e.action]?.icon}
                  {fmtTs(e.ts)}
                  {i < myEvents.length - 1 && <span className="ml-1 text-muted-foreground">→</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }


  // ── Admin view: full timeline per worker ─────────────────────────────────
  if (userRole === "admin" && attendance.length > 0) {
    const workerMap: Record<number, string> = {};
    (job.assignedWorkers ?? []).forEach(w => { workerMap[w.id] = w.name; });

    // Group by worker
    const byWorker: Record<number, typeof attendance> = {};
    attendance.forEach(e => {
      if (!byWorker[e.workerId]) byWorker[e.workerId] = [];
      byWorker[e.workerId].push(e);
    });

    return (
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-[10px] uppercase font-display tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
          <Timer size={10} /> Attendance Log
        </p>
        <div className="space-y-2">
          {Object.entries(byWorker).map(([wid, events]) => {
            const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
            return (
              <div key={wid}>
                <p className="text-xs font-semibold text-foreground mb-1">
                  {workerMap[Number(wid)] ?? `Worker #${wid}`}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {sorted.map((e, i) => (
                    <span key={i} className={`flex items-center gap-0.5 text-[10px] ${ACTION_META[e.action]?.color ?? "text-muted-foreground"}`}>
                      {ACTION_META[e.action]?.icon}
                      <span className="font-medium">{ACTION_META[e.action]?.label ?? e.action}</span>
                      <span className="text-muted-foreground ml-0.5">{fmtTs(e.ts)}</span>
                      {i < sorted.length - 1 && <span className="ml-1 text-muted-foreground">→</span>}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}

// ── JobCard ───────────────────────────────────────────────────────────────────

export function JobCard({ job, userRole = "admin" }: { job: Job; userRole?: UserRole }) {
  const queryClient = useQueryClient();
  const currentWorkerId = userRole === "worker"
    ? parseInt(sessionStorage.getItem("ts2_worker_id") ?? "", 10) || null
    : null;
  const [editOpen, setEditOpen] = useState(false);
  const [completedNotesOpen, setCompletedNotesOpen] = useState(false);
  const [extraNotes, setExtraNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [emergencyConfirmOpen, setEmergencyConfirmOpen] = useState(false);
  const [resolveEmergencyOpen, setResolveEmergencyOpen] = useState(false);

  const deleteMutation = useDeleteJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        toast.success("Job deleted", { description: `"${job.title}" has been permanently removed.` });
      },
      onError: () => toast.error("Failed to delete job", { description: "Please try again." }),
    },
  });

  const emergencyMutation = useTriggerEmergency({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        toast.success("CODE 9 EMERGENCY activated!", {
          description: `${data.bumpedCount} other booking(s) have been bumped.`,
        });
      },
      onError: () => toast.error("Failed to trigger emergency"),
    },
  });

  const convertMutation = useConvertToBooking({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        toast.success("Converted to booking!", { description: `"${job.title}" is now a confirmed booking.` });
      },
      onError: () => toast.error("Failed to convert to booking"),
    },
  });

  const completeMutation = useUpdateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        toast.success("Job marked as complete!", {
          description: `"${job.title}" — Invoice has been generated.`,
        });
      },
      onError: () => toast.error("Failed to mark as complete"),
    },
  });

  const resolveEmergencyMutation = useUpdateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        toast.success("Emergency resolved", { description: `"${job.title}" returned to normal status.` });
      },
      onError: () => toast.error("Failed to resolve emergency"),
    },
  });

  const cancelMutation = useUpdateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        toast.success("Job cancelled", { description: `"${job.title}" has been cancelled.` });
      },
      onError: () => toast.error("Failed to cancel job"),
    },
  });

  const isQuote = job.jobType === "quote";
  const isCompleted = job.status === "completed";
  const isCancelled = job.status === "cancelled";
  const validity = VALIDITY_LABELS[job.validityCode] || VALIDITY_LABELS[2];

  return (
    <>
      <Card
        className={`relative overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 ${
          job.isEmergency
            ? "border-destructive/50 shadow-[0_0_30px_rgba(239,68,68,0.2)]"
            : isCompleted
            ? "border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.1)]"
            : "border-white/5 hover:border-white/10"
        }`}
      >
        {/* Top Banners */}
        {job.isEmergency && (
          <div className="bg-destructive text-destructive-foreground font-display font-bold uppercase text-center py-1.5 text-xs sm:text-sm emergency-pulse tracking-widest flex items-center justify-center gap-2">
            <AlertTriangle size={14} /> CODE 9 EMERGENCY
          </div>
        )}
        {isCompleted && (
          <div className="bg-green-600 text-white font-display font-bold uppercase text-center py-1.5 text-xs sm:text-sm tracking-widest flex items-center justify-center gap-2">
            <CheckCircle2 size={14} /> JOB COMPLETED
          </div>
        )}
        {!isQuote && !isCompleted && !isCancelled && job.assignedWorkers.length === 0 && (
          <div className="bg-blue-600 text-white font-display font-bold uppercase text-center py-1.5 text-xs sm:text-sm tracking-widest flex items-center justify-center gap-2">
            <Users size={14} /> Attention: Assign Worker
          </div>
        )}

        <div className="p-4 sm:p-5">
          {/* Title / Price row — constrained so neither overflows */}
          <div className="flex items-start gap-3 mb-4 min-w-0">
            <div className="flex-1 min-w-0">
              <div className="flex gap-1.5 items-center mb-2 flex-wrap">
                <Badge variant={job.jobType === "quote" ? "secondary" : "default"}>
                  {job.jobType}
                </Badge>
                {/* Validity code badge with tooltip */}
                <div className="group relative">
                  <Badge variant={`validity${job.validityCode}` as any} className="cursor-help">
                    Code {job.validityCode}
                  </Badge>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-44 sm:w-48 p-2 rounded-lg bg-popover border border-border shadow-lg text-xs text-popover-foreground">
                    <span className="font-semibold">{validity.label} Priority:</span> {validity.description}
                  </div>
                </div>
                <Badge variant={job.status as any}>{job.status.replace("_", " ")}</Badge>
              </div>
              <h3 className="font-display text-lg sm:text-2xl font-bold text-foreground leading-tight break-words">
                {job.title}
              </h3>
              <p className="text-primary font-semibold text-sm">{job.tradeType}</p>
            </div>

            <div className="text-right shrink-0">
              <div className="font-display text-xl sm:text-2xl font-bold text-foreground whitespace-nowrap">
                {formatAUD(job.price)}
              </div>
              {job.smartScore !== null && job.smartScore !== undefined && (
                <div className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded mt-1">
                  Score: {job.smartScore.toFixed(2)}
                </div>
              )}
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-muted-foreground mt-2">
            {/* Left column */}
            <div className="space-y-2 min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                <MapPin size={15} className="text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-foreground block break-words">{job.address}</span>
                  {job.distanceKm !== null && job.distanceKm !== undefined && (
                    <span className="text-xs text-orange-400">{job.distanceKm} km away</span>
                  )}
                </div>
              </div>
              {job.travelTimeMinutes !== null && job.travelTimeMinutes !== undefined && (
                <div className="flex items-center gap-2">
                  <Car size={15} className="text-primary shrink-0" />
                  <span className="text-xs">~{job.travelTimeMinutes} min travel</span>
                </div>
              )}
              <div className="flex items-center gap-2 min-w-0">
                <Users size={15} className="text-primary shrink-0" />
                <span className="text-foreground truncate">{job.clientName}</span>
              </div>
              {job.clientPhone && (
                <div className="flex items-center gap-2 min-w-0">
                  <Phone size={15} className="text-primary shrink-0" />
                  <a href={`tel:${job.clientPhone}`} className="hover:text-primary transition-colors truncate">
                    {job.clientPhone}
                  </a>
                </div>
              )}
              {job.clientEmail && (
                <div className="flex items-center gap-2 min-w-0">
                  <Mail size={15} className="text-primary shrink-0" />
                  <a href={`mailto:${job.clientEmail}`} className="truncate hover:text-primary transition-colors text-xs sm:text-sm">
                    {job.clientEmail}
                  </a>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-primary shrink-0" />
                <span>{formatAusDate(job.scheduledDate)}</span>
              </div>
              {job.scheduledDate && (
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-primary shrink-0" />
                  <span>
                    {new Date(job.scheduledDate).toLocaleTimeString("en-AU", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-primary shrink-0" />
                <span>{job.estimatedHours} hrs est.</span>
              </div>
              {!isQuote && (
                <>
                  <div className="flex items-center gap-2">
                    <Users size={15} className="text-primary shrink-0" />
                    <span>{job.numTradies} Tradies Req.</span>
                  </div>
                  {userRole === "admin" ? (
                    <WorkerDistanceList jobId={job.id} workers={job.assignedWorkers ?? []} />
                  ) : (
                    job.assignedWorkers && job.assignedWorkers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {job.assignedWorkers.map((w: Worker) => (
                          <span key={w.id} className="text-[10px] bg-secondary px-2 py-0.5 rounded text-foreground">
                            {w.name}
                          </span>
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </div>

          {/* Required skills / licences */}
          {(job.requiredSkills ?? []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] uppercase font-display tracking-widest text-muted-foreground flex items-center gap-1 mr-1">
                <ShieldCheck size={10} /> Required
              </span>
              {(job.requiredSkills ?? []).map(s => (
                <span key={s} className="flex items-center gap-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Notes preview — admin only; workers get an editable notes field below */}
          {userRole === "admin" && job.notes && (
            <div className="mt-4 p-3 bg-secondary/30 rounded-lg border border-white/5">
              <p className="text-xs text-muted-foreground line-clamp-2 break-words">{job.notes}</p>
            </div>
          )}

          {/* Time & Attendance */}
          {!isQuote && !isCancelled && (
            <TimeAttendancePanel job={job} userRole={userRole} currentWorkerId={currentWorkerId} />
          )}

          {/* Notes + Photos — stacked rows for workers, photos-only for admins */}
          {userRole === "worker" && !isCancelled ? (
            <div className="mt-4 pt-4 border-t border-border space-y-4">
              <WorkerNotes job={job} />
              <JobPhotos job={job} canEdit={true} noBorder />
            </div>
          ) : (
            <JobPhotos job={job} canEdit={!isCancelled} />
          )}

          {/* Actions Footer */}
          <div className="mt-4 sm:mt-6 pt-4 border-t border-border space-y-2">
            {/* Row 1: Edit / Delete */}
            {userRole === "admin" && (
              <div className="flex gap-2">
                {!isCompleted && (
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    <Edit2 size={13} className="mr-1" /> Edit
                  </Button>
                )}
                {isCompleted && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-500/50 text-green-400 hover:bg-green-500/10"
                    onClick={() => {
                      setExtraNotes(job.notes ?? "");
                      setCompletedNotesOpen(true);
                    }}
                  >
                    <Edit2 size={13} className="mr-1" /> Notes & Photos
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            )}

            {/* Row 2: Complete / Cancel  |  Convert (quotes) */}
            {(isQuote && userRole === "admin") || (!isQuote && !isCompleted && !isCancelled) ? (
              <>
                <div className="border-t border-border" />
                <div className="flex flex-wrap gap-2">
                  {isQuote && userRole === "admin" && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => convertMutation.mutate({ id: job.id, data: { estimatedHours: job.estimatedHours || 1 } })}
                      disabled={convertMutation.isPending}
                    >
                      <Check size={13} className="mr-1" /> Convert
                    </Button>
                  )}
                  {!isQuote && !isCompleted && !isCancelled && (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-green-600 hover:bg-green-700 text-white font-bold"
                        onClick={() => setCompleteConfirmOpen(true)}
                        disabled={completeMutation.isPending}
                      >
                        <CheckCircle2 size={13} className="mr-1" /> Complete
                      </Button>
                      {userRole === "admin" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-gray-500 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                          onClick={() => setCancelConfirmOpen(true)}
                          disabled={cancelMutation.isPending}
                        >
                          <XCircle size={13} className="mr-1" /> Cancel
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </>
            ) : null}

            {/* Row 3: Code 9 / Resolve */}
            {userRole === "admin" && !isQuote && !isCompleted && !isCancelled && (
              <>
                <div className="border-t border-border" />
                <div className="flex gap-2">
                  {!job.isEmergency && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="bg-red-600 hover:bg-red-700 font-bold"
                      onClick={() => setEmergencyConfirmOpen(true)}
                      disabled={emergencyMutation.isPending}
                    >
                      <AlertTriangle size={13} className="mr-1" /> CODE 9
                    </Button>
                  )}
                  {job.isEmergency && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-orange-500 text-orange-400 hover:bg-orange-500/20 font-bold"
                      onClick={() => setResolveEmergencyOpen(true)}
                      disabled={resolveEmergencyMutation.isPending}
                    >
                      <AlertTriangle size={13} className="mr-1" /> Resolve
                    </Button>
                  )}
                </div>
              </>
            )}

            {/* Invoice — completed jobs only */}
            {isCompleted && (
              <>
                <div className="border-t border-border" />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const res = await fetch(`/api/jobs/${job.id}/invoice?format=pdf`);
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank");
                      setTimeout(() => URL.revokeObjectURL(url), 10000);
                    }}
                  >
                    <FileText size={13} className="mr-1" /> Invoice
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent
            className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto"
            onInteractOutside={(e) => {
              if ((e.target as Element).closest?.(".pac-container")) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit Job #{job.id}</DialogTitle>
              <DialogDescription>Update the details for this job.</DialogDescription>
            </DialogHeader>
            <JobForm initialData={job} onSuccess={() => setEditOpen(false)} />
          </DialogContent>
        </Dialog>

        {/* Completed Job — Notes & Photos Dialog */}
        <Dialog open={completedNotesOpen} onOpenChange={setCompletedNotesOpen}>
          <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-400">
                <CheckCircle2 size={18} /> Job #{job.id} — Completed
              </DialogTitle>
              <DialogDescription>
                This job is completed. You can add extra notes and photos for the invoice record.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Notes */}
              <div>
                <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">
                  Additional Notes
                </label>
                <textarea
                  className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-primary outline-none"
                  rows={4}
                  maxLength={500}
                  placeholder="Add any extra notes for the invoice (optional)…"
                  value={extraNotes}
                  onChange={e => setExtraNotes(e.target.value)}
                />
                <p className="text-xs text-muted-foreground text-right">{extraNotes.length}/500</p>
              </div>

              {/* Photos */}
              <JobPhotos job={job} canEdit={true} />
            </div>

            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCompletedNotesOpen(false)} disabled={savingNotes}>
                Cancel
              </Button>
              <Button
                disabled={savingNotes}
                onClick={async () => {
                  setSavingNotes(true);
                  try {
                    const res = await fetch(`/api/jobs/${job.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ notes: extraNotes }),
                    });
                    if (!res.ok) throw new Error("Failed to save");
                    queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
                    toast.success("Notes saved");
                    setCompletedNotesOpen(false);
                  } catch {
                    toast.error("Failed to save notes");
                  } finally {
                    setSavingNotes(false);
                  }
                }}
              >
                {savingNotes ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />}
                Save Notes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Job"
        description={`Are you sure you want to permanently delete "${job.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate({ id: job.id })}
      />
      <ConfirmDialog
        open={completeConfirmOpen}
        onOpenChange={setCompleteConfirmOpen}
        title="Mark Job as Complete"
        description={`Mark "${job.title}" as completed? An invoice will be generated and an SMS notification will be sent to the client.`}
        confirmLabel="Mark Complete"
        isPending={completeMutation.isPending}
        onConfirm={() =>
          completeMutation.mutate({ id: job.id, data: { status: "completed", completedDate: new Date().toISOString() } })
        }
      />
      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title="Cancel Job"
        description={`Are you sure you want to cancel "${job.title}"? The job will be moved to the Cancelled tab.`}
        confirmLabel="Cancel Job"
        variant="destructive"
        isPending={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate({ id: job.id, data: { status: "cancelled" } })}
      />
      <ConfirmDialog
        open={emergencyConfirmOpen}
        onOpenChange={setEmergencyConfirmOpen}
        title="Trigger CODE 9 Emergency"
        description="This will mark this job as a CODE 9 EMERGENCY and bump all other bookings scheduled for the same day. Are you absolutely sure?"
        confirmLabel="Trigger Emergency"
        variant="destructive"
        isPending={emergencyMutation.isPending}
        onConfirm={() => emergencyMutation.mutate({ id: job.id })}
      />
      <ConfirmDialog
        open={resolveEmergencyOpen}
        onOpenChange={setResolveEmergencyOpen}
        title="Resolve Code 9 Emergency"
        description={`Remove the CODE 9 status from "${job.title}"? It will return to a standard confirmed booking.`}
        confirmLabel="Resolve Emergency"
        isPending={resolveEmergencyMutation.isPending}
        onConfirm={() => resolveEmergencyMutation.mutate({ id: job.id, data: { isEmergency: false, priority: "high" } })}
      />
    </>
  );
}
