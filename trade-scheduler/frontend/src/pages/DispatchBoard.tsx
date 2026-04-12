import { useState } from "react";
import { useListJobs, useListWorkers, useUpdateJob, Job, Worker } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { format, addDays, subDays, isToday } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, AlertTriangle, Users, Clock,
  MapPin, Inbox, CheckCircle2, UserCheck, Zap, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function jobColor(job: Job): string {
  if (job.isEmergency) return "border-l-destructive bg-destructive/10";
  if (job.status === "completed") return "border-l-green-500 bg-green-500/10";
  if (job.status === "in_progress") return "border-l-blue-500 bg-blue-500/10";
  if ((job.assignedWorkerIds ?? []).length === 0) return "border-l-yellow-500 bg-yellow-500/10";
  return "border-l-primary bg-primary/5";
}

function conflictCheck(job: Job, worker: Worker, allJobs: Job[]): boolean {
  if (!job.scheduledDate) return false;
  const jStart = new Date(job.scheduledDate).getTime();
  const jEnd = jStart + (job.estimatedHours ?? 1) * 3_600_000;
  return allJobs.some(other => {
    if (other.id === job.id || !other.scheduledDate) return false;
    if (!(other.assignedWorkerIds ?? []).includes(worker.id)) return false;
    const oStart = new Date(other.scheduledDate).getTime();
    const oEnd = oStart + (other.estimatedHours ?? 1) * 3_600_000;
    return jStart < oEnd && oStart < jEnd;
  });
}

// ── Mini job chip ─────────────────────────────────────────────────────────────

