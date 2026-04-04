import { useListJobs, useListWorkers } from "@/lib/api-client";
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
import { ChevronLeft, ChevronRight, Clock, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { JobForm } from "@/components/jobs/JobForm";
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
  if (job.isEmergency) return "bg-destructive/25 border-destructive/50 text-red-200 hover:bg-destructive/35";
  if (job.status === "completed") return "bg-green-500/20 border-green-500/30 text-green-200 hover:bg-green-500/30";
  if (job.jobType === "quote") return "bg-blue-500/20 border-blue-500/30 text-blue-200 hover:bg-blue-500/30";
  return "bg-primary/20 border-primary/40 text-primary-foreground hover:bg-primary/30";
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
              ? active ? "bg-white" : "bg-primary"
              : active ? "bg-white/30" : "bg-white/10"
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
          onClick={() => setMonth(m => subMonths(m, 1))}
          className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={13} />
        </button>
        <span className="text-[11px] font-display font-bold uppercase tracking-wider text-foreground">
          {format(month, "MMM yyyy")}
        </span>
        <button
          onClick={() => setMonth(m => addMonths(m, 1))}
          className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
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
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={cn(
                "flex flex-col items-center py-0.5 rounded text-[11px] transition-all",
                !inMonth && "opacity-25",
                selected && "bg-primary text-primary-foreground rounded-md",
                !selected && today && "text-primary font-bold",
                !selected && inMonth && "hover:bg-white/10"
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

function TimeColumn({
  day,
  jobs,
  onJobClick,
}: {
  day: Date;
  jobs: any[];
  onJobClick: (j: any) => void;
}) {
  const dayJobs = jobs.filter(j => j.scheduledDate && isSameDay(new Date(j.scheduledDate), day));

  return (
    <div className="relative" style={{ height: HOURS.length * HOUR_H }}>
      {HOURS.map((_, i) => (
        <div key={i} className="absolute w-full border-t border-white/[0.06]" style={{ top: i * HOUR_H }} />
      ))}
      {HOURS.map((_, i) => (
        <div
          key={`h${i}`}
          className="absolute w-full border-t border-white/[0.03]"
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

      {dayJobs.map(job => {
        const pos = getJobPosition(job);
        if (!pos) return null;
        return (
          <div
            key={job.id}
            onClick={() => onJobClick(job)}
            className={cn(
              "absolute left-0.5 right-0.5 rounded border px-1.5 py-1 text-[11px] cursor-pointer overflow-hidden transition-all z-10",
              jobColorClass(job)
            )}
            style={{ top: pos.top + 1, height: Math.max(pos.height - 2, 18) }}
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
      })}
    </div>
  );
}

// ── Day Schedule Popup ────────────────────────────────────────────────────────

function DaySchedulePopup({
  day,
  jobs,
  onViewFull,
  onClose,
}: {
  day: Date;
  jobs: any[];
  onViewFull: () => void;
  onClose: () => void;
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
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
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
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-xs text-green-400">
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

// ── Main Component ────────────────────────────────────────────────────────────

export function CalendarView({ userRole = "admin" }: { userRole?: UserRole }) {
  const { data: jobs = [] } = useListJobs();
  const { data: workers = [] } = useListWorkers();

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

  // Filter jobs by selected worker
  const filteredJobs =
    workerFilter === "all"
      ? jobs
      : jobs.filter(j =>
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
    <div className="flex animate-in fade-in" style={{ height: "calc(100vh - 130px)", minHeight: 600 }}>

      {/* ── Left Sidebar ── */}
      <div className="hidden lg:flex w-52 shrink-0 flex-col gap-4 p-4 border-r border-border overflow-y-auto bg-card/30">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground leading-tight">Schedule</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">Operations calendar</p>
        </div>

        <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())} className="w-full text-xs h-8">
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
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-xs font-display uppercase tracking-wide transition-all",
                  viewMode === m
                    ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(234,88,12,0.3)]"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
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
                onClick={() => setWorkerFilter("all")}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-2",
                  workerFilter === "all"
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <Users size={11} />
                All Workers
              </button>
              {workers.map(w => (
                <button
                  key={w.id}
                  onClick={() => setWorkerFilter(w.id)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 rounded-md text-xs transition-all",
                    workerFilter === w.id
                      ? "bg-primary/20 text-primary border border-primary/30 font-semibold"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
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
            onClick={() => setWorkerFilter("all")}
            className="flex items-center gap-1.5 text-[10px] bg-primary/10 border border-primary/20 text-primary rounded-full px-2.5 py-1 hover:bg-primary/20 transition-colors self-start"
          >
            <X size={10} />
            Clear filter
          </button>
        )}
      </div>

      {/* ── Main Calendar ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-card border-l border-border">

        {/* Header bar */}
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border bg-card/60">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={goPrev} className="h-8 w-8">
              <ChevronLeft size={15} />
            </Button>
            <h2 className="font-display font-bold text-base uppercase tracking-wide min-w-[200px] text-center">
              {headerLabel}
            </h2>
            <Button variant="ghost" size="icon" onClick={goNext} className="h-8 w-8">
              <ChevronRight size={15} />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentDate(new Date())}
              className="hidden lg:flex text-xs h-7 mr-2"
            >
              Today
            </Button>
            {(["month", "week", "day"] as ViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={cn(
                  "px-2.5 py-1 rounded text-[11px] font-display uppercase tracking-wide transition-all",
                  viewMode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-white/10"
                )}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Month View ── */}
        {viewMode === "month" && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="grid grid-cols-7 shrink-0 border-b border-border bg-background/40">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
                <div
                  key={d}
                  className="py-2 text-center text-[10px] font-display uppercase text-muted-foreground font-bold tracking-wider border-r border-border last:border-r-0"
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="flex-1 grid grid-cols-7 auto-rows-fr">
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
                      "border-r border-b border-border last:border-r-0 p-1.5 cursor-pointer transition-colors min-h-[90px]",
                      !inMonth && "bg-background/20 opacity-40 pointer-events-none",
                      today && "bg-primary/5",
                      inMonth && "hover:bg-white/[0.03]"
                    )}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex flex-col items-start">
                        <span
                          className={cn(
                            "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full",
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
                                  "w-1.5 h-1.5 rounded-full",
                                  i < dots ? "bg-primary" : "bg-white/10"
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
                            "text-[9px] font-bold px-1 py-0.5 rounded",
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
                      {dayJobs.slice(0, 3).map(job => (
                        <div
                          key={job.id}
                          onClick={e => { e.stopPropagation(); openJob(job); }}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded truncate font-semibold cursor-pointer",
                            jobColorClass(job)
                          )}
                        >
                          {job.scheduledDate && (
                            <span className="opacity-75 mr-1">{format(new Date(job.scheduledDate), "h:mm")}</span>
                          )}
                          {job.title}
                        </div>
                      ))}
                      {dayJobs.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1.5">
                          +{dayJobs.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Week View ── */}
        {viewMode === "week" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="shrink-0 flex border-b border-border bg-background/40">
              <div className="w-12 shrink-0" />
              {weekDays.map(day => {
                const dots = userRole === "worker" ? getDots(filteredJobs, day) : 0;
                const dayHours = getDayHours(filteredJobs, day);
                return (
                  <div
                    key={day.toISOString()}
                    className="flex-1 py-2 text-center border-l border-border cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setDayPopup(day)}
                  >
                    <div className="text-[9px] font-display uppercase text-muted-foreground tracking-wider">
                      {format(day, "EEE")}
                    </div>
                    <div
                      className={cn(
                        "text-lg font-bold mx-auto w-8 h-8 flex items-center justify-center rounded-full mt-0.5",
                        isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"
                      )}
                    >
                      {format(day, "d")}
                    </div>
                    {dayHours > 0 && (
                      <span
                        className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 inline-block",
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

            <div ref={timeGridRef} className="flex-1 overflow-y-auto">
              <div className="flex">
                <div className="w-12 shrink-0 bg-background/20">
                  {HOURS.map(hour => (
                    <div
                      key={hour}
                      className="text-right pr-2 text-[9px] text-muted-foreground -mt-2"
                      style={{ height: HOUR_H }}
                    >
                      {format(new Date(2000, 0, 1, hour), "ha")}
                    </div>
                  ))}
                </div>
                {weekDays.map(day => (
                  <div key={day.toISOString()} className="flex-1 border-l border-border/50">
                    <TimeColumn day={day} jobs={filteredJobs} onJobClick={openJob} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Day View ── */}
        {viewMode === "day" && (
          <div className="flex-1 flex flex-col overflow-hidden">
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

            <div ref={timeGridRef} className="flex-1 overflow-y-auto">
              <div className="flex">
                <div className="w-12 shrink-0 bg-background/20">
                  {HOURS.map(hour => (
                    <div
                      key={hour}
                      className="text-right pr-2 text-[9px] text-muted-foreground -mt-2"
                      style={{ height: HOUR_H }}
                    >
                      {format(new Date(2000, 0, 1, hour), "ha")}
                    </div>
                  ))}
                </div>
                <div className="flex-1 border-l border-border/50">
                  <TimeColumn day={currentDate} jobs={filteredJobs} onJobClick={openJob} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Day Popup Dialog ── */}
      <Dialog open={!!dayPopup} onOpenChange={o => !o && setDayPopup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {dayPopup ? format(dayPopup, "EEEE, MMMM d") : ""}
            </DialogTitle>
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
              onClose={() => setDayPopup(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Job Dialog ── */}
      {selectedJob && (
        <Dialog open={editOpen} onOpenChange={o => { setEditOpen(o); if (!o) setSelectedJob(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Job #{selectedJob.id} – {selectedJob.title}</DialogTitle>
            </DialogHeader>
            <JobForm
              initialData={selectedJob}
              onSuccess={() => { setEditOpen(false); setSelectedJob(null); }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
