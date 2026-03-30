import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { JobForm } from "./JobForm";
import { Job } from "@/lib/api-client";

interface JobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: Job | null;
}

export function JobDialog({ open, onOpenChange, job }: JobDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border/50 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-foreground">
            {job ? "Edit Job" : "New Job"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {job ? "Update the details of the scheduled job." : "Fill in the details to schedule a new job."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4">
          <JobForm 
            initialData={job || undefined} 
            onSuccess={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
