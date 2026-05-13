import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Save, User, Eye, EyeOff, Lock, CalendarDays, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { LeaveRequest } from "@/lib/api-client";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: "Sick Leave", annual: "Annual Leave", training: "Training",
  personal: "Personal", other: "Other",
};
const LEAVE_STATUS_STYLES: Record<string, string> = {
  pending:  "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
  approved: "bg-green-500/10  border-green-500/30  text-green-400",
  denied:   "bg-destructive/10 border-destructive/30 text-destructive",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">
      {children}
    </label>
  );
}

export function WorkerSettings() {
  const workerId = (() => {
    const v = sessionStorage.getItem("ts2_worker_id");
    if (!v || v === "null") return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  })();

  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [email, setEmail] = useState(() => sessionStorage.getItem("ts2_email") ?? "");
  const [name, setName] = useState("");
  const [tradeType, setTradeType] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // ── Leave ──────────────────────────────────────────────────────────────────
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveOpen, setLeaveOpen]         = useState(false);
  const [leaveType, setLeaveType]         = useState<"sick"|"annual"|"training"|"personal"|"other">("annual");
  const [leaveStart, setLeaveStart]       = useState("");
  const [leaveEnd, setLeaveEnd]           = useState("");
  const [leaveStartTime, setLeaveStartTime] = useState("");
  const [leaveEndTime, setLeaveEndTime]   = useState("");
  const [leaveReason, setLeaveReason]     = useState("");
  const [leaveSaving, setLeaveSaving]     = useState(false);
  const [cancellingId, setCancellingId]   = useState<number | null>(null);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const loadLeave = () => {
    fetch("/api/leave", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setLeaveRequests)
      .catch(() => {});
  };

  const handleLeaveSubmit = async () => {
    if (!leaveStart || !leaveEnd || !workerId) return;
    setLeaveSaving(true);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workerId,
          leaveType,
          startDate: leaveStart,
          endDate: leaveEnd,
          startTime: leaveStartTime || null,
          endTime: leaveEndTime || null,
          reason: leaveReason || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Leave request submitted");
      loadLeave();
      setLeaveOpen(false);
      setLeaveStart(""); setLeaveEnd(""); setLeaveStartTime(""); setLeaveEndTime(""); setLeaveReason("");
    } catch {
      toast.error("Failed to submit leave request");
    } finally {
      setLeaveSaving(false);
    }
  };

  const handleCancelLeave = async (id: number) => {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/leave/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
      toast.success("Leave request cancelled");
      loadLeave();
    } catch {
      toast.error("Failed to cancel leave request");
    } finally {
      setCancellingId(null);
    }
  };

  const [pwCurrent, setPwCurrent]         = useState("");
  const [pwNew, setPwNew]                 = useState("");
  const [pwConfirm, setPwConfirm]         = useState("");
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNew, setShowPwNew]         = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [pwSaving, setPwSaving]           = useState(false);
  const [pwError, setPwError]             = useState<string | null>(null);

  const handleChangePassword = async () => {
    setPwError(null);
    if (pwNew.length < 8) { setPwError("New password must be at least 8 characters"); return; }
    if (pwNew !== pwConfirm) { setPwError("New passwords do not match"); return; }
    setPwSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to change password");
      }
      toast.success("Password changed successfully");
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
    } catch (err: any) {
      setPwError(err.message || "Failed to change password");
    } finally {
      setPwSaving(false);
    }
  };

  useEffect(() => {
    fetch("/api/workers/me", { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((me: any) => {
        setName(me.name ?? "");
        setPhone(me.phone ?? "");
        setEmail(me.email ?? sessionStorage.getItem("ts2_email") ?? "");
        setTradeType(me.tradeType ?? "");
      })
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
    loadLeave();
  }, []);

  const handleSave = async () => {
    if (!workerId) return;
    if (phone && !/^(\+?61|0)[2-478]\d{8}$/.test(phone)) {
      setPhoneError("Enter a valid Australian phone number");
      return;
    }
    setSaving(true);
    try {
      const [workerRes] = await Promise.all([
        fetch(`/api/workers/${workerId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name, phone, email, tradeType, isAvailable: true }),
        }),
        fetch("/api/auth/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            loginNumber: sessionStorage.getItem("ts2_login_number") ?? "",
            email,
          }),
        }),
      ]);
      if (!workerRes.ok) throw new Error("Failed to save");
      sessionStorage.setItem("ts2_email", email);
      toast.success("Profile updated successfully");
      setHasChanges(false);
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center text-muted-foreground text-sm">Loading...</div>;
  }

  if (!workerId) {
    return <div className="text-muted-foreground text-sm">No worker profile linked to your account.</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-xl">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground">My Profile</h1>
          <p className="text-muted-foreground mt-1">Update your contact details.</p>
        </div>
        {hasChanges && (
          <Button onClick={handleSave} disabled={saving} className="shadow-[0_0_20px_rgba(234,88,12,0.4)]">
            <Save size={16} className="mr-2" />
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        )}
      </div>

      <Card className="p-6 bg-card border-white/5 shadow-2xl">
        <div className="flex items-center gap-2 mb-5">
          <User size={20} className="text-primary" />
          <h3 className="font-display text-lg text-primary uppercase">Contact Details</h3>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Full Name</Label>
            <Input value={name} disabled className="opacity-50 cursor-not-allowed" />
            <p className="text-xs text-muted-foreground mt-1">Contact admin to change your name.</p>
          </div>

          <div>
            <Label>Trade Type</Label>
            <Input value={tradeType} disabled className="opacity-50 cursor-not-allowed" />
          </div>

          <div>
            <Label>Phone Number</Label>
            <Input
              type="tel"
              value={phone}
              placeholder="e.g. 0411 234 567"
              onChange={e => { setPhone(e.target.value); setHasChanges(true); setPhoneError(""); }}
              onBlur={() => {
                if (phone && !/^(\+?61|0)[2-478]\d{8}$/.test(phone))
                  setPhoneError("Enter a valid Australian phone number");
                else setPhoneError("");
              }}
              className={phoneError ? "border-destructive" : ""}
            />
            {phoneError && <p className="text-destructive text-xs mt-1">{phoneError}</p>}
          </div>

          <div>
            <Label>Email Address</Label>
            <Input
              type="email"
              value={email}
              placeholder="e.g. you@example.com"
              onChange={e => { setEmail(e.target.value); setHasChanges(true); }}
            />
          </div>
        </div>
      </Card>

      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="lg" className="shadow-[0_0_20px_rgba(234,88,12,0.4)] font-bold">
            <Save size={18} className="mr-2" />
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      )}

      {/* Change Password */}
      <Card className="p-6 bg-card border-white/5 shadow-2xl">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={20} className="text-primary" />
          <h3 className="font-display text-lg text-primary uppercase">Change Password</h3>
        </div>
        <div className="space-y-4">
          {pwError && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg p-3">
              {pwError}
            </div>
          )}
          <div>
            <Label>Current Password</Label>
            <div className="relative mt-1">
              <input
                type={showPwCurrent ? "text" : "password"}
                value={pwCurrent}
                onChange={e => { setPwCurrent(e.target.value); setPwError(null); }}
                placeholder="Current password"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowPwCurrent(p => !p)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors">
                {showPwCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <Label>New Password</Label>
            <div className="relative mt-1">
              <input
                type={showPwNew ? "text" : "password"}
                value={pwNew}
                onChange={e => { setPwNew(e.target.value); setPwError(null); }}
                placeholder="At least 8 characters"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowPwNew(p => !p)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors">
                {showPwNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <Label>Confirm New Password</Label>
            <div className="relative mt-1">
              <input
                type={showPwConfirm ? "text" : "password"}
                value={pwConfirm}
                onChange={e => { setPwConfirm(e.target.value); setPwError(null); }}
                placeholder="Re-enter new password"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button type="button" tabIndex={-1} onClick={() => setShowPwConfirm(p => !p)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors">
                {showPwConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleChangePassword}
              disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}
              size="sm"
            >
              <Lock size={14} className="mr-1.5" />
              {pwSaving ? "Saving…" : "Change Password"}
            </Button>
          </div>
        </div>
      </Card>
      {/* Leave Requests */}
      <Card className="p-6 bg-card border-white/5 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <CalendarDays size={20} className="text-primary" />
            <h3 className="font-display text-lg text-primary uppercase">My Leave</h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => setLeaveOpen(true)}>
            <Plus size={14} className="mr-1" /> Request Leave
          </Button>
        </div>

        {leaveRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No leave requests yet.</p>
        ) : (
          <div className="space-y-2">
            {leaveRequests.map(r => (
              <div key={r.id} className={`rounded-lg border p-3 text-sm ${LEAVE_STATUS_STYLES[r.status]}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{LEAVE_TYPE_LABELS[r.leaveType]} · <span className="capitalize">{r.status}</span></p>
                    <p className="text-xs mt-0.5 text-muted-foreground">
                      {r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}
                      {r.startTime ? ` · ${r.startTime}–${r.endTime}` : ""}
                    </p>
                    {r.reason && <p className="text-xs mt-0.5 italic text-muted-foreground">"{r.reason}"</p>}
                    {r.adminNote && <p className="text-xs mt-0.5 font-medium">Note: {r.adminNote}</p>}
                  </div>
                  {r.status === "pending" && (
                    <button
                      onClick={() => handleCancelLeave(r.id)}
                      disabled={cancellingId === r.id}
                      className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="Cancel request"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Request Leave dialog */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Leave Type</Label>
              <select
                value={leaveType}
                onChange={e => setLeaveType(e.target.value as any)}
                className="w-full h-10 rounded-md border border-input bg-background/50 px-3 text-sm"
              >
                {Object.entries(LEAVE_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date *</Label>
                <Input type="date" min={todayStr} value={leaveStart} onChange={e => { setLeaveStart(e.target.value); if (!leaveEnd) setLeaveEnd(e.target.value); }} />
              </div>
              <div>
                <Label>End Date *</Label>
                <Input type="date" min={leaveStart || todayStr} value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From Time (optional)</Label>
                <Input type="time" value={leaveStartTime} onChange={e => setLeaveStartTime(e.target.value)} />
              </div>
              <div>
                <Label>To Time (optional)</Label>
                <Input type="time" value={leaveEndTime} onChange={e => setLeaveEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Input value={leaveReason} onChange={e => setLeaveReason(e.target.value)} placeholder="e.g. Medical appointment" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setLeaveOpen(false)} disabled={leaveSaving}>Cancel</Button>
            <Button onClick={handleLeaveSubmit} disabled={!leaveStart || !leaveEnd || leaveSaving}>
              {leaveSaving ? "Submitting…" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
