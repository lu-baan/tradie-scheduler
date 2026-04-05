import { Job, Worker, useDeleteJob, useTriggerEmergency, useConvertToBooking, useUpdateJob } from "@/lib/api-client";
import { formatAUD, formatAusDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin, Phone, Mail, Clock, Calendar, Users, AlertTriangle, FileText,
  Check, Trash2, Edit2, CheckCircle2, Car,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
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

// ── JobCard ───────────────────────────────────────────────────────────────────

export function JobCard({ job }: { job: Job }) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
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
                  {job.assignedWorkers && job.assignedWorkers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {job.assignedWorkers.map((w: Worker) => (
                        <span key={w.id} className="text-[10px] bg-secondary px-2 py-0.5 rounded text-foreground">
                          {w.name}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Notes preview */}
          {job.notes && (
            <div className="mt-4 p-3 bg-secondary/30 rounded-lg border border-white/5">
              <p className="text-xs text-muted-foreground line-clamp-2 break-words">{job.notes}</p>
            </div>
          )}

          {/* Actions Footer */}
          <div className="mt-4 sm:mt-6 pt-4 border-t border-border flex flex-wrap gap-2 justify-between items-center">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Edit2 size={13} className="mr-1" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 size={13} />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {isQuote ? (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => convertMutation.mutate({ id: job.id, data: { estimatedHours: job.estimatedHours || 1 } })}
                  disabled={convertMutation.isPending}
                >
                  <Check size={13} className="mr-1" /> Convert
                </Button>
              ) : (
                <>
                  {!isCompleted && !isCancelled && (
                    <Button
                      size="sm"
                      variant="default"
                      className="bg-green-600 hover:bg-green-700 text-white font-bold"
                      onClick={() => setCompleteConfirmOpen(true)}
                      disabled={completeMutation.isPending}
                    >
                      <CheckCircle2 size={13} className="mr-1" /> Complete
                    </Button>
                  )}
                  {!job.isEmergency && !isCompleted && !isCancelled && (
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
                  {job.isEmergency && !isCompleted && !isCancelled && (
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
                </>
              )}

              {isCompleted ? (
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
              ) : (
                <Button size="sm" variant="secondary" disabled>
                  <FileText size={13} className="mr-1" /> Invoice
                </Button>
              )}
            </div>
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
