import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { JobForm } from "./JobForm";
import { Job, CreateJobRequest, UpdateJobRequest } from "@workspace/api-client-react";
import { useCreateJob, useUpdateJob, getListJobsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface JobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: Job | null;
}

export function JobDialog({ open, onOpenChange, job }: JobDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        toast({ title: "Success", description: "Job created successfully" });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: "Error", description: err.error?.error || "Failed to create job", variant: "destructive" });
      }
    }
  });

  const updateMutation = useUpdateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        toast({ title: "Success", description: "Job updated successfully" });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({ title: "Error", description: err.error?.error || "Failed to update job", variant: "destructive" });
      }
    }
  });

  const handleSubmit = (data: any) => {
    // For demo purposes, assign random slightly offset coordinates to simulate a location based on address
    const mockLat = 40.7128 + (Math.random() - 0.5) * 0.1;
    const mockLng = -74.0060 + (Math.random() - 0.5) * 0.1;

    const payload = {
      ...data,
      latitude: data.latitude || mockLat,
      longitude: data.longitude || mockLng,
      scheduledDate: data.scheduledDate ? new Date(data.scheduledDate).toISOString() : null,
    };

    if (job) {
      updateMutation.mutate({ id: job.id, data: payload as UpdateJobRequest });
    } else {
      createMutation.mutate({ data: payload as CreateJobRequest });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

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
            onSubmit={handleSubmit} 
            isPending={isPending}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
