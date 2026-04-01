import { Job, Worker, useDeleteJob, useTriggerEmergency, useConvertToBooking, useUpdateJob } from "@/lib/api-client";
import { formatAUD, formatAusDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Mail, Clock, Calendar, Users, AlertTriangle, FileText, Check, Trash2, Edit2, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { useState } from "react";
import { JobForm } from "./JobForm";

export function JobCard({ job }: { job: Job }) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  
  const deleteMutation = useDeleteJob({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/jobs"] })
    }
  });

  const emergencyMutation = useTriggerEmergency({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/jobs"] })
    }
  });

  const convertMutation = useConvertToBooking({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/jobs"] })
    }
  });

  const completeMutation = useUpdateJob({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/jobs"] })
    }
  });

  const isQuote = job.jobType === "quote";
  const isCompleted = job.status === "completed";
  const isCancelled = job.status === "cancelled";

  return (
    <Card className={`relative overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 ${job.isEmergency ? 'border-destructive/50 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : isCompleted ? 'border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.1)]' : 'border-white/5 hover:border-white/10'}`}>
      {/* Top Banner / Indicators */}
      {job.isEmergency && (
        <div className="bg-destructive text-destructive-foreground font-display font-bold uppercase text-center py-1.5 text-sm emergency-pulse tracking-widest flex items-center justify-center gap-2">
          <AlertTriangle size={16} /> CODE 9 EMERGENCY
        </div>
      )}

      {isCompleted && (
        <div className="bg-green-600 text-white font-display font-bold uppercase text-center py-1.5 text-sm tracking-widest flex items-center justify-center gap-2">
          <CheckCircle2 size={16} /> JOB COMPLETED
        </div>
      )}
      
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex gap-2 items-center mb-2">
              <Badge variant={job.jobType === "quote" ? "secondary" : "default"}>
                {job.jobType}
              </Badge>
              <Badge variant={`validity${job.validityCode}` as any}>
                Code {job.validityCode}
              </Badge>
              <Badge variant={job.status as any}>
                {job.status.replace("_", " ")}
              </Badge>
            </div>
            <h3 className="font-display text-2xl font-bold text-foreground leading-tight">{job.title}</h3>
            <p className="text-primary font-semibold text-sm">{job.tradeType}</p>
          </div>
          
          <div className="text-right">
            <div className="font-display text-2xl font-bold text-foreground">{formatAUD(job.price)}</div>
            {job.smartScore !== null && job.smartScore !== undefined && (
              <div className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded mt-1">Score: {job.smartScore.toFixed(2)}</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground mt-6">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <MapPin size={16} className="text-primary shrink-0 mt-0.5" />
              <div>
                <span className="text-foreground block">{job.address}</span>
                {job.distanceKm !== null && job.distanceKm !== undefined && (
                  <span className="text-xs text-orange-400">{job.distanceKm} km away</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users size={16} className="text-primary shrink-0" />
              <span className="text-foreground">{job.clientName}</span>
            </div>
            {job.clientPhone && (
              <div className="flex items-center gap-2">
                <Phone size={16} className="text-primary shrink-0" />
                <span>{job.clientPhone}</span>
              </div>
            )}
            {job.clientEmail && (
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-primary shrink-0" />
                <span className="truncate">{job.clientEmail}</span>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-primary shrink-0" />
              <span>{formatAusDate(job.scheduledDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-primary shrink-0" />
              <span>{job.estimatedHours} hrs est.</span>
            </div>
            {!isQuote && (
              <>
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-primary shrink-0" />
                  <span>{job.numTradies} Tradies Req.</span>
                </div>
                {job.assignedWorkers && job.assignedWorkers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {job.assignedWorkers.map((w: Worker) => (
                      <span key={w.id} className="text-[10px] bg-secondary px-2 py-0.5 rounded text-foreground">{w.name}</span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        
        {/* Actions Footer */}
        <div className="mt-6 pt-4 border-t border-border flex flex-wrap gap-2 justify-between items-center">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Edit2 size={14} className="mr-1" /> Edit
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="text-destructive hover:bg-destructive/20 hover:text-destructive hover:border-destructive"
              onClick={() => {
                if (confirm("Delete this job permanently?")) {
                  deleteMutation.mutate({ id: job.id });
                }
              }}
            >
              <Trash2 size={14} />
            </Button>
          </div>
          
          <div className="flex gap-2">
            {isQuote ? (
              <Button 
                size="sm" 
                variant="default"
                onClick={() => {
                  convertMutation.mutate({ 
                    id: job.id, 
                    data: { estimatedHours: job.estimatedHours || 1 } 
                  });
                }}
                disabled={convertMutation.isPending}
              >
                <Check size={14} className="mr-1" /> Convert to Booking
              </Button>
            ) : (
              <>
                {!isCompleted && !isCancelled && (
                  <Button
                    size="sm"
                    variant="default"
                    className="bg-green-600 hover:bg-green-700 text-white font-bold"
                    onClick={() => {
                      if (confirm("Mark this job as completed?")) {
                        completeMutation.mutate({
                          id: job.id,
                          data: {
                            status: "completed",
                            completedDate: new Date().toISOString(),
                          },
                        });
                      }
                    }}
                    disabled={completeMutation.isPending}
                  >
                    <CheckCircle2 size={14} className="mr-1" /> Mark Complete
                  </Button>
                )}

                {!job.isEmergency && !isCompleted && !isCancelled && (
                  <Button 
                    size="sm" 
                    variant="destructive"
                    className="bg-red-600 hover:bg-red-700 font-bold"
                    onClick={() => {
                      if (confirm("Trigger CODE 9 EMERGENCY? This will bump all other bookings.")) {
                        emergencyMutation.mutate({ id: job.id });
                      }
                    }}
                    disabled={emergencyMutation.isPending}
                  >
                    <AlertTriangle size={14} className="mr-1" /> CODE 9
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
    <FileText size={14} className="mr-1" /> Download Invoice
  </Button>
) : (
  <Button size="sm" variant="secondary" disabled>
    <FileText size={14} className="mr-1" /> Invoice
  </Button>
)}
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Job #{job.id}</DialogTitle>
          </DialogHeader>
          <JobForm initialData={job} onSuccess={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
