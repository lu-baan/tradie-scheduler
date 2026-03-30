import { useListJobs } from "@/lib/api-client";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatAusDateTime } from "@/lib/utils";

export function CalendarView() {
  const { data: jobs, isLoading } = useListJobs();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const nextWeek = () => setCurrentWeekStart(addDays(currentWeekStart, 7));
  const prevWeek = () => setCurrentWeekStart(addDays(currentWeekStart, -7));

  const days = Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));

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
            {format(currentWeekStart, "MMM d")} - {format(addDays(currentWeekStart, 6), "MMM d, yyyy")}
          </div>
          <Button variant="ghost" size="icon" onClick={nextWeek}><ChevronRight /></Button>
        </div>
      </div>

      <div className="flex-1 bg-card border border-white/5 rounded-xl shadow-xl overflow-hidden flex flex-col">
        {/* Header Row */}
        <div className="grid grid-cols-7 border-b border-border bg-background/50">
          {days.map(day => (
            <div key={day.toISOString()} className="p-4 text-center border-r border-border last:border-r-0">
              <div className="font-display uppercase text-muted-foreground text-xs font-semibold">{format(day, "EEEE")}</div>
              <div className={`text-2xl font-bold mt-1 ${isSameDay(day, new Date()) ? 'text-primary' : 'text-foreground'}`}>
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-7 flex-1 min-h-[500px]">
          {days.map(day => {
            const dayJobs = jobs?.filter(j => j.scheduledDate && isSameDay(new Date(j.scheduledDate), day)) || [];
            
            return (
              <div key={day.toISOString()} className="border-r border-border last:border-r-0 p-2 space-y-2 bg-card/30">
                {isLoading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-16 bg-white/5 rounded-md" />
                  </div>
                ) : dayJobs.map(job => (
                  <div 
                    key={job.id} 
                    className={`p-2 rounded-md border text-xs cursor-pointer transition-transform hover:scale-105 shadow-md ${
                      job.isEmergency 
                        ? 'bg-destructive/20 border-destructive text-destructive-foreground' 
                        : job.jobType === 'quote' 
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-100'
                          : 'bg-primary/10 border-primary/30 text-primary-foreground'
                    }`}
                  >
                    <div className="font-bold truncate">{job.title}</div>
                    <div className="text-[10px] opacity-80 mt-1">{job.clientName}</div>
                    <div className="text-[10px] opacity-80">{job.tradeType}</div>
                    {job.isEmergency && <div className="text-[9px] font-bold text-red-400 mt-1 uppercase">CODE 9</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
