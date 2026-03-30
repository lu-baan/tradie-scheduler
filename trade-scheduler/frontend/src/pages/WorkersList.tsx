import { useState } from "react";
import { useListWorkers, useCreateWorker, useUpdateWorker, useDeleteWorker, Worker } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Users, Phone, Mail, Gavel, Trash2, Power } from "lucide-react";
import * as Switch from "@radix-ui/react-switch";

const workerSchema = z.object({
  name: z.string().min(2),
  tradeType: z.string().min(2),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  isAvailable: z.boolean().default(true),
});

export function WorkersList() {
  const queryClient = useQueryClient();
  const { data: workers, isLoading } = useListWorkers();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const createWorker = useCreateWorker({
    mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/workers"] }); setIsAddOpen(false); } }
  });
  const updateWorker = useUpdateWorker({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/workers"] }) }
  });
  const deleteWorker = useDeleteWorker({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/workers"] }) }
  });

  const form = useForm<z.infer<typeof workerSchema>>({
    resolver: zodResolver(workerSchema),
    defaultValues: { name: "", tradeType: "", phone: "", email: "", isAvailable: true }
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground">Workforce</h1>
          <p className="text-muted-foreground mt-1">Manage tradies and availability.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-lg"><Users className="mr-2" /> Add Tradie</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Tradie</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit(data => createWorker.mutate({ data }))} className="space-y-4 mt-4">
              <div>
                <label className="text-xs uppercase text-muted-foreground font-display block mb-1">Name</label>
                <Input {...form.register("name")} />
              </div>
              <div>
                <label className="text-xs uppercase text-muted-foreground font-display block mb-1">Trade Specialization</label>
                <Input {...form.register("tradeType")} placeholder="e.g. Master Plumber" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase text-muted-foreground font-display block mb-1">Phone</label>
                  <Input {...form.register("phone")} />
                </div>
                <div>
                  <label className="text-xs uppercase text-muted-foreground font-display block mb-1">Email</label>
                  <Input {...form.register("email")} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createWorker.isPending}>Add Tradie</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-card rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workers?.map(worker => (
            <Card key={worker.id} className="p-6 relative overflow-hidden group">
              <div className={`absolute top-0 left-0 w-1 h-full ${worker.isAvailable ? 'bg-green-500' : 'bg-destructive'}`} />
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-display text-xl font-bold text-foreground">{worker.name}</h3>
                  <p className="text-primary text-sm font-semibold">{worker.tradeType}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant={worker.isAvailable ? "outline" : "destructive"} className={worker.isAvailable ? 'border-green-500 text-green-500' : ''}>
                    {worker.isAvailable ? "Available" : "Off Duty"}
                  </Badge>
                  <Switch.Root 
                    className={`w-10 h-5 rounded-full relative transition-colors ${worker.isAvailable ? 'bg-green-500' : 'bg-muted'}`}
                    checked={worker.isAvailable}
                    onCheckedChange={(c) => updateWorker.mutate({ id: worker.id, data: { ...worker, isAvailable: c }})}
                  >
                    <Switch.Thumb className={`block w-4 h-4 bg-white rounded-full shadow transition-transform translate-x-0.5 ${worker.isAvailable ? 'translate-x-[22px]' : ''}`} />
                  </Switch.Root>
                </div>
              </div>
              
              <div className="space-y-2 text-sm text-muted-foreground">
                {worker.phone && <div className="flex items-center gap-2"><Phone size={14} className="text-primary"/> {worker.phone}</div>}
                {worker.email && <div className="flex items-center gap-2"><Mail size={14} className="text-primary"/> {worker.email}</div>}
              </div>

              <div className="mt-4 pt-4 border-t border-border flex justify-end">
                <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => {
                  if (confirm("Delete worker?")) deleteWorker.mutate({ id: worker.id });
                }}>
                  <Trash2 size={16} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
