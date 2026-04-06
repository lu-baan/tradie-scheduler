import { useListJobs, useListWorkers, useUpdateJob } from "@/lib/api-client";
import {
  format,
  addDays,
  addWeeks,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isSameDay,
  isSameMonth,
  isToday,
  eachDayOfInterval,
  getHours,
  getMinutes,
} from "date-fns";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, Users, X, MapPin, Phone, CheckCircle2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { JobForm } from "@/components/jobs/JobForm";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { UserRole } from "@/App";

// ── Config ────────────────────────────────────────────────────────────────────

type ViewMode = "month" | "week" | "day";

const HOUR_START = 7;
const HOUR_END = 20;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const HOUR_H = 64;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getJobPosition(job: any): { top: number; height: number } | null {
  if (!job.scheduledDate) return null;
  const d = new Date(job.scheduledDate);
  const startHour = getHours(d) + getMinutes(d) / 60;
  const top = Math.max(0, (startHour - HOUR_START) * HOUR_H);
  const height = Math.max(HOUR_H * 0.5, (job.estimatedHours || 1) * HOUR_H);
  return { top, height };
}

function getDots(jobs: any[], date: Date): number {
  const total = jobs
    .filter(j => j.scheduledDate && isSameDay(new Date(j.scheduledDate), date))
    .reduce((s: number, j: any) => s + (j.estimatedHours || 0), 0);
  if (total === 0) return 0;
  if (total <= 2) return 1;
  if (total <= 4) return 2;
  if (total <= 6) return 3;
  return 4;
}

function getDayHours(jobs: any[], date: Date): number {
  return jobs
    .filter(j => j.scheduledDate && isSameDay(new Date(j.scheduledDate), date))
    .reduce((s: number, j: any) => s + (j.estimatedHours || 0), 0);
}

function jobColorClass(job: any): string {
  if (job.isEmergency) return "bg-destructive/25 border-destructive/50 text-foreground hover:bg-destructive/35";
  if (job.status === "completed") return "bg-green-500/20 border-green-500/30 text-foreground hover:bg-green-500/30";
  if (job.jobType === "quote") return "bg-blue-500/20 border-blue-500/30 text-foreground hover:bg-blue-500/30";
  return "bg-primary/20 border-primary/40 text-foreground hover:bg-primary/30";
}

/** Find the next free block of ≥1h in the workday */
function getNextFreeSlot(jobs: any[], date: Date): string | null {
  const dayJobs = jobs
    .filter(j => j.scheduledDate && isSameDay(new Date(j.scheduledDate), date))
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

  const wdStart = new Date(date);
  wdStart.setHours(HOUR_START, 0, 0, 0);
  const wdEnd = new Date(date);
  wdEnd.setHours(HOUR_END, 0, 0, 0);
  const minMs = 3_600_000;

  let cursor = wdStart.getTime();
  for (const j of dayJobs) {
    const jStart = new Date(j.scheduledDate).getTime();
    const jEnd = jStart + (j.estimatedHours || 1) * 3_600_000;
    if (jStart - cursor >= minMs) return format(new Date(cursor), "h:mm a");
    if (jEnd > cursor) cursor = jEnd;
  }
  if (wdEnd.getTime() - cursor >= minMs) return format(new Date(cursor), "h:mm a");
  return null;
}

// ── Dot indicator ─────────────────────────────────────────────────────────────

function JobDots({ count, active = false }: { count: number; active?: boolean }) {
  return (
    <div className="flex gap-0.5 justify-center mt-0.5">
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className={cn(
            "w-1 h-1 rounded-full transition-colors",
            i < count
              ? active ? "bg-primary-foreground" : "bg-primary"
              : active ? "bg-primary-foreground/30" : "bg-muted-foreground/20"
          )}
        />
      ))}
    </div>
  );
}

// ── Mini Calendar ─────────────────────────────────────────────────────────────

