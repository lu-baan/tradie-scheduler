import { useState, useEffect } from "react";
import {
  useListWorkers,
  useCreateWorker,
  useUpdateWorker,
  useDeleteWorker,
  useListJobs,
  Worker,
} from "@/lib/api-client";
import type { LeaveRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Users, Phone, Mail, Trash2, CalendarClock, Edit2,
  Plus, X, DollarSign, ClipboardList, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, MoreHorizontal,
} from "lucide-react";
import * as Switch from "@radix-ui/react-switch";
import { toast } from "sonner";
import { format, addDays, addWeeks, endOfDay, isAfter, parseISO } from "date-fns";

// ── Schema ────────────────────────────────────────────────────────────────────

const workerSchema = z.object({
  name: z.string().min(2).max(80),
  tradeType: z.string().min(2).max(60),
  phone: z
    .string()
    .regex(/^(\+?61|0)[2-478]\d{8}$/, "Enter a valid Australian phone number")
    .optional()
    .or(z.literal("")),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  isAvailable: z.boolean().default(true),
  skills: z.array(z.string()).default([]),
  hourlyRate: z.coerce.number().min(0).optional().nullable(),
  maxWeeklyHours: z.coerce.number().min(1).max(168).optional().nullable(),
});
type WorkerFormValues = z.infer<typeof workerSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function Label({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs uppercase text-muted-foreground font-display block mb-1">
      {children}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function UnavailableUntilLabel({ until }: { until: string | null | undefined }) {
  if (!until) return null;
  const date = new Date(until);
  const now = new Date();
  if (!isAfter(date, now)) return null;
  const diffHrs = (date.getTime() - now.getTime()) / 3_600_000;
  const label = diffHrs < 24
    ? `Returns ~${Math.ceil(diffHrs)}h`
    : `Returns ${format(date, "d MMM")}`;
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <CalendarClock size={10} />{label}
    </span>
  );
}

/** Deterministic color from string */
function avatarColor(name: string) {
  const colors = [
    "bg-blue-500", "bg-violet-500", "bg-emerald-500",
    "bg-orange-500", "bg-pink-500", "bg-cyan-500", "bg-amber-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={`w-9 h-9 rounded-full ${avatarColor(name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
      {initials}
    </div>
  );
}

// ── Unavailability dialog ─────────────────────────────────────────────────────

const HOUR_PRESETS = [
  { label: "1 hour",  getValue: () => addHours(new Date(), 1) },
  { label: "2 hours", getValue: () => addHours(new Date(), 2) },
  { label: "4 hours", getValue: () => addHours(new Date(), 4) },
  { label: "8 hours", getValue: () => addHours(new Date(), 8) },
];
const DAY_PRESETS = [
  { label: "Rest of today", getValue: () => endOfDay(new Date()) },
  { label: "1 day",  getValue: () => endOfDay(addDays(new Date(), 1)) },
  { label: "3 days", getValue: () => endOfDay(addDays(new Date(), 3)) },
  { label: "1 week", getValue: () => endOfDay(addWeeks(new Date(), 1)) },
  { label: "2 weeks",getValue: () => endOfDay(addWeeks(new Date(), 2)) },
];

function UnavailabilityDialog({
  worker, open, onOpenChange, onConfirm, isPending,
}: {
  worker: Worker; open: boolean; onOpenChange: (o: boolean) => void;
  onConfirm: (until: string | null) => void; isPending: boolean;
}) {
  const [customDate, setCustomDate] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const done = (until: string | null) => {
    onConfirm(until); onOpenChange(false);
    setCustomDate(""); setUseCustom(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setCustomDate(""); setUseCustom(false); } onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>How long is {worker.name} unavailable?</DialogTitle>
          <DialogDescription>Choose a duration or pick a return date.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-display tracking-widest mb-1.5">By Hour</p>
            <div className="grid grid-cols-2 gap-2">
              {HOUR_PRESETS.map(p => (
                <Button key={p.label} variant="outline" className="justify-start" disabled={isPending}
                  onClick={() => done(p.getValue().toISOString())}>{p.label}</Button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-display tracking-widest mb-1.5">By Day</p>
            <div className="space-y-2">
              {DAY_PRESETS.map(p => (
                <Button key={p.label} variant="outline" className="w-full justify-start" disabled={isPending}
                  onClick={() => done(p.getValue().toISOString())}>{p.label}</Button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-display tracking-widest mb-1.5">Custom Return Date</p>
            {!useCustom ? (
              <Button variant="outline" className="w-full justify-start" onClick={() => setUseCustom(true)} disabled={isPending}>
                Pick a date…
              </Button>
            ) : (
              <div className="flex gap-2">
                <Input type="date" min={todayStr} value={customDate} onChange={e => setCustomDate(e.target.value)} className="flex-1" />
                <Button onClick={() => done(endOfDay(new Date(customDate)).toISOString())} disabled={!customDate || isPending}>Set</Button>
              </div>
            )}
          </div>
          <div className="border-t border-border pt-2">
            <Button variant="ghost" className="w-full justify-start text-muted-foreground" disabled={isPending}
              onClick={() => done(null)}>Indefinitely (until manually restored)</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Worker form (shared by Add + Edit) ────────────────────────────────────────

function WorkerForm({
  defaultValues,
  onSave,
  isPending,
  submitLabel,
}: {
  defaultValues: Partial<WorkerFormValues>;
  onSave: (data: WorkerFormValues) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const form = useForm<WorkerFormValues>({
    resolver: zodResolver(workerSchema),
    defaultValues: {
      name: "", tradeType: "", phone: "", email: "",
      isAvailable: true, skills: [], hourlyRate: null, maxWeeklyHours: 38,
      ...defaultValues,
    },
  });
  const [skillInput, setSkillInput] = useState("");
  const skills = form.watch("skills") ?? [];

  const addSkill = () => {
    const v = skillInput.trim();
    if (!v || skills.includes(v)) return;
    form.setValue("skills", [...skills, v]);
    setSkillInput("");
  };

  return (
    <form onSubmit={form.handleSubmit(onSave)} className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label required>Full Name</Label>
          <Input {...form.register("name")} placeholder="e.g. John Smith" />
          {form.formState.errors.name && <p className="text-destructive text-xs mt-1">{form.formState.errors.name.message}</p>}
        </div>
        <div>
          <Label required>Trade Specialization</Label>
          <Input {...form.register("tradeType")} placeholder="e.g. Master Plumber" />
          {form.formState.errors.tradeType && <p className="text-destructive text-xs mt-1">{form.formState.errors.tradeType.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Phone</Label>
          <Input {...form.register("phone")} placeholder="0412 345 678" inputMode="tel" />
          {form.formState.errors.phone && <p className="text-destructive text-xs mt-1">{form.formState.errors.phone.message}</p>}
        </div>
        <div>
          <Label>Email</Label>
          <Input {...form.register("email")} placeholder="john@example.com" />
          {form.formState.errors.email && <p className="text-destructive text-xs mt-1">{form.formState.errors.email.message}</p>}
        </div>
      </div>

      {/* Pay & capacity */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Hourly Rate (AUD)</Label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-muted-foreground text-sm">$</span>
            <Input type="number" min="0" step="0.5" className="pl-7"
              {...form.register("hourlyRate")} placeholder="e.g. 45.00" />
          </div>
        </div>
        <div>
          <Label>Max Weekly Hours</Label>
          <Input type="number" min="1" max="168" step="0.5"
            {...form.register("maxWeeklyHours")} placeholder="38" />
        </div>
      </div>

      {/* Skills / certifications */}
      <div>
        <Label>Skills & Certifications</Label>
        <div className="flex gap-2 mb-2">
          <Input
            value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            placeholder="e.g. EWP Licence, White Card…"
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addSkill} disabled={!skillInput.trim()}>
            <Plus size={14} />
          </Button>
        </div>
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {skills.map(s => (
              <span key={s} className="flex items-center gap-1 bg-primary/10 border border-primary/20 text-primary text-xs px-2 py-0.5 rounded-full">
                {s}
                <button type="button" onClick={() => form.setValue("skills", skills.filter(x => x !== s))}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

// ── Leave panel (per worker) ──────────────────────────────────────────────────

const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: "Sick Leave", annual: "Annual Leave", training: "Training",
  personal: "Personal", other: "Other",
};
const LEAVE_STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
  approved: "bg-green-500/10 border-green-500/30 text-green-400",
  denied: "bg-destructive/10 border-destructive/30 text-destructive",
};

function LeavePanel({ worker, leaveRequests, onRefresh }: {
  worker: Worker;
  leaveRequests: LeaveRequest[];
  onRefresh: () => void;
}) {
  const myLeave = leaveRequests.filter(r => r.workerId === worker.id);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  const approve = async (id: number, status: "approved" | "denied") => {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast.success(status === "approved" ? "Leave approved" : "Leave denied");
      onRefresh();
    } catch {
      toast.error("Failed to update leave request");
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="space-y-2">
      {myLeave.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No leave requests.</p>
      ) : (
        myLeave.map(r => (
          <div key={r.id} className={`rounded-lg border p-2 text-xs ${LEAVE_STATUS_STYLES[r.status]}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{LEAVE_TYPE_LABELS[r.leaveType]}</p>
                <p className="text-muted-foreground">
                  {r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}
                  {r.startTime && ` · ${r.startTime}–${r.endTime}`}
                </p>
                {r.reason && <p className="mt-0.5 italic text-muted-foreground">"{r.reason}"</p>}
              </div>
              {r.status === "pending" && (
                <div className="flex gap-1 shrink-0">
                  <button
                    className="p-1 rounded bg-green-500/20 hover:bg-green-500/40 text-green-400 transition-colors"
                    disabled={approvingId === r.id}
                    onClick={() => approve(r.id, "approved")}
                    title="Approve"
                  >
                    <CheckCircle2 size={13} />
                  </button>
                  <button
                    className="p-1 rounded bg-destructive/20 hover:bg-destructive/40 text-destructive transition-colors"
                    disabled={approvingId === r.id}
                    onClick={() => approve(r.id, "denied")}
                    title="Deny"
                  >
                    <XCircle size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))
      )}
      <AddLeaveButton workerId={worker.id} workerName={worker.name} onSuccess={onRefresh} />
    </div>
  );
}

function AddLeaveButton({ workerId, workerName, onSuccess }: { workerId: number; workerName: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"sick"|"annual"|"training"|"personal"|"other">("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const handleSubmit = async () => {
    if (!startDate || !endDate) return;
    setSaving(true);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workerId, leaveType: type, startDate, endDate,
          startTime: startTime || null, endTime: endTime || null,
          reason: reason || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Leave request created for ${workerName}`);
      onSuccess();
      setOpen(false);
      setStartDate(""); setEndDate(""); setStartTime(""); setEndTime(""); setReason("");
    } catch {
      toast.error("Failed to create leave request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
        onClick={() => setOpen(true)}
      >
        <Plus size={11} /> Request leave
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request Leave — {workerName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Leave Type</Label>
              <select
                value={type}
                onChange={e => setType(e.target.value as any)}
                className="w-full h-10 rounded-md border border-input bg-background/50 px-3 text-sm"
              >
                {Object.entries(LEAVE_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Start Date</Label>
                <Input type="date" min={todayStr} value={startDate} onChange={e => { setStartDate(e.target.value); if (!endDate) setEndDate(e.target.value); }} />
              </div>
              <div>
                <Label required>End Date</Label>
                <Input type="date" min={startDate || todayStr} value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From Time (optional)</Label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>To Time (optional)</Label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Medical appointment" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!startDate || !endDate || saving}>
              {saving ? "Saving…" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteWorkerDialog({ worker, open, onOpenChange, onConfirm, isPending }: {
  worker: Worker; open: boolean; onOpenChange: (o: boolean) => void;
  onConfirm: () => void; isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Tradie</DialogTitle>
          <DialogDescription>
            Remove <strong>{worker.name}</strong>? They will be unassigned from future jobs.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button variant="destructive" onClick={() => { onConfirm(); onOpenChange(false); }} disabled={isPending}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Worker row ────────────────────────────────────────────────────────────────

function WorkerRow({
  worker,
  idx,
  leaveRequests,
  onEdit,
  onDelete,
  onToggleAvail,
  onRefreshLeave,
  weekJobs,
}: {
  worker: Worker;
  idx: number;
  leaveRequests: LeaveRequest[];
  onEdit: () => void;
  onDelete: () => void;
  onToggleAvail: (checked: boolean) => void;
  onRefreshLeave: () => void;
  weekJobs: { scheduledDate?: string | null; estimatedHours?: number | null; assignedWorkerIds: number[] }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const myLeave = leaveRequests.filter(r => r.workerId === worker.id);
  const pendingLeave = myLeave.filter(r => r.status === "pending");

  const skills = worker.skills ?? [];
  const SKILL_LIMIT = 3;
  const visibleSkills = skills.slice(0, SKILL_LIMIT);
  const extraSkills = skills.length - SKILL_LIMIT;

  // Weekly utilization
  const cap = worker.maxWeeklyHours ?? 38;
  const scheduledHrs = weekJobs
    .filter(j => j.assignedWorkerIds.includes(worker.id))
    .reduce((s, j) => s + (j.estimatedHours ?? 0), 0);
  const pct = Math.min(100, Math.round((scheduledHrs / cap) * 100));
  const overCap = pct >= 100;
  const nearCap = pct >= 80 && !overCap;

  return (
    <>
      {/* Main row */}
      <div className={`grid items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-white/[0.02] transition-colors group
        ${expanded ? "bg-white/[0.03]" : ""}`}
        style={{ gridTemplateColumns: "2rem 2.5rem 1fr 1fr 10rem 7rem 2.5rem" }}
      >
        {/* # */}
        <span className="text-xs text-muted-foreground font-mono text-right">{idx + 1}</span>

        {/* Avatar */}
        <Avatar name={worker.name} />

        {/* Agent info */}
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground leading-tight truncate">{worker.name}</p>
          <p className="text-xs text-primary truncate">{worker.tradeType}</p>
          {worker.phone && (
            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Phone size={9} />
              <a href={`tel:${worker.phone}`} className="hover:text-primary">{worker.phone}</a>
            </p>
          )}
        </div>

        {/* Skills */}
        <div className="flex flex-wrap gap-1 items-center min-w-0">
          {visibleSkills.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">—</span>
          ) : (
            <>
              {visibleSkills.map(s => (
                <span key={s}
                  className="bg-primary/10 border border-primary/20 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                  {s}
                </span>
              ))}
              {extraSkills > 0 && (
                <span className="bg-secondary text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                  +{extraSkills}
                </span>
              )}
            </>
          )}
        </div>

        {/* Availability */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Switch.Root
              className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${worker.isAvailable ? "bg-green-500" : "bg-muted"}`}
              checked={worker.isAvailable}
              onCheckedChange={onToggleAvail}
            >
              <Switch.Thumb className={`block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform translate-x-0.5 ${worker.isAvailable ? "translate-x-[19px]" : ""}`} />
            </Switch.Root>
            <span className={`text-xs font-medium ${worker.isAvailable ? "text-green-400" : "text-muted-foreground"}`}>
              {worker.isAvailable ? "Available" : "Off Duty"}
            </span>
          </div>
          {!worker.isAvailable && <UnavailableUntilLabel until={worker.unavailableUntil} />}
        </div>

        {/* Utilisation */}
        <div className="min-w-0">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span className="flex items-center gap-0.5"><Clock size={9} /> Week</span>
            <span className={overCap ? "text-destructive font-bold" : nearCap ? "text-orange-400 font-bold" : ""}>
              {scheduledHrs.toFixed(0)}/{cap}h
            </span>
          </div>
          <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${overCap ? "bg-destructive" : nearCap ? "bg-orange-400" : "bg-green-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {worker.hourlyRate && (
            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-0.5">
              <DollarSign size={9} />{worker.hourlyRate}/hr
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 justify-end relative">
          {pendingLeave.length > 0 && (
            <button
              onClick={() => setExpanded(o => !o)}
              className="flex items-center gap-1 text-[9px] bg-yellow-500 text-black font-bold px-1.5 py-0.5 rounded-full"
              title="Pending leave requests"
            >
              <ClipboardList size={9} />{pendingLeave.length}
            </button>
          )}

          <button
            onClick={() => setExpanded(o => !o)}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            title="Expand details"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {/* 3-dot menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-8 z-20 bg-card border border-border rounded-lg shadow-xl py-1 w-36"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  onClick={() => { setMenuOpen(false); onEdit(); }}
                  className="flex items-center gap-2 px-3 py-2 text-sm w-full hover:bg-white/5 transition-colors"
                >
                  <Edit2 size={13} /> Edit
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                  className="flex items-center gap-2 px-3 py-2 text-sm w-full hover:bg-destructive/10 text-destructive transition-colors"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded row — leave + contact details */}
      {expanded && (
        <div className="bg-card/30 border-b border-border/50 px-4 py-4"
          style={{ paddingLeft: "calc(2rem + 2.5rem + 0.75rem + 1rem)" }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
            {/* Contact */}
            <div>
              <p className="text-[10px] uppercase font-display tracking-widest text-muted-foreground mb-2">Contact</p>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                {worker.phone ? (
                  <div className="flex items-center gap-2"><Phone size={12} className="text-primary" />
                    <a href={`tel:${worker.phone}`} className="hover:text-primary">{worker.phone}</a>
                  </div>
                ) : <p className="text-xs italic">No phone</p>}
                {worker.email ? (
                  <div className="flex items-center gap-2"><Mail size={12} className="text-primary" />
                    <a href={`mailto:${worker.email}`} className="hover:text-primary truncate">{worker.email}</a>
                  </div>
                ) : <p className="text-xs italic">No email</p>}
              </div>
              {skills.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase font-display tracking-widest text-muted-foreground mb-1.5">All Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {skills.map(s => (
                      <span key={s} className="bg-primary/10 border border-primary/20 text-primary text-[10px] px-1.5 py-0.5 rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Leave */}
            <div>
              <p className="text-[10px] uppercase font-display tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                <ClipboardList size={10} /> Leave
                {pendingLeave.length > 0 && (
                  <span className="bg-yellow-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingLeave.length} pending
                  </span>
                )}
              </p>
              <LeavePanel worker={worker} leaveRequests={leaveRequests} onRefresh={onRefreshLeave} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function WorkersList() {
  const queryClient = useQueryClient();
  const { data: workers, isLoading } = useListWorkers();
  const { data: allJobs = [] } = useListJobs();
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Worker | null>(null);
  const [unavailTarget, setUnavailTarget] = useState<Worker | null>(null);
  const [editTarget, setEditTarget] = useState<Worker | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const loadLeave = () => {
    fetch("/api/leave", { credentials: "include" })
      .then(r => r.json())
      .then(setLeaveRequests)
      .catch(() => {});
  };
  useEffect(() => { loadLeave(); }, []);

  const createWorker = useCreateWorker({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
        toast.success("Tradie added!");
        setIsAddOpen(false);
        setServerError(null);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || err?.message || "Failed to add tradie.";
        setServerError(msg);
        toast.error("Failed to add tradie", { description: msg });
      },
    },
  });

  const updateWorker = useUpdateWorker({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
        toast.success("Tradie updated");
        setEditTarget(null);
      },
      onError: () => toast.error("Failed to update tradie"),
    },
  });

  const deleteWorker = useDeleteWorker({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
        toast.success("Tradie removed");
        setDeleteTarget(null);
      },
      onError: () => toast.error("Failed to delete tradie"),
    },
  });

  const handleAvailabilityToggle = (worker: Worker, checked: boolean) => {
    if (checked) {
      updateWorker.mutate({ id: worker.id, data: { ...worker, skills: worker.skills ?? [], isAvailable: true, unavailableUntil: null } });
    } else {
      setUnavailTarget(worker);
    }
  };

  // Week bounds for utilization
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = addDays(weekStart, 7);
  const weekJobs = allJobs.filter(j => {
    if (!j.scheduledDate) return false;
    const d = new Date(j.scheduledDate);
    return d >= weekStart && d < weekEnd;
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground">Workforce</h1>
          <p className="text-muted-foreground mt-1">Skills, availability, leave, and capacity.</p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={o => { setIsAddOpen(o); if (!o) setServerError(null); }}>
          <DialogTrigger asChild>
            <Button className="shadow-lg"><Users className="mr-2" size={16} /> Add Tradie</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Tradie</DialogTitle></DialogHeader>
            {serverError && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg p-3">{serverError}</div>
            )}
            <WorkerForm
              defaultValues={{}}
              isPending={createWorker.isPending}
              submitLabel="Add Tradie"
              onSave={data => {
                setServerError(null);
                createWorker.mutate({ data: { ...data, phone: data.phone || null, email: data.email || null } });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-card rounded-lg animate-pulse" />)}
        </div>
      ) : !workers?.length ? (
        <div className="py-20 text-center text-muted-foreground bg-card/30 rounded-xl border border-dashed border-white/10">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-display uppercase">No tradies yet</h3>
          <p>Add your first tradie to start assigning jobs.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card/20">
          {/* Column headers */}
          <div
            className="grid px-4 py-2.5 bg-card/50 border-b border-border text-[10px] uppercase font-display tracking-widest text-muted-foreground"
            style={{ gridTemplateColumns: "2rem 2.5rem 1fr 1fr 10rem 7rem 2.5rem" }}
          >
            <span>#</span>
            <span />
            <span>Agent</span>
            <span>Skills</span>
            <span>Availability</span>
            <span>Capacity</span>
            <span />
          </div>

          {/* Rows */}
          {workers.map((worker, idx) => (
            <WorkerRow
              key={worker.id}
              worker={worker}
              idx={idx}
              leaveRequests={leaveRequests}
              onEdit={() => setEditTarget(worker)}
              onDelete={() => setDeleteTarget(worker)}
              onToggleAvail={c => handleAvailabilityToggle(worker, c)}
              onRefreshLeave={loadLeave}
              weekJobs={weekJobs}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      {unavailTarget && (
        <UnavailabilityDialog
          worker={unavailTarget} open={!!unavailTarget}
          onOpenChange={o => !o && setUnavailTarget(null)}
          onConfirm={until => {
            updateWorker.mutate({
              id: unavailTarget.id,
              data: { ...unavailTarget, skills: unavailTarget.skills ?? [], isAvailable: false, unavailableUntil: until },
            });
            setUnavailTarget(null);
          }}
          isPending={updateWorker.isPending}
        />
      )}

      {deleteTarget && (
        <DeleteWorkerDialog
          worker={deleteTarget} open={!!deleteTarget}
          onOpenChange={o => !o && setDeleteTarget(null)}
          onConfirm={() => deleteWorker.mutate({ id: deleteTarget.id })}
          isPending={deleteWorker.isPending}
        />
      )}

      {editTarget && (
        <Dialog open={!!editTarget} onOpenChange={o => !o && setEditTarget(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Worker — {editTarget.name}</DialogTitle>
            </DialogHeader>
            <WorkerForm
              defaultValues={{
                name: editTarget.name,
                tradeType: editTarget.tradeType,
                phone: editTarget.phone ?? "",
                email: editTarget.email ?? "",
                isAvailable: editTarget.isAvailable,
                skills: editTarget.skills ?? [],
                hourlyRate: editTarget.hourlyRate ?? null,
                maxWeeklyHours: editTarget.maxWeeklyHours ?? 38,
              }}
              isPending={updateWorker.isPending}
              submitLabel="Save Changes"
              onSave={data => {
                updateWorker.mutate({
                  id: editTarget.id,
                  data: {
                    ...data,
                    phone: data.phone || null,
                    email: data.email || null,
                    isAvailable: editTarget.isAvailable,
                    unavailableUntil: editTarget.unavailableUntil,
                  },
                });
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
