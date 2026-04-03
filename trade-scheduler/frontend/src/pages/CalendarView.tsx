import { useListJobs } from "@/lib/api-client";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, Users } from "lucide-react";
import { formatAUD } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { JobForm } from "@/components/jobs/JobForm";

export function CalendarView() {
  const { data: jobs, isLoading } = useListJobs();
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);

  const nextWeek = () => setCurrentWeekStart(addDays(currentWeekStart, 7));
  const prevWeek = () => setCurrentWeekStart(addDays(currentWeekStart, -7));

  const days = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "h:mm a");
    } catch {
      return "";
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground">Schedule</h1>
          <p className="text-muted-foreground mt-1">Weekly operations view.</p>
        </div>
        <div className="flex items-center gap-4 bg-card border border-border rounded-lg p-1 shadow-lg">
          <Button variant="ghost" size="icon" onClick={prevWeek}><ChevronLeft /></Button>
          <div className="font-display font-bold text-lg min-w-[200px] text-center uppercase tracking-wider">
            {format(currentWeekStart, "MMM d")} – {format(addDays(currentWeekStart, 6), "MMM d, yyyy")}
          </div>
          <Button variant="ghost" size="icon" onClick={nextWeek}><ChevronRight /></Button>
        </div>
      </div>

      <div className="flex-1 bg-card border border-white/5 rounded-xl shadow-xl overflow-hidden flex flex-col">
        {/* Header Row */}
        <div className="grid grid-cols-7 border-b border-border bg-background/50">
          {days.map(day => (
            <div key={day.toISOString()} className="p-4 text-center border-r border-border last:border-r-0">
              <div className="font-display uppercase text-muted-foreground text-xs font-semibold">
                {format(day, "EEEE")}
              </div>
              <div className={`text-2xl font-bold mt-1 ${isSameDay(day, new Date()) ? "text-primary" : "text-foreground"}`}>
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-7 flex-1 min-h-[500px]">
          {days.map(day => {
            const dayJobs =
              jobs?.filter(j => j.scheduledDate && isSameDay(new Date(j.scheduledDate), day)) || [];

            const sorted = [...dayJobs].sort((a, b) => {
              if (!a.scheduledDate || !b.scheduledDate) return 0;
              return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
            });

            return (
              <div
                key={day.toISOString()}
                className="border-r border-border last:border-r-0 p-2 space-y-2 bg-card/30"
              >
                {isLoading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-16 bg-white/5 rounded-md" />
                  </div>
                ) : (
                  sorted.map(job => (
                    <div
                      key={job.id}
                      onClick={() => { setSelectedJob(job); setEditOpen(true); }}
                      className={`p-2.5 rounded-md border text-xs cursor-pointer transition-all hover:scale-[1.03] shadow-md ${
                        job.isEmergency
                          ? "bg-destructive/20 border-destructive text-destructive-foreground"
                          : job.jobType === "quote"
                          ? "bg-blue-500/10 border-blue-500/30 text-blue-100"
                          : job.status === "completed"
                          ? "bg-green-500/10 border-green-500/30 text-green-100"
                          : "bg-primary/10 border-primary/30 text-primary-foreground"
                      }`}
                    >
                      {/* Time */}
                      {job.scheduledDate && (
                        <div className="flex items-center gap-1 text-[10px] opacity-80 mb-1">
                          <Clock size={10} />
                          <span className="font-semibold">{formatTime(job.scheduledDate)}</span>
                          <span className="opacity-60">({job.estimatedHours}h)</span>
                        </div>
                      )}

                      {/* Title */}
                      <div className="font-bold truncate">{job.title}</div>

                      {/* Client */}
                      <div className="text-[10px] opacity-80 mt-1">{job.clientName}</div>

                      {/* Price & Workers */}
                      <div className="flex items-center justify-between mt-1.5 gap-1">
                        <span className="text-[10px] font-semibold opacity-90">
                          {formatAUD(job.price)}
                        </span>
                        {job.numTradies > 1 && (
                          <div className="flex items-center gap-0.5 text-[9px] opacity-70">
                            <Users size={9} />
                            <span>{job.numTradies}</span>
                          </div>
                        )}
                      </div>

                      {/* Badges */}
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          job.jobType === "quote" ? "bg-blue-500/20 text-blue-300" : "bg-primary/20 text-primary"
                        }`}>
                          {job.jobType}
                        </span>
                        {job.isEmergency && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase bg-red-500/30 text-red-400">
                            CODE 9
                          </span>
                        )}
                        {job.assignedWorkers && job.assignedWorkers.length > 0 && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/10 opacity-70">
                            {job.assignedWorkers.map((w: any) => w.name.split(" ")[0]).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit dialog on calendar entry click */}
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