function MiniCalendar({
  selectedDate,
  onSelectDate,
  jobs,
  userRole,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  jobs: any[];
  userRole: UserRole;
}) {
  const [month, setMonth] = useState(() => startOfMonth(selectedDate));

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setMonth(m => subMonths(m, 1))}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={13} />
        </button>
        <span className="text-[11px] font-display font-bold uppercase tracking-wider text-foreground">
          {format(month, "MMM yyyy")}
        </span>
        <button
          type="button"
          onClick={() => setMonth(m => addMonths(m, 1))}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-[9px] text-muted-foreground font-bold py-0.5">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map(day => {
          const inMonth = isSameMonth(day, month);
          const selected = isSameDay(day, selectedDate);
          const today = isToday(day);
          const dots = userRole === "worker" && inMonth ? getDots(jobs, day) : 0;
          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={cn(
                "flex flex-col items-center py-0.5 rounded text-[11px] transition-all",
                !inMonth && "opacity-25",
                selected && "bg-primary text-primary-foreground rounded-md",
                !selected && today && "text-primary font-bold",
                !selected && inMonth && "hover:bg-muted"
              )}
            >
              <span className="leading-4 w-5 text-center">{format(day, "d")}</span>
              {userRole === "worker" && inMonth && <JobDots count={dots} active={selected} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Time grid column ──────────────────────────────────────────────────────────

/** True if the scheduled_date has no time component (date-only string like "2026-04-07") */
function isAllDay(job: any): boolean {
  return typeof job.scheduledDate === "string" && job.scheduledDate.length === 10;
}

function TimeColumn({
  day,
  jobs,
  onJobClick,
}: {
  day: Date;
  jobs: any[];
  onJobClick: (j: any) => void;
}) {
  const allDayJobs = jobs.filter(j => j.scheduledDate && isSameDay(new Date(j.scheduledDate), day) && isAllDay(j));
  const timedJobs  = jobs.filter(j => j.scheduledDate && isSameDay(new Date(j.scheduledDate), day) && !isAllDay(j));

  return (
    <div className="flex flex-col">
      {/* All-day band */}
      {allDayJobs.length > 0 && (
        <div className="flex flex-col gap-0.5 px-0.5 py-1 border-b border-border bg-muted/20">
          {allDayJobs.map((job: any) => (
            <div
              key={job.id}
              onClick={() => onJobClick(job)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold cursor-pointer truncate border",
                jobColorClass(job)
              )}
            >
              {job.title}
            </div>
          ))}
        </div>
      )}

    <div className="relative" style={{ height: HOURS.length * HOUR_H }}>
      {HOURS.map((_, i) => (
        <div key={i} className="absolute w-full border-t border-border" style={{ top: i * HOUR_H }} />
      ))}
      {HOURS.map((_, i) => (
        <div
          key={`h${i}`}
          className="absolute w-full border-t border-border/40"
          style={{ top: i * HOUR_H + HOUR_H / 2 }}
        />
      ))}

      {isToday(day) && (() => {
        const now = new Date();
        const top = (getHours(now) + getMinutes(now) / 60 - HOUR_START) * HOUR_H;
        if (top < 0 || top > HOURS.length * HOUR_H) return null;
        return (
          <div className="absolute w-full z-20 flex items-center pointer-events-none" style={{ top }}>
            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
            <div className="flex-1 h-px bg-red-500 opacity-80" />
          </div>
        );
      })()}

      {(() => {
        // Compute overlap columns so jobs share width instead of stacking
        const positioned = timedJobs
          .map((job: any) => ({ job, pos: getJobPosition(job) }))
          .filter((x): x is { job: any; pos: { top: number; height: number } } => x.pos !== null)
          .sort((a: { pos: { top: number } }, b: { pos: { top: number } }) => a.pos.top - b.pos.top);

        // Assign each job a column slot
        const cols: number[] = [];     // which column each job is in
        const colEnds: number[] = [];  // bottom pixel of the last job in each column
        for (const { pos } of positioned) {
          let placed = false;
          for (let c = 0; c < colEnds.length; c++) {
            if (pos.top >= colEnds[c]) {
              cols.push(c);
              colEnds[c] = pos.top + pos.height;
              placed = true;
              break;
            }
          }
          if (!placed) {
            cols.push(colEnds.length);
            colEnds.push(pos.top + pos.height);
          }
        }
        const totalCols = Math.max(1, colEnds.length);

        return positioned.map(({ job, pos }, i) => {
          const col = cols[i];
          const w = 100 / totalCols;
          const left = col * w;
          return (
            <div
              key={job.id}
              onClick={() => onJobClick(job)}
              className={cn(
                "absolute rounded border px-1.5 py-1 text-[11px] cursor-pointer overflow-hidden transition-all z-10",
                jobColorClass(job)
              )}
              style={{
                top: pos.top + 1,
                height: Math.max(pos.height - 2, 18),
                left: `calc(${left}% + 2px)`,
                width: `calc(${w}% - 4px)`,
              }}
            >
              <div className="font-semibold leading-tight truncate">{job.title}</div>
              {pos.height > 38 && (
                <div className="text-[10px] opacity-75 truncate">{job.clientName}</div>
              )}
              {pos.height > 54 && job.scheduledDate && (
                <div className="flex items-center gap-0.5 text-[9px] opacity-60 mt-0.5">
                  <Clock size={8} />
                  {format(new Date(job.scheduledDate), "h:mm a")}
                </div>
              )}
              {pos.height > 68 && job.assignedWorkers?.length > 0 && (
                <div className="flex items-center gap-0.5 text-[9px] opacity-60 mt-0.5">
                  <Users size={8} />
                  {job.assignedWorkers.map((w: any) => w.name.split(" ")[0]).join(", ")}
                </div>
              )}
            </div>
          );
        });
      })()}
    </div>
    </div>
  );
}

