import { useState } from "react";
import {
  useListWorkers,
  useCreateWorker,
  useUpdateWorker,
  useDeleteWorker,
  Worker,
} from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Users, Phone, Mail, Trash2 } from "lucide-react";
import * as Switch from "@radix-ui/react-switch";
import { toast } from "sonner";

// ── Schema ────────────────────────────────────────────────────────────────────

const workerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be under 80 characters"),
  tradeType: z
    .string()
    .min(2, "Trade specialization is required")
    .max(60, "Trade type must be under 60 characters"),
  phone: z
    .string()
    .regex(/^(\+?61|0)[2-478]\d{8}$/, "Enter a valid Australian phone number (e.g. 0412345678)")
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("")),
  isAvailable: z.boolean().default(true),
});

type WorkerFormValues = z.infer<typeof workerSchema>;

// ── Label helper ──────────────────────────────────────────────────────────────

function Label({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs uppercase text-muted-foreground font-display block mb-1">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}

// ── Delete confirm dialog ─────────────────────────────────────────────────────

function DeleteWorkerDialog({
  worker,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  worker: Worker;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Tradie</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <strong>{worker.name}</strong> from your workforce? They
            will be unassigned from any future jobs.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => { onConfirm(); onOpenChange(false); }}
            disabled={isPending}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function WorkersList() {
  const queryClient = useQueryClient();
  const { data: workers, isLoading } = useListWorkers();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Worker | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const createWorker = useCreateWorker({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
        toast.success("Tradie added!", { description: "New tradie has been added to your workforce." });
        setIsAddOpen(false);
        form.reset();
        setServerError(null);
      },
      onError: (error: any) => {
        const msg =
          error?.response?.data?.error ||
          error?.message ||
          "Failed to add tradie. Please check your inputs and try again.";
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
      },
      onError: () => toast.error("Failed to update tradie"),
    },
  });

  const deleteWorker = useDeleteWorker({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
        toast.success("Tradie removed", {
          description: `${deleteTarget?.name} has been removed from your workforce.`,
        });
        setDeleteTarget(null);
      },
      onError: () => toast.error("Failed to delete tradie"),
    },
  });

  const form = useForm<WorkerFormValues>({
    resolver: zodResolver(workerSchema),
    defaultValues: { name: "", tradeType: "", phone: "", email: "", isAvailable: true },
  });

  const onSubmitWorker = (data: WorkerFormValues) => {
    setServerError(null);
    createWorker.mutate({ data });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground">Workforce</h1>
          <p className="text-muted-foreground mt-1">Manage tradies and availability.</p>
        </div>

        <Dialog
          open={isAddOpen}
          onOpenChange={o => {
            setIsAddOpen(o);
            if (!o) { form.reset(); setServerError(null); }
          }}
        >
          <DialogTrigger asChild>
            <Button className="shadow-lg">
              <Users className="mr-2" /> Add Tradie
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Tradie</DialogTitle>
            </DialogHeader>

            {serverError && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg p-3">
                {serverError}
              </div>
            )}

            <form onSubmit={form.handleSubmit(onSubmitWorker)} className="space-y-4 mt-4">
              <div>
                <Label required>Name</Label>
                <Input {...form.register("name")} placeholder="e.g. John Smith" />
                {form.formState.errors.name && (
                  <p className="text-destructive text-sm mt-1">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label required>Trade Specialization</Label>
                <Input {...form.register("tradeType")} placeholder="e.g. Master Plumber" />
                {form.formState.errors.tradeType && (
                  <p className="text-destructive text-sm mt-1">{form.formState.errors.tradeType.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <Input {...form.register("phone")} placeholder="0412 345 678" inputMode="tel" />
                  {form.formState.errors.phone && (
                    <p className="text-destructive text-sm mt-1">{form.formState.errors.phone.message}</p>
                  )}
                </div>
                <div>
                  <Label>Email</Label>
                  <Input {...form.register("email")} placeholder="john@example.com" />
                  {form.formState.errors.email && (
                    <p className="text-destructive text-sm mt-1">{form.formState.errors.email.message}</p>
                  )}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createWorker.isPending}>
                {createWorker.isPending ? "Adding..." : "Add Tradie"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-40 bg-card rounded-xl animate-pulse" />)}
        </div>
      ) : workers && workers.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground bg-card/30 rounded-xl border border-dashed border-white/10">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-display uppercase">No tradies yet</h3>
          <p>Add your first tradie to start assigning jobs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workers?.map(worker => (
            <Card key={worker.id} className="p-6 relative overflow-hidden group">
              <div className={`absolute top-0 left-0 w-1 h-full ${worker.isAvailable ? "bg-green-500" : "bg-destructive"}`} />
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display text-xl font-bold text-foreground">{worker.name}</h3>
                    <span className="font-mono text-xs bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-bold" title="Worker ID — used as login reference">
                      ID:{worker.id}
                    </span>
                  </div>
                  <p className="text-primary text-sm font-semibold">{worker.tradeType}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge
                    variant={worker.isAvailable ? "outline" : "destructive"}
                    className={worker.isAvailable ? "border-green-500 text-green-500" : ""}
                  >
                    {worker.isAvailable ? "Available" : "Off Duty"}
                  </Badge>
                  <Switch.Root
                    className={`w-10 h-5 rounded-full relative transition-colors ${worker.isAvailable ? "bg-green-500" : "bg-muted"}`}
                    checked={worker.isAvailable}
                    onCheckedChange={c =>
                      updateWorker.mutate({ id: worker.id, data: { ...worker, isAvailable: c } })
                    }
                  >
                    <Switch.Thumb
                      className={`block w-4 h-4 bg-white rounded-full shadow transition-transform translate-x-0.5 ${worker.isAvailable ? "translate-x-[22px]" : ""}`}
                    />
                  </Switch.Root>
                </div>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                {worker.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-primary" />
                    <a href={`tel:${worker.phone}`} className="hover:text-primary transition-colors">
                      {worker.phone}
                    </a>
                  </div>
                )}
                {worker.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={14} className="text-primary" />
                    <a href={`mailto:${worker.email}`} className="hover:text-primary transition-colors truncate">
                      {worker.email}
                    </a>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-border flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteTarget(worker)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteWorkerDialog
          worker={deleteTarget}
          open={!!deleteTarget}
          onOpenChange={o => !o && setDeleteTarget(null)}
          onConfirm={() => deleteWorker.mutate({ id: deleteTarget.id })}
          isPending={deleteWorker.isPending}
        />
      )}
    </div>
  );
}