function JobChip({
  job, workers, allJobs, onAssign, onUnassign,
  isDragOver, onDragOver, onDragLeave, onDrop,
}: {
  job: Job; workers: Worker[]; allJobs: Job[];
  onAssign: (jobId: number, workerId: number) => void;
  onUnassign: (jobId: number, workerId: number) => void;
  isDragOver?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={cn(
        "border-l-4 rounded-r-lg p-2 text-xs cursor-grab active:cursor-grabbing transition-all",
        jobColor(job),
        isDragOver && "ring-2 ring-primary"
      )}
      draggable
      onDragStart={e => e.dataTransfer.setData("jobId", String(job.id))}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-start justify-between gap-1 mb-0.5">
        <span className="font-semibold leading-tight line-clamp-1 flex-1">{job.title}</span>
        {job.isEmergency && <AlertTriangle size={10} className="text-destructive shrink-0 mt-0.5" />}
      </div>
      <div className="text-muted-foreground space-y-0.5">
        <div className="flex items-center gap-1"><Clock size={9} />{fmtTime(job.scheduledDate)} · {job.estimatedHours}h</div>
        <div className="flex items-center gap-1 truncate"><MapPin size={9} /><span className="truncate">{job.address}</span></div>
      </div>
      {(job.requiredSkills ?? []).length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {(job.requiredSkills ?? []).map(s => (
            <span key={s} className="flex items-center gap-0.5 text-[8px] bg-amber-500/15 border border-amber-500/30 text-amber-400 px-1 py-0.5 rounded-full">
              <ShieldCheck size={7} />{s}
            </span>
          ))}
        </div>
      )}
      {(job.assignedWorkerIds ?? []).length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {(job.assignedWorkerIds ?? []).map(wid => {
            const w = workers.find(x => x.id === wid);
            if (!w) return null;
            const conflict = conflictCheck(job, w, allJobs);
            return (
              <span
                key={wid}
                className={cn(
                  "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold",
                  conflict ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"
                )}
              >
                {conflict && <AlertTriangle size={7} />}{w.name}
                <button
                  className="ml-0.5 hover:text-destructive transition-colors"
                  onClick={e => { e.stopPropagation(); onUnassign(job.id, wid); }}
                >×</button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Dispatch Board ────────────────────────────────────────────────────────────

export function DispatchBoard() {
  const queryClient = useQueryClient();
  const { data: jobs = [] } = useListJobs();
  const { data: workers = [] } = useListWorkers();
  const updateJob = useUpdateJob({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/jobs"] }) } });

  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null); // "unassigned" | workerId

  const dayJobs = jobs.filter(j => {
    if (!j.scheduledDate) return false;
    return format(new Date(j.scheduledDate), "yyyy-MM-dd") === selectedDate
      && j.status !== "cancelled" && j.status !== "bumped";
  });

  // Unassigned = scheduled on this day with no workers assigned (bookings only; ignore quotes)
  const unassignedJobs = dayJobs.filter(j => j.jobType === "booking" && (j.assignedWorkerIds ?? []).length === 0);

  // Jobs with no scheduled date at all (backlog)
  const backlogJobs = jobs.filter(j => !j.scheduledDate && j.status !== "cancelled" && j.status !== "completed" && j.status !== "bumped");

  const assignWorker = (jobId: number, workerId: number) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    const current = job.assignedWorkerIds ?? [];
    if (current.includes(workerId)) return;

    const worker = workers.find(w => w.id === workerId);

    // Skill-enforcement check
    const required = job.requiredSkills ?? [];
    if (required.length > 0 && worker) {
      const workerSkills = worker.skills ?? [];
      const missing = required.filter(s => !workerSkills.includes(s));
      if (missing.length > 0) {
        toast.warning(
          `Licence warning — ${worker.name} is missing: ${missing.join(", ")}`,
          { description: `Required for "${job.title}". Assigned anyway — verify before dispatch.`, duration: 6000 }
        );
      }
    }

    const hasConflict = worker ? conflictCheck(job, worker, jobs) : false;
    if (hasConflict) {
      toast.warning(`${worker?.name} has a scheduling conflict on this job — assigned anyway.`);
    }

    updateJob.mutate({
      id: jobId,
      data: { assignedWorkerIds: [...current, workerId] },
    }, {
      onSuccess: () => toast.success(`${worker?.name ?? "Worker"} assigned to "${job.title}"`),
    });
  };

  const unassignWorker = (jobId: number, workerId: number) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    const updated = (job.assignedWorkerIds ?? []).filter(id => id !== workerId);
    updateJob.mutate({ id: jobId, data: { assignedWorkerIds: updated } });
  };

  const handleDrop = (e: React.DragEvent, workerId: number) => {
    e.preventDefault();
    const jobId = parseInt(e.dataTransfer.getData("jobId"), 10);
    if (!isNaN(jobId)) assignWorker(jobId, workerId);
    setDragOverTarget(null);
  };

  // Per-worker jobs on this day
  function workerJobs(worker: Worker) {
    return dayJobs.filter(j => (j.assignedWorkerIds ?? []).includes(worker.id));
  }

  function workerDayHours(worker: Worker) {
    return workerJobs(worker).reduce((s, j) => s + (j.estimatedHours ?? 0), 0);
  }

  const prevDay = () => setSelectedDate(format(subDays(new Date(selectedDate), 1), "yyyy-MM-dd"));
  const nextDay = () => setSelectedDate(format(addDays(new Date(selectedDate), 1), "yyyy-MM-dd"));

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground">Dispatch Board</h1>
          <p className="text-muted-foreground mt-1">Drag jobs onto workers to assign. Conflicts are flagged automatically.</p>
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevDay}><ChevronLeft size={15} /></Button>
          <button
            className={cn(
              "px-4 py-1.5 rounded-lg border text-sm font-display font-bold transition-colors",
              isToday(new Date(selectedDate))
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-foreground hover:bg-accent"
            )}
            onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
          >
            {isToday(new Date(selectedDate)) ? "Today" : format(new Date(selectedDate), "EEE d MMM")}
          </button>
          <Button variant="outline" size="sm" onClick={nextDay}><ChevronRight size={15} /></Button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-3 py-1.5 rounded-lg font-semibold">
          <Inbox size={12} />{unassignedJobs.length} unassigned
        </span>
        <span className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 px-3 py-1.5 rounded-lg font-semibold">
          <UserCheck size={12} />{workers.filter(w => w.isAvailable).length} / {workers.length} available
        </span>
        <span className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 text-green-400 px-3 py-1.5 rounded-lg font-semibold">
          <CheckCircle2 size={12} />{dayJobs.filter(j => j.status === "completed").length} completed today
        </span>
        {backlogJobs.length > 0 && (
          <span className="flex items-center gap-1.5 bg-secondary border border-border text-muted-foreground px-3 py-1.5 rounded-lg font-semibold">
            <Zap size={12} />{backlogJobs.length} unscheduled backlog
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* ── Left: Unassigned + Backlog ───────────────────────────── */}
        <div className="space-y-4">
          {/* Unassigned today */}
          <Card
            className={cn(
              "p-3 border-dashed transition-all min-h-[120px]",
              dragOverTarget === "unassigned" && "border-primary bg-primary/5"
            )}
            onDragOver={e => { e.preventDefault(); setDragOverTarget("unassigned"); }}
            onDragLeave={() => setDragOverTarget(null)}
            onDrop={e => { e.preventDefault(); setDragOverTarget(null); }}
          >
            <h3 className="text-[10px] uppercase font-display tracking-widest text-yellow-400 mb-2 flex items-center gap-1.5">
              <Inbox size={11} /> Unassigned Today ({unassignedJobs.length})
            </h3>
            {unassignedJobs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">All jobs assigned</p>
            ) : (
              <div className="space-y-2">
                {unassignedJobs.map(job => (
                  <JobChip key={job.id} job={job} workers={workers} allJobs={jobs}
                    onAssign={assignWorker} onUnassign={unassignWorker} />
                ))}
              </div>
            )}
          </Card>

          {/* Backlog */}
          {backlogJobs.length > 0 && (
            <Card className="p-3 border-dashed min-h-[80px]">
              <h3 className="text-[10px] uppercase font-display tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                <Zap size={11} /> Unscheduled Backlog ({backlogJobs.length})
              </h3>
              <div className="space-y-2">
                {backlogJobs.slice(0, 5).map(job => (
                  <JobChip key={job.id} job={job} workers={workers} allJobs={jobs}
                    onAssign={assignWorker} onUnassign={unassignWorker} />
                ))}
                {backlogJobs.length > 5 && (
                  <p className="text-xs text-muted-foreground">+{backlogJobs.length - 5} more…</p>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* ── Right: Worker columns ─────────────────────────────────── */}
        <div className="overflow-x-auto">
          <div className="flex gap-3 min-w-max pb-2">
            {workers.length === 0 ? (
              <p className="text-muted-foreground text-sm">No workers added yet.</p>
            ) : (
              workers.map(worker => {
                const wJobs = workerJobs(worker);
                const dayHrs = workerDayHours(worker);
                const maxDay = (worker.maxWeeklyHours ?? 38) / 5;
                const overloaded = dayHrs > maxDay;

                return (
                  <div
                    key={worker.id}
                    className={cn(
                      "w-56 shrink-0 rounded-xl border transition-all",
                      dragOverTarget === String(worker.id)
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card",
                      !worker.isAvailable && "opacity-50"
                    )}
                    onDragOver={e => { e.preventDefault(); setDragOverTarget(String(worker.id)); }}
                    onDragLeave={() => setDragOverTarget(null)}
                    onDrop={e => handleDrop(e, worker.id)}
                  >
                    {/* Worker header */}
                    <div className="p-3 border-b border-border">
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <p className="font-display font-bold text-sm truncate">{worker.name}</p>
                          <p className="text-primary text-[10px] font-semibold truncate">{worker.tradeType}</p>
                        </div>
                        <div className="shrink-0">
                          {!worker.isAvailable ? (
                            <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Off</Badge>
                          ) : overloaded ? (
                            <Badge className="text-[9px] px-1.5 py-0 bg-orange-500">Full</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-green-500 text-green-500">Free</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                          <Clock size={8} /> {dayHrs.toFixed(1)} / {maxDay.toFixed(0)}h today
                        </span>
                        {(worker.skills ?? []).length > 0 && (
                          <span className="text-[9px] text-primary">{(worker.skills ?? []).length} skills</span>
                        )}
                      </div>
                      {/* Day capacity bar */}
                      <div className="w-full h-1 bg-secondary rounded-full overflow-hidden mt-1">
                        <div
                          className={cn("h-full rounded-full", overloaded ? "bg-orange-400" : "bg-green-500")}
                          style={{ width: `${Math.min(100, (dayHrs / maxDay) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Jobs */}
                    <div className="p-2 space-y-2 min-h-[80px]">
                      {!worker.isAvailable && (
                        <p className="text-xs text-muted-foreground italic text-center py-2">Off duty — drop to override</p>
                      )}
                      {wJobs.map(job => (
                        <JobChip key={job.id} job={job} workers={workers} allJobs={jobs}
                          onAssign={assignWorker} onUnassign={unassignWorker} />
                      ))}
                      {wJobs.length === 0 && worker.isAvailable && (
                        <p className="text-[10px] text-muted-foreground/50 italic text-center py-4">Drop job here</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