// ── Day Schedule Popup ────────────────────────────────────────────────────────

function DaySchedulePopup({
  day,
  jobs,
  onViewFull,
}: {
  day: Date;
  jobs: any[];
  onViewFull: () => void;
}) {
  const dayJobs = jobs
    .filter(j => j.scheduledDate && isSameDay(new Date(j.scheduledDate), day))
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

  const totalHours = dayJobs.reduce((s, j) => s + (j.estimatedHours || 0), 0);
  const nextSlot = getNextFreeSlot(jobs, day);
  const pct = Math.min(Math.round((totalHours / 8) * 100), 100);

  return (
    <div className="space-y-4">
      {/* Capacity bar */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">Day capacity</span>
          <span className={cn("font-semibold", pct >= 100 ? "text-destructive" : pct >= 75 ? "text-orange-400" : "text-primary")}>
            {totalHours}h / 8h ({pct}%)
          </span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              pct >= 100 ? "bg-destructive" : pct >= 75 ? "bg-orange-500" : "bg-primary"
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      {/* Job timeline */}
      {dayJobs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No jobs scheduled for this day.</p>
      ) : (
        <div className="space-y-2">
          {dayJobs.map(job => {
            const start = new Date(job.scheduledDate);
            const end = new Date(start.getTime() + (job.estimatedHours || 1) * 3_600_000);
            return (
              <div
                key={job.id}
                className={cn("rounded-lg px-3 py-2 border text-sm", jobColorClass(job))}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold truncate">{job.title}</span>
                  <span className="text-[11px] opacity-75 shrink-0">
                    {format(start, "h:mm a")} – {format(end, "h:mm a")}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] opacity-70">
                  <span>{job.clientName}</span>
                  {job.assignedWorkers?.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Users size={9} />
                      {job.assignedWorkers.map((w: any) => w.name.split(" ")[0]).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Next free slot */}
      {nextSlot && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-xs text-green-600">
          Next free slot: <span className="font-semibold">{nextSlot}</span>
        </div>
      )}
      {!nextSlot && dayJobs.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-xs text-destructive">
          Day fully booked (no free 1h+ slots remaining)
        </div>
      )}

      <Button className="w-full" onClick={onViewFull}>View Full Day Schedule</Button>
    </div>
  );
}

// ── Worker Job Panel ──────────────────────────────────────────────────────────

function WorkerJobPanel({ job, onClose }: { job: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(job.notes ?? "");
  const [completeOpen, setCompleteOpen] = useState(false);

  const saveMutation = useUpdateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        toast.success("Notes saved");
      },
      onError: () => toast.error("Failed to save notes"),
    },
  });

  const completeMutation = useUpdateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        toast.success("Job marked as complete!");
        onClose();
      },
      onError: () => toast.error("Failed to mark complete"),
    },
  });

  const isCompleted = job.status === "completed";

  return (
    <div className="space-y-4">
      {/* Status badge row */}
      <div className="flex gap-2 flex-wrap">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
          job.status === "completed" ? "bg-green-500/20 text-green-400" :
          job.status === "in_progress" ? "bg-blue-500/20 text-blue-400" :
          job.status === "cancelled" ? "bg-red-500/20 text-red-400" :
          "bg-muted text-muted-foreground"
        }`}>{job.status?.replace("_", " ")}</span>
        {job.isEmergency && (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-destructive/20 text-destructive">CODE 9</span>
        )}
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-muted text-muted-foreground">{job.tradeType}</span>
      </div>

      {/* Job info */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-primary shrink-0" />
          <span className="font-semibold text-foreground">{job.clientName}</span>
        </div>
        <div className="flex items-start gap-2">
          <MapPin size={14} className="text-primary shrink-0 mt-0.5" />
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:text-primary underline-offset-2 hover:underline"
          >{job.address}</a>
        </div>
        {job.clientPhone && (
          <div className="flex items-center gap-2">
            <Phone size={14} className="text-primary shrink-0" />
            <a href={`tel:${job.clientPhone}`} className="text-foreground hover:text-primary">{job.clientPhone}</a>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-primary shrink-0" />
          <span className="text-foreground">
            {job.scheduledDate ? format(new Date(job.scheduledDate), "EEE d MMM · h:mm a") : "No time set"}
            {" · "}{job.estimatedHours}h est.
          </span>
        </div>
      </div>

      {/* Description */}
      {job.description && (
        <div className="rounded-md bg-muted/40 border border-border px-3 py-2.5 text-sm text-foreground leading-relaxed">
          {job.description}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          disabled={isCompleted}
          rows={4}
          placeholder="Add job notes, observations, or anything the client mentioned…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        {!isCompleted && (
          <Button
            size="sm"
            variant="outline"
            className="mt-1.5"
            disabled={saveMutation.isPending || notes === (job.notes ?? "")}
            onClick={() => saveMutation.mutate({ id: job.id, data: { notes } })}
          >
            <FileText size={13} className="mr-1" /> Save Notes
          </Button>
        )}
      </div>

      {/* Complete */}
      {!isCompleted ? (
        <>
          {!completeOpen ? (
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
              onClick={() => setCompleteOpen(true)}
            >
              <CheckCircle2 size={15} className="mr-2" /> Mark Job Complete
            </Button>
          ) : (
            <div className="border border-green-500/30 bg-green-500/5 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold">Confirm job complete?</p>
              <p className="text-xs text-muted-foreground">An invoice will be generated and sent to the client.</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setCompleteOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  disabled={completeMutation.isPending}
                  onClick={() => completeMutation.mutate({ id: job.id, data: { status: "completed", completedDate: new Date().toISOString() } })}
                >
                  Confirm Complete
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center gap-2 py-3 text-green-500 font-semibold text-sm">
          <CheckCircle2 size={16} /> Job Completed
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CalendarView({ userRole = "admin" }: { userRole?: UserRole }) {
  const { data: jobs = [] } = useListJobs();
  const { data: workers = [] } = useListWorkers();

  // For workers: filter to only their assigned jobs
  const workerId = (() => {
    const v = sessionStorage.getItem("ts2_worker_id");
    if (!v || v === "" || v === "null") return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  })();

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [workerFilter, setWorkerFilter] = useState<number | "all">("all");

  // Edit job dialog
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Day popup (month cell click)
  const [dayPopup, setDayPopup] = useState<Date | null>(null);

  const timeGridRef = useRef<HTMLDivElement>(null);

  // Scroll to current time on mount/view change
  useEffect(() => {
    if (viewMode !== "month" && timeGridRef.current) {
      const now = new Date();
      const scrollTop = Math.max(0, (getHours(now) + getMinutes(now) / 60 - HOUR_START - 1) * HOUR_H);
      timeGridRef.current.scrollTo({ top: scrollTop, behavior: "smooth" });
    }
  }, [viewMode]);

  // Workers only see their own jobs; admins can filter by worker
  const baseJobs = userRole === "worker"
    ? (workerId
        ? jobs.filter(j =>
            (j as any).assignedWorkers?.some((w: any) => w.id === workerId) ||
            (j as any).assignedWorkerIds?.includes(workerId)
          )
        : [] // worker with no linked workerId sees nothing
      )
    : jobs;

  const filteredJobs =
    workerFilter === "all"
      ? baseJobs
      : baseJobs.filter(j =>
          (j as any).assignedWorkers?.some((w: any) => w.id === workerFilter) ||
          (j as any).assignedWorkerIds?.includes(workerFilter)
        );

  const goNext = () => {
    if (viewMode === "month") setCurrentDate(d => addMonths(d, 1));
    else if (viewMode === "week") setCurrentDate(d => addWeeks(d, 1));
    else setCurrentDate(d => addDays(d, 1));
  };
  const goPrev = () => {
    if (viewMode === "month") setCurrentDate(d => addMonths(d, -1));
    else if (viewMode === "week") setCurrentDate(d => addWeeks(d, -1));
    else setCurrentDate(d => addDays(d, -1));
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const headerLabel =
    viewMode === "month"
      ? format(currentDate, "MMMM yyyy")
      : viewMode === "week"
      ? `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`
      : format(currentDate, "EEEE, MMMM d, yyyy");

  const monthDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }),
  });

  const openJob = (job: any) => { setSelectedJob(job); setEditOpen(true); };

  return (
    <div
      className="flex animate-in fade-in overflow-hidden rounded-lg"
      style={{ height: "calc(100dvh - 130px)", minHeight: 480 }}
    >

      {/* ── Left Sidebar ── */}
      <div className="hidden lg:flex w-52 shrink-0 flex-col gap-4 p-4 border-r border-border overflow-y-auto bg-card/30">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground leading-tight">Schedule</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">Operations calendar</p>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="w-full text-xs h-8">
          Today
        </Button>

        <MiniCalendar
          selectedDate={currentDate}
          onSelectDate={d => setCurrentDate(d)}
          jobs={filteredJobs}
          userRole={userRole}
        />

        {/* View switcher */}
        <div>
          <p className="text-[9px] uppercase text-muted-foreground font-bold tracking-widest mb-2">View</p>
          <div className="space-y-1">
            {(["month", "week", "day"] as ViewMode[]).map(m => (
              <button
                type="button"
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-xs font-display uppercase tracking-wide transition-all",
                  viewMode === m
                    ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(234,88,12,0.3)]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Worker filter (admin only) */}
        {userRole === "admin" && workers.length > 0 && (
          <div>
            <p className="text-[9px] uppercase text-muted-foreground font-bold tracking-widest mb-2">
              Filter by Worker
            </p>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setWorkerFilter("all")}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-2",
                  workerFilter === "all"
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Users size={11} />
                All Workers
              </button>
              {workers.map(w => (
                <button
                  type="button"
                  key={w.id}
                  onClick={() => setWorkerFilter(w.id)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 rounded-md text-xs transition-all",
                    workerFilter === w.id
                      ? "bg-primary/20 text-primary border border-primary/30 font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span className="truncate block">{w.name}</span>
                  <span className="text-[10px] opacity-60">{w.tradeType}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active filter pill */}
        {workerFilter !== "all" && (
          <button
            type="button"
            onClick={() => setWorkerFilter("all")}
            className="flex items-center gap-1.5 text-[10px] bg-primary/10 border border-primary/20 text-primary rounded-full px-2.5 py-1 hover:bg-primary/20 transition-colors self-start"
          >
            <X size={10} />
            Clear filter
          </button>
        )}
      </div>

      {/* ── Main Calendar ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-card border-l border-border min-w-0">

        {/* Header bar */}
        <div className="shrink-0 flex items-center justify-between px-2 sm:px-4 py-2 border-b border-border bg-card/60 gap-2 flex-wrap">
          <div className="flex items-center gap-1 min-w-0">
            <Button type="button" variant="ghost" size="icon" onClick={goPrev} className="h-8 w-8 shrink-0">
              <ChevronLeft size={15} />
            </Button>
            <h2 className="font-display font-bold text-xs sm:text-base uppercase tracking-wide text-center truncate max-w-[140px] sm:max-w-none">
              {headerLabel}
            </h2>
            <Button type="button" variant="ghost" size="icon" onClick={goNext} className="h-8 w-8 shrink-0">
              <ChevronRight size={15} />
            </Button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCurrentDate(new Date())}
              className="hidden lg:flex text-xs h-7 mr-1"
            >
              Today
            </Button>
            {(["month", "week", "day"] as ViewMode[]).map(m => (
              <button
                type="button"
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  "px-2 sm:px-2.5 py-1 rounded text-[11px] font-display uppercase tracking-wide transition-all",
                  viewMode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Month View ── */}
        {viewMode === "month" && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {/* Day-of-week header — sticky */}
            <div className="grid grid-cols-7 shrink-0 border-b border-border bg-background/40">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
                <div
                  key={d}
                  className="py-2 text-center text-[9px] sm:text-[10px] font-display uppercase text-muted-foreground font-bold tracking-wider border-r border-border last:border-r-0"
                >
                  <span className="hidden sm:inline">{d}</span>
                  <span className="sm:hidden">{d.charAt(0)}</span>
                </div>
              ))}
            </div>

            {/* Month grid — scrollable */}
            <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
              <div
                className="grid grid-cols-7"
                style={{ gridAutoRows: "minmax(80px, 1fr)" }}
              >
                {monthDays.map(day => {
                  const dayJobs = filteredJobs.filter(j => j.scheduledDate && isSameDay(new Date(j.scheduledDate), day));
                  const inMonth = isSameMonth(day, currentDate);
                  const today = isToday(day);
                  const dots = userRole === "worker" ? getDots(filteredJobs, day) : 0;
                  const dayHours = getDayHours(filteredJobs, day);

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => inMonth && setDayPopup(day)}
                      className={cn(
                        "border-r border-b border-border last:border-r-0 p-1 sm:p-1.5 cursor-pointer transition-colors overflow-hidden",
                        !inMonth && "bg-background/20 opacity-40 pointer-events-none",
                        today && "bg-primary/5",
                        inMonth && "hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-start justify-between mb-0.5 sm:mb-1">
                        <div className="flex flex-col items-start">
                          <span
                            className={cn(
                              "text-xs sm:text-sm font-bold w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full",
                              today ? "bg-primary text-primary-foreground" : "text-foreground"
                            )}
                          >
                            {format(day, "d")}
                          </span>
                          {userRole === "worker" && inMonth && (
                            <div className="flex gap-0.5 mt-0.5 pl-0.5">
                              {[0, 1, 2, 3].map(i => (
                                <div
                                  key={i}
                                  className={cn(
                                    "w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full",
                                    i < dots ? "bg-primary" : "bg-muted-foreground/20"
                                  )}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Hour count badge */}
                        {dayHours > 0 && inMonth && (
                          <span
                            className={cn(
                              "text-[8px] sm:text-[9px] font-bold px-1 py-0.5 rounded",
                              dayHours >= 8
                                ? "bg-destructive/20 text-destructive"
                                : dayHours >= 6
                                ? "bg-orange-500/20 text-orange-400"
                                : "bg-primary/15 text-primary"
                            )}
                          >
                            {dayHours}h
                          </span>
                        )}
                      </div>

                      <div className="space-y-0.5">
                        {dayJobs.slice(0, 2).map(job => (
                          <div
                            key={job.id}
                            onClick={e => { e.stopPropagation(); openJob(job); }}
                            className={cn(
                              "text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded truncate font-semibold cursor-pointer",
                              jobColorClass(job)
                            )}
                          >
                            <span className="hidden sm:inline">
                              {job.scheduledDate && (
                                <span className="opacity-75 mr-1">{format(new Date(job.scheduledDate), "h:mm")}</span>
                              )}
                            </span>
                            {job.title}
                          </div>
                        ))}
                        {dayJobs.length > 2 && (
                          <div className="text-[9px] sm:text-[10px] text-muted-foreground px-1 sm:px-1.5">
                            +{dayJobs.length - 2} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Week View ── */}
        {viewMode === "week" && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="shrink-0 flex border-b border-border bg-background/40">
              <div className="w-10 sm:w-12 shrink-0" />
              {weekDays.map(day => {
                const dots = userRole === "worker" ? getDots(filteredJobs, day) : 0;
                const dayHours = getDayHours(filteredJobs, day);
                return (
                  <div
                    key={day.toISOString()}
                    className="flex-1 py-1.5 sm:py-2 text-center border-l border-border cursor-pointer hover:bg-muted transition-colors min-w-0"
                    onClick={() => setDayPopup(day)}
                  >
                    <div className="text-[8px] sm:text-[9px] font-display uppercase text-muted-foreground tracking-wider">
                      <span className="hidden sm:inline">{format(day, "EEE")}</span>
                      <span className="sm:hidden">{format(day, "EEEEE")}</span>
                    </div>
                    <div
                      className={cn(
                        "text-sm sm:text-lg font-bold mx-auto w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center rounded-full mt-0.5",
                        isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
                      )}
                    >
                      {format(day, "d")}
                    </div>
                    {dayHours > 0 && (
                      <span
                        className={cn(
                          "text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-0.5 rounded-full mt-0.5 inline-block",
                          dayHours >= 8
                            ? "bg-destructive/20 text-destructive"
                            : dayHours >= 6
                            ? "bg-orange-500/20 text-orange-400"
                            : "bg-primary/15 text-primary"
                        )}
                      >
                        {dayHours}h
                      </span>
                    )}
                    {userRole === "worker" && <JobDots count={dots} />}
                  </div>
                );
              })}
            </div>

            <div
              ref={timeGridRef}
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
            >
              <div className="flex">
                <div className="w-10 sm:w-12 shrink-0 bg-background/20">
                  {HOURS.map((hour, i) => (
                    <div
                      key={hour}
                      className={cn(
                        "text-right pr-1 sm:pr-2 text-[8px] sm:text-[9px] text-muted-foreground",
                        i > 0 && "-mt-2"
                      )}
                      style={{ height: HOUR_H }}
                    >
                      {format(new Date(2000, 0, 1, hour), "ha")}
                    </div>
                  ))}
                </div>
                {weekDays.map(day => (
                  <div key={day.toISOString()} className="flex-1 border-l border-border/50 min-w-0">
                    <TimeColumn day={day} jobs={filteredJobs} onJobClick={openJob} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Day View ── */}
        {viewMode === "day" && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="shrink-0 flex items-center justify-center py-3 border-b border-border bg-background/40">
              <div className="text-center">
                <div className="text-[10px] font-display uppercase text-muted-foreground tracking-widest">
                  {format(currentDate, "EEEE")}
                </div>
                <div
                  className={cn(
                    "text-3xl font-bold mx-auto w-12 h-12 flex items-center justify-center rounded-full mt-0.5",
                    isToday(currentDate) ? "bg-primary text-primary-foreground" : "text-foreground"
                  )}
                >
                  {format(currentDate, "d")}
                </div>
                {(() => {
                  const h = getDayHours(filteredJobs, currentDate);
                  return h > 0 ? (
                    <span
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block",
                        h >= 8 ? "bg-destructive/20 text-destructive"
                          : h >= 6 ? "bg-orange-500/20 text-orange-400"
                          : "bg-primary/15 text-primary"
                      )}
                    >
                      {h}h scheduled
                    </span>
                  ) : null;
                })()}
                {userRole === "worker" && (
                  <div className="flex gap-1.5 justify-center mt-1">
                    {[0, 1, 2, 3].map(i => (
                      <div
                        key={i}
                        className={cn(
                          "w-2 h-2 rounded-full",
                          i < getDots(filteredJobs, currentDate) ? "bg-primary" : "bg-white/10"
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div
              ref={timeGridRef}
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
            >
              <div className="flex">
                <div className="w-10 sm:w-12 shrink-0 bg-background/20">
                  {HOURS.map((hour, i) => (
                    <div
                      key={hour}
                      className={cn(
                        "text-right pr-1 sm:pr-2 text-[8px] sm:text-[9px] text-muted-foreground",
                        i > 0 && "-mt-2"
                      )}
                      style={{ height: HOUR_H }}
                    >
                      {format(new Date(2000, 0, 1, hour), "ha")}
                    </div>
                  ))}
                </div>
                <div className="flex-1 border-l border-border/50 min-w-0">
                  <TimeColumn day={currentDate} jobs={filteredJobs} onJobClick={openJob} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Day Popup Dialog ── */}
      <Dialog open={!!dayPopup} onOpenChange={o => !o && setDayPopup(null)}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {dayPopup ? format(dayPopup, "EEEE, MMMM d") : ""}
            </DialogTitle>
            <DialogDescription>Jobs scheduled for this day.</DialogDescription>
          </DialogHeader>
          {dayPopup && (
            <DaySchedulePopup
              day={dayPopup}
              jobs={filteredJobs}
              onViewFull={() => {
                setCurrentDate(dayPopup);
                setViewMode("day");
                setDayPopup(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Job Dialog ── */}
      {selectedJob && (
        <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) setSelectedJob(null); }}>
          <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{userRole === "worker" ? selectedJob.title : `Edit Job #${selectedJob.id} – ${selectedJob.title}`}</DialogTitle>
              <DialogDescription>{userRole === "worker" ? `${selectedJob.tradeType} · ${selectedJob.clientName}` : "Update the details for this job."}</DialogDescription>
            </DialogHeader>
            {userRole === "worker" ? (
              <WorkerJobPanel
                job={selectedJob}
                onClose={() => { setEditOpen(false); setSelectedJob(null); }}
              />
            ) : (
              <JobForm
                initialData={selectedJob}
                onSuccess={() => { setEditOpen(false); setSelectedJob(null); }}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
