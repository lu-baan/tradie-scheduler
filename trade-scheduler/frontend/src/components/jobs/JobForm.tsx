import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

import { useCreateJob, useUpdateJob, useListWorkers, useListJobs, JobType, ValidityCode, Job } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Save, Info, CheckCircle2, Plus, Trash2, ReceiptText, AlertTriangle, ArrowUpAZ, ArrowDownAZ } from "lucide-react";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { toast } from "sonner";
import { format } from "date-fns";

// ── Constants ─────────────────────────────────────────────────────────────────

const JOB_TITLE_MAX = 80;
const CLIENT_NAME_MAX = 80;
const NOTES_MAX = 500;
const MAX_PRICE = 50000;
const HIGH_VALUE_THRESHOLD = 10000;

const VALIDITY_DESCRIPTIONS: Record<number, { label: string; description: string; color: string }> = {
  1: {
    label: "Low",
    description: "Low-value or low-priority job. Can be rescheduled easily.",
    color: "bg-gray-500 hover:bg-gray-600 text-white",
  },
  2: {
    label: "Standard",
    description: "Normal priority. Standard scheduling and turnaround.",
    color: "bg-blue-500 hover:bg-blue-600 text-white",
  },
  3: {
    label: "High",
    description: "High-value or urgent client. Prioritised in smart sorting.",
    color: "bg-orange-500 hover:bg-orange-600 text-white",
  },
};

// ── Schema ────────────────────────────────────────────────────────────────────

const jobSchema = z.object({
  jobType: z.nativeEnum(JobType),
  validityCode: z.coerce.number().min(1).max(3) as z.ZodType<ValidityCode>,
  title: z
    .string()
    .min(2, "Title is required (min 2 characters)")
    .max(JOB_TITLE_MAX, `Title must be under ${JOB_TITLE_MAX} characters`),
  tradeType: z.string().min(2, "Trade type is required"),
  clientName: z
    .string()
    .min(2, "Client name is required")
    .max(CLIENT_NAME_MAX, `Name must be under ${CLIENT_NAME_MAX} characters`),
  clientPhone: z
    .string()
    .regex(/^(\+?61|0)[2-478]\d{8}$/, "Enter a valid Australian phone number (e.g. 0412345678)")
    .optional()
    .or(z.literal("")),
  clientEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  address: z.string().min(5, "Address is required (min 5 characters)"),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  notes: z.string().max(NOTES_MAX, `Notes must be under ${NOTES_MAX} characters`).optional(),

  // Step 2 fields — price is computed from labourPrice + materials + GST
  price: z.coerce.number().min(0).max(MAX_PRICE).optional().default(0),
  labourPrice: z.coerce
    .number({ invalid_type_error: "Labour price must be a number" })
    .min(0, "Cannot be negative")
    .max(MAX_PRICE, `Cannot exceed $${MAX_PRICE.toLocaleString()}`),
  estimatedHours: z.coerce
    .number({ invalid_type_error: "Must be a number" })
    .min(0.5, "Minimum 0.5 hours")
    .max(200, "Maximum 200 hours"),
  numTradies: z.coerce.number().min(1, "At least 1 tradie required").max(20, "Maximum 20 tradies").optional(),
  callUpTimeHours: z.coerce.number().min(0).max(168, "Maximum 1 week (168 hrs)").optional(),
  scheduledDate: z
    .string()
    .optional()
    .refine(
      val => {
        if (!val) return true;
        const selected = new Date(val);
        selected.setHours(0, 0, 0, 0);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return selected >= now;
      },
      { message: "Scheduled date cannot be in the past" }
    ),
  scheduledTime: z.string().optional(),
}).refine(data => data.clientPhone || data.clientEmail, {
  message: "Either phone or email must be provided",
  path: ["clientPhone"],
});

type JobFormValues = z.infer<typeof jobSchema>;

type MaterialLine = {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
};

// ── Label helper ──────────────────────────────────────────────────────────────

function Label({
  children,
  required = false,
  hint,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <label className="text-xs uppercase text-muted-foreground font-display">
        {children}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {hint && (
        <div className="group relative">
          <Info size={13} className="text-muted-foreground/60 cursor-help" />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-56 p-2 rounded-lg bg-popover border border-border shadow-lg text-xs text-popover-foreground leading-relaxed">
            {hint}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Character counter ─────────────────────────────────────────────────────────

function CharCount({ current, max }: { current: number; max: number }) {
  const pct = current / max;
  return (
    <span className={`text-xs font-mono ${
      pct > 0.9 ? "text-destructive" : pct > 0.7 ? "text-orange-400" : "text-muted-foreground"
    }`}>
      {current}/{max}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function JobForm({ initialData, onSuccess }: { initialData?: Job | null; onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const { data: workers } = useListWorkers();
  const { data: allJobs = [] } = useListJobs();
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>(initialData?.assignedWorkerIds || []);
  const [workerTradeFilter, setWorkerTradeFilter] = useState<string>("all");
  const [workerSortDir, setWorkerSortDir] = useState<"asc" | "desc">("asc");
  const [showValidityInfo, setShowValidityInfo] = useState(false);
  const [includeGst, setIncludeGst] = useState(true);
  const [materials, setMaterials] = useState<MaterialLine[]>([]);


  const createJob = useCreateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        toast.success("Job created successfully!", {
          description: "The new enquiry has been added to your jobs list.",
          icon: <CheckCircle2 size={16} className="text-green-500" />,
        });
        onSuccess();
      },
      onError: (error: any) => {
        toast.error("Failed to create job", {
          description: error?.message || "Please check your inputs and try again.",
        });
      },
    },
  });

  const updateJob = useUpdateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        toast.success("Job updated successfully!", {
          description: "Your changes have been saved.",
          icon: <CheckCircle2 size={16} className="text-green-500" />,
        });
        onSuccess();
      },
      onError: (error: any) => {
        toast.error("Failed to update job", {
          description: error?.message || "Please check your inputs and try again.",
        });
      },
    },
  });

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobSchema),
    defaultValues: initialData
      ? {
          jobType: initialData.jobType,
          validityCode: initialData.validityCode,
          title: initialData.title,
          tradeType: initialData.tradeType,
          clientName: initialData.clientName,
          clientPhone: initialData.clientPhone || "",
          clientEmail: initialData.clientEmail || "",
          address: initialData.address,
          latitude: initialData.latitude,
          longitude: initialData.longitude,
          notes: initialData.notes || "",
          price: initialData.price,
          labourPrice: initialData.price,
          estimatedHours: initialData.estimatedHours,
          numTradies: initialData.numTradies,
          callUpTimeHours: initialData.callUpTimeHours || 0,
          scheduledDate: initialData.scheduledDate ? initialData.scheduledDate.split("T")[0] : "",
          scheduledTime: initialData.scheduledDate
            ? new Date(initialData.scheduledDate).toTimeString().slice(0, 5)
            : "",
        }
      : {
          jobType: "quote",
          validityCode: 2,
          title: "",
          tradeType: "",
          clientName: "",
          clientPhone: "",
          clientEmail: "",
          address: "",
          latitude: null,
          longitude: null,
          notes: "",
          price: 0,
          labourPrice: 0,
          estimatedHours: 1,
          numTradies: 1,
          callUpTimeHours: 0,
          scheduledDate: "",
          scheduledTime: "",
        },
  });

  const jobType = form.watch("jobType");
  const titleVal = form.watch("title") || "";
  const clientNameVal = form.watch("clientName") || "";
  const notesVal = form.watch("notes") || "";
  const validityVal = form.watch("validityCode");
  const watchedDate = form.watch("scheduledDate");
  const watchedTime = form.watch("scheduledTime");
  const watchedHours = form.watch("estimatedHours");

  // Double-booking detection: check assigned workers against existing jobs
  const bookingConflicts: string[] = (() => {
    if (jobType !== "booking" || !watchedDate || selectedWorkerIds.length === 0) return [];
    const timePart = watchedTime || "08:00";
    const newStart = new Date(`${watchedDate}T${timePart}:00`).getTime();
    const newEnd = newStart + (Number(watchedHours) || 1) * 3600_000;
    const conflicts: string[] = [];
    for (const wid of selectedWorkerIds) {
      const clashes = allJobs.filter(j => {
        if (!j.scheduledDate || j.id === initialData?.id) return false;
        const assigned = (j as any).assignedWorkers?.some((w: any) => w.id === wid)
          || (j as any).assignedWorkerIds?.includes(wid);
        if (!assigned) return false;
        const jStart = new Date(j.scheduledDate).getTime();
        const jEnd = jStart + (j.estimatedHours || 1) * 3600_000;
        return newStart < jEnd && jStart < newEnd;
      });
      if (clashes.length > 0) {
        const workerName = workers?.find(w => w.id === wid)?.name ?? `Worker #${wid}`;
        clashes.forEach(j => conflicts.push(`${workerName} → "${j.title}"`));
      }
    }
    return conflicts;
  })();

  const onSubmit = (data: JobFormValues) => {
    let scheduledDate: string | undefined;
    if (data.scheduledDate) {
      const timePart = data.scheduledTime || "08:00";
      scheduledDate = new Date(`${data.scheduledDate}T${timePart}:00`).toISOString();
    }

    const finalEstimatedHours = data.jobType === "quote" ? 1 : data.estimatedHours;

    // Compute final price: labour + materials subtotal, then optionally +10% GST
    const labourAmt = data.labourPrice ?? 0;
    const materialsTotal = materials.reduce((s, m) => s + m.qty * m.unitPrice, 0);
    const subtotal = labourAmt + materialsTotal;
    const computedPrice = includeGst ? subtotal * 1.1 : subtotal;

    const payload = {
      ...data,
      price: Math.round(computedPrice * 100) / 100,
      estimatedHours: finalEstimatedHours,
      scheduledDate,
      assignedWorkerIds: selectedWorkerIds,
    };
    delete (payload as any).scheduledTime;
    delete (payload as any).labourPrice;

    if (initialData) {
      updateJob.mutate({ id: initialData.id, data: payload });
    } else {
      createJob.mutate({ data: payload });
    }
  };

  const isPending = createJob.isPending || updateJob.isPending;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* ── STEP 1: Job & Client Info ── */}
      {step === 1 && (
        <div className="space-y-4 animate-in slide-in-from-right-4 fade-in">
          <div className="grid grid-cols-2 gap-4">
            {/* Enquiry Type */}
            <div>
              <Label required>Enquiry Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={jobType === "quote" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => form.setValue("jobType", "quote")}
                >
                  QUOTE
                </Button>
                <Button
                  type="button"
                  variant={jobType === "booking" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => form.setValue("jobType", "booking")}
                >
                  BOOKING
                </Button>
              </div>
            </div>

            {/* Validity Code with explanation */}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs uppercase text-muted-foreground font-display">
                  Validity Code<span className="text-destructive ml-0.5">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowValidityInfo(!showValidityInfo)}
                >
                  <Info size={13} className="text-muted-foreground/60 cursor-help hover:text-primary transition-colors" />
                </button>
              </div>

              {showValidityInfo && (
                <div className="bg-secondary/50 border border-border rounded-lg p-3 mb-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <p className="text-xs font-semibold text-foreground mb-2">What are validity codes?</p>
                  <div className="space-y-1.5">
                    {[1, 2, 3].map(code => (
                      <div key={code} className="flex items-start gap-2 text-xs">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold shrink-0 ${VALIDITY_DESCRIPTIONS[code].color}`}>
                          {code}
                        </span>
                        <div>
                          <span className="font-semibold text-foreground">{VALIDITY_DESCRIPTIONS[code].label}:</span>{" "}
                          <span className="text-muted-foreground">{VALIDITY_DESCRIPTIONS[code].description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {[1, 2, 3].map(code => {
                  const isActive = validityVal === code;
                  const desc = VALIDITY_DESCRIPTIONS[code];
                  return (
                    <Button
                      key={code}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      className={`flex-1 ${isActive ? desc.color : ""}`}
                      onClick={() => form.setValue("validityCode", code as ValidityCode)}
                      title={`${desc.label}: ${desc.description}`}
                    >
                      {code}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Job Title */}
          <div>
            <div className="flex justify-between items-end">
              <Label required>Job Title</Label>
              <CharCount current={titleVal.length} max={JOB_TITLE_MAX} />
            </div>
            <Input
              {...form.register("title")}
              placeholder="e.g. Rewire Kitchen"
              maxLength={JOB_TITLE_MAX}
            />
            {form.formState.errors.title && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.title.message}</p>
            )}
          </div>

          {/* Trade Type */}
          <div>
            <Label required>Trade Type</Label>
            <select
              {...form.register("tradeType")}
              className="flex h-12 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-base focus:ring-2 focus:ring-primary"
            >
              <option value="">Select Trade</option>
              {((() => {
                try { return JSON.parse(localStorage.getItem("tradeTypes") || "[]"); } catch { return []; }
              })() as string[]).map((t: string) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {form.formState.errors.tradeType && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.tradeType.message}</p>
            )}
          </div>

          {/* Client Details */}
          <Card className="p-4 bg-secondary/30 border-white/5">
            <h4 className="font-display uppercase text-sm mb-4 text-primary">Client Details</h4>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-end">
                  <Label required>Client Name</Label>
                  <CharCount current={clientNameVal.length} max={CLIENT_NAME_MAX} />
                </div>
                <Input {...form.register("clientName")} maxLength={CLIENT_NAME_MAX} placeholder="e.g. Jane Doe" />
                {form.formState.errors.clientName && (
                  <p className="text-destructive text-sm mt-1">{form.formState.errors.clientName.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label hint="At least one of Phone or Email is required">
                    Phone<span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <Input {...form.register("clientPhone")} placeholder="0412 345 678" inputMode="tel" />
                  {form.formState.errors.clientPhone && (
                    <p className="text-destructive text-sm mt-1">{form.formState.errors.clientPhone.message}</p>
                  )}
                </div>
                <div>
                  <Label hint="At least one of Phone or Email is required">
                    Email<span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <Input type="email" {...form.register("clientEmail")} placeholder="client@example.com" />
                  {form.formState.errors.clientEmail && (
                    <p className="text-destructive text-sm mt-1">{form.formState.errors.clientEmail.message}</p>
                  )}
                </div>
              </div>

              <div>
                <Label required hint="Start typing and click on an address from the dropdown to select it">
                  Site Address
                </Label>
                <Controller
                  name="address"
                  control={form.control}
                  render={({ field }) => (
                    <AddressAutocomplete
                      value={field.value}
                      onChange={field.onChange}
                      onCoordinatesSelect={(lat, lng) => {
                        form.setValue("latitude", lat);
                        form.setValue("longitude", lng);
                      }}
                      onBlur={field.onBlur}
                      placeholder="Start typing an Australian address…"
                    />
                  )}
                />
                {form.formState.errors.address && (
                  <p className="text-destructive text-sm mt-1">{form.formState.errors.address.message}</p>
                )}
              </div>
            </div>
          </Card>

          <Button
            type="button"
            className="w-full h-12 text-lg mt-4"
            onClick={async () => {
              const ok = await form.trigger([
                "title", "tradeType", "clientName", "clientPhone", "clientEmail", "address",
              ]);
              if (ok) setStep(2);
            }}
          >
            Next Step <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      )}

      {/* ── STEP 2: Pricing & Scheduling ── */}
      {step === 2 && (
        <div className="space-y-4 animate-in slide-in-from-right-4 fade-in">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-display text-xl text-primary uppercase">
              {jobType === "quote" ? "Quote Details" : "Booking Details"}
            </h3>
            <Button type="button" variant="ghost" onClick={() => setStep(1)} className="text-xs">
              ← Back
            </Button>
          </div>

          {jobType === "quote" && (
            <div className="bg-primary/10 border border-primary/30 p-4 rounded-lg text-primary-foreground mb-4">
              <p className="text-sm">
                <strong>Auto-schedule info:</strong> As a Quote, this will automatically block out 1 hour on
                site plus calculated travel time. The estimated start time factors in travel distance.
              </p>
            </div>
          )}

          {/* ── Pricing Breakdown ── */}
          <Card className="p-4 bg-secondary/30 border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-display uppercase text-sm text-primary flex items-center gap-2">
                <ReceiptText size={15} />
                Pricing
              </h4>
              {/* GST Toggle */}
              <button
                type="button"
                onClick={() => setIncludeGst(g => !g)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  includeGst
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-white/5 border-white/10 text-muted-foreground line-through"
                }`}
              >
                GST (10%)
                <span className={`w-7 h-4 rounded-full relative transition-colors ${includeGst ? "bg-primary" : "bg-white/20"}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${includeGst ? "right-0.5" : "left-0.5"}`} />
                </span>
              </button>
            </div>

            {!includeGst && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-md px-3 py-2 text-xs text-orange-300">
                Cash job — GST not applied. Ensure this complies with your obligations.
              </div>
            )}

            {/* Labour / service charge */}
            <div className={jobType === "booking" ? "grid grid-cols-2 gap-4" : ""}>
              <div>
                <Label required hint="Labour or service charge (ex-GST)">Labour / Service (AUD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={MAX_PRICE}
                    className="pl-7"
                    {...form.register("labourPrice")}
                    onKeyDown={e => { if (["e","E","+","-"].includes(e.key)) e.preventDefault(); }}
                  />
                </div>
                {form.formState.errors.labourPrice && (
                  <p className="text-destructive text-sm mt-1">{form.formState.errors.labourPrice.message}</p>
                )}
              </div>
              {jobType === "booking" && (
                <div>
                  <Label required>Est. Hours</Label>
                  <Input type="number" step="0.5" min="0.5" max="200" {...form.register("estimatedHours")} />
                  {form.formState.errors.estimatedHours && (
                    <p className="text-destructive text-sm mt-1">{form.formState.errors.estimatedHours.message}</p>
                  )}
                </div>
              )}
            </div>

            {/* Materials line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label hint="List individual materials for itemised invoicing">Materials</Label>
                <button
                  type="button"
                  onClick={() =>
                    setMaterials(prev => [
                      ...prev,
                      { id: Math.random().toString(36).slice(2), description: "", qty: 1, unitPrice: 0 },
                    ])
                  }
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus size={12} /> Add item
                </button>
              </div>

              {materials.length > 0 && (
                <div className="space-y-2">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_6rem_5rem_2rem] gap-2 text-[10px] uppercase text-muted-foreground font-bold px-1">
                    <span>Description</span>
                    <span className="text-right">Unit Price</span>
                    <span className="text-right">Qty</span>
                    <span />
                  </div>

                  {materials.map(m => (
                    <div key={m.id} className="grid grid-cols-[1fr_6rem_5rem_2rem] gap-2 items-center">
                      <Input
                        value={m.description}
                        onChange={e =>
                          setMaterials(prev =>
                            prev.map(x => x.id === m.id ? { ...x, description: e.target.value } : x)
                          )
                        }
                        placeholder="e.g. 10mm conduit (per m)"
                        className="h-8 text-xs"
                      />
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-muted-foreground text-xs">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={m.unitPrice}
                          onChange={e =>
                            setMaterials(prev =>
                              prev.map(x => x.id === m.id ? { ...x, unitPrice: parseFloat(e.target.value) || 0 } : x)
                            )
                          }
                          className="h-8 text-xs text-right pl-5"
                        />
                      </div>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={m.qty}
                        onChange={e =>
                          setMaterials(prev =>
                            prev.map(x => x.id === m.id ? { ...x, qty: parseFloat(e.target.value) || 0 } : x)
                          )
                        }
                        className="h-8 text-xs text-right"
                      />
                      <button
                        type="button"
                        onClick={() => setMaterials(prev => prev.filter(x => x.id !== m.id))}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Price summary */}
            {(() => {
              const labourAmt = parseFloat(String(form.watch("labourPrice") ?? 0)) || 0;
              const matTotal = materials.reduce((s, m) => s + m.qty * m.unitPrice, 0);
              const subtotal = labourAmt + matTotal;
              const gstAmt = includeGst ? subtotal * 0.1 : 0;
              const total = subtotal + gstAmt;
              return (
                <div className="border-t border-white/10 pt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Labour</span>
                    <span>${labourAmt.toFixed(2)}</span>
                  </div>
                  {matTotal > 0 && (
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>Materials</span>
                      <span>${matTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Subtotal (ex-GST)</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  {includeGst && (
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>GST (10%)</span>
                      <span>${gstAmt.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-foreground border-t border-white/10 pt-1.5 mt-1.5">
                    <span>Total</span>
                    <span className="text-primary">${total.toFixed(2)}</span>
                  </div>
                  {total > HIGH_VALUE_THRESHOLD && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-md px-3 py-2 text-xs text-orange-300 mt-2">
                      High-value job (over $10,000) — confirm pricing with client before saving.
                    </div>
                  )}
                </div>
              );
            })()}
          </Card>

          {/* Booking-specific fields */}
          {jobType === "booking" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label required hint="How many tradies are needed for this job?">Number of Tradies</Label>
                <Input type="number" min="1" max="20" {...form.register("numTradies")} />
                {form.formState.errors.numTradies && (
                  <p className="text-destructive text-sm mt-1">{form.formState.errors.numTradies.message}</p>
                )}
              </div>
              <div>
                <Label hint="Hours before the job to order materials. Helps with logistics planning.">
                  Call-Up Time (Hrs for materials)
                </Label>
                <Input type="number" min="0" step="0.5" max="168" {...form.register("callUpTimeHours")} />
              </div>
            </div>
          )}

          {/* Schedule Date + Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label hint="Pick the date and start time for the job">Scheduled Date & Time</Label>
              <Controller
                name="scheduledDate"
                control={form.control}
                render={({ field: dateField }) => (
                  <Controller
                    name="scheduledTime"
                    control={form.control}
                    render={({ field: timeField }) => (
                      <DateTimePicker
                        date={dateField.value ?? ""}
                        time={timeField.value ?? ""}
                        onDateChange={dateField.onChange}
                        onTimeChange={timeField.onChange}
                        disablePast
                      />
                    )}
                  />
                )}
              />
              {form.formState.errors.scheduledDate && (
                <p className="text-destructive text-sm mt-1">{form.formState.errors.scheduledDate.message}</p>
              )}
            </div>
            <div>
              <Label hint="Computed from start time + estimated hours">Est. End Time</Label>
              <div className="h-12 flex items-center px-3 rounded-md border border-input bg-background/30 text-sm text-muted-foreground">
                {(() => {
                  const startTime = form.watch("scheduledTime");
                  const hours = parseFloat(String(form.watch("estimatedHours") ?? 0)) || 0;
                  if (!startTime || !hours) return <span className="italic">—</span>;
                  const [h, m] = startTime.split(":").map(Number);
                  const totalMins = h * 60 + m + Math.round(hours * 60);
                  const endH = Math.floor(totalMins / 60) % 24;
                  const endM = totalMins % 60;
                  const period = endH >= 12 ? "PM" : "AM";
                  const displayH = endH % 12 || 12;
                  return `${displayH}:${String(endM).padStart(2, "0")} ${period}`;
                })()}
              </div>
            </div>
          </div>

          {/* Assign Workers (booking only) */}
          {jobType === "booking" && workers && workers.length > 0 && (
            <div>
              {(() => {
                const cap = parseInt(String(form.watch("numTradies") ?? 1)) || 1;
                const filled = selectedWorkerIds.length;
                return (
                  <div className="flex items-center gap-2 mb-1">
                    <Label hint="Select which tradies to assign to this job">Assign Workers</Label>
                    <span className={`ml-auto text-xs font-mono px-2 py-0.5 rounded ${filled >= cap ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {filled} / {cap}
                    </span>
                  </div>
                );
              })()}

              {/* Filter + sort controls */}
              {(() => {
                const tradeTypes = ["all", ...Array.from(new Set(workers.map(w => w.tradeType))).sort()];
                return (
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      value={workerTradeFilter}
                      onChange={e => setWorkerTradeFilter(e.target.value)}
                      className="flex-1 bg-background border border-input rounded-md px-2 py-1.5 text-xs"
                    >
                      {tradeTypes.map(t => (
                        <option key={t} value={t}>{t === "all" ? "All Trade Types" : t}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setWorkerSortDir(d => d === "asc" ? "desc" : "asc")}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-input text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                      title={workerSortDir === "asc" ? "A → Z (click to reverse)" : "Z → A (click to reverse)"}
                    >
                      {workerSortDir === "asc" ? <ArrowUpAZ size={14} /> : <ArrowDownAZ size={14} />}
                      {workerSortDir === "asc" ? "A–Z" : "Z–A"}
                    </button>
                  </div>
                );
              })()}

              <div className="space-y-2">
                {(workerTradeFilter === "all"
                  ? [...(workers ?? [])]
                  : (workers ?? []).filter(w => w.tradeType === workerTradeFilter)
                )
                  .sort((a, b) =>
                    workerSortDir === "asc"
                      ? a.name.localeCompare(b.name)
                      : b.name.localeCompare(a.name)
                  )
                  .map(w => {
                  const selectedDate = form.watch("scheduledDate");
                  const selectedTime = form.watch("scheduledTime");
                  const estimatedHrs = parseFloat(String(form.watch("estimatedHours") ?? 1)) || 1;

                  // Jobs this worker has on the selected day
                  const dayJobs = selectedDate
                    ? allJobs.filter(j =>
                        j.scheduledDate?.startsWith(selectedDate) &&
                        j.assignedWorkerIds.includes(w.id) &&
                        j.status !== "cancelled" && j.status !== "bumped"
                      )
                    : [];

                  const dotsAvailable = Math.max(0, 4 - dayJobs.length);

                  // Timeline helpers — 6am to 8pm = 840 mins window
                  const DAY_START = 6 * 60;   // 6:00 AM in minutes
                  const DAY_MINS  = 14 * 60;  // 840 minutes visible

                  function toMins(timeStr: string | null | undefined): number | null {
                    if (!timeStr) return null;
                    // Try parsing as HH:mm
                    const parts = timeStr.split(":");
                    if (parts.length >= 2) {
                      const h = parseInt(parts[0]);
                      const m = parseInt(parts[1]);
                      if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
                    }
                    return null;
                  }

                  function pct(mins: number): number {
                    return Math.max(0, Math.min(100, ((mins - DAY_START) / DAY_MINS) * 100));
                  }

                  function fmtMins(mins: number): string {
                    const h = Math.floor(mins / 60);
                    const m = mins % 60;
                    const period = h >= 12 ? "PM" : "AM";
                    const display = h % 12 === 0 ? 12 : h % 12;
                    return `${display}:${String(m).padStart(2, "0")} ${period}`;
                  }

                  // Proposed slot from current form values
                  const proposedStart = selectedTime ? toMins(selectedTime) : null;
                  const proposedEnd   = proposedStart !== null ? proposedStart + Math.round(estimatedHrs * 60) : null;

                  // Hour tick marks: 6am, 8am, 10am, 12pm, 2pm, 4pm, 6pm, 8pm
                  const ticks = [6, 8, 10, 12, 14, 16, 18, 20];

                  return (
                    <div key={w.id} className="relative group">
                      <label
                        className={`flex gap-3 p-3 rounded-md border cursor-pointer transition-colors w-full ${
                          selectedWorkerIds.includes(w.id)
                            ? "bg-primary/20 border-primary"
                            : !w.isAvailable || (selectedWorkerIds.length >= (parseInt(String(form.watch("numTradies") ?? 1)) || 1) && !selectedWorkerIds.includes(w.id))
                            ? "bg-background/50 border-input/50 opacity-40 cursor-not-allowed"
                            : "bg-background border-input hover:bg-secondary"
                        }`}
                      >
                        {(() => {
                          const cap = parseInt(String(form.watch("numTradies") ?? 1)) || 1;
                          const isSelected = selectedWorkerIds.includes(w.id);
                          const atCap = selectedWorkerIds.length >= cap && !isSelected;
                          return (
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={isSelected}
                              disabled={!w.isAvailable || atCap}
                              onChange={e => {
                                if (e.target.checked) setSelectedWorkerIds(prev => [...prev, w.id]);
                                else setSelectedWorkerIds(prev => prev.filter(id => id !== w.id));
                              }}
                            />
                          );
                        })()}

                        {/* Left: name + dots */}
                        <div className="w-32 shrink-0">
                          <span className="font-semibold text-sm block truncate">{w.name}</span>
                          <span className="text-xs text-muted-foreground block truncate">
                            {w.tradeType}{!w.isAvailable && " (Off Duty)"}
                          </span>
                          <div className="flex gap-0.5 mt-1.5">
                            {[0, 1, 2, 3].map(i => (
                              <div
                                key={i}
                                className={`w-2 h-2 rounded-full ${
                                  !w.isAvailable
                                    ? "bg-destructive/40"
                                    : i < dotsAvailable
                                    ? dotsAvailable === 4 ? "bg-green-400" : dotsAvailable >= 3 ? "bg-yellow-400" : "bg-orange-400"
                                    : "bg-muted"
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Right: mini day timeline */}
                        <div className="flex-1 min-w-0">
                          {selectedDate ? (
                            <div>
                              {/* Hour labels */}
                              <div className="relative h-3 mb-0.5">
                                {ticks.map(h => (
                                  <span
                                    key={h}
                                    className="absolute text-[9px] text-muted-foreground -translate-x-1/2"
                                    style={{ left: `${pct(h * 60)}%` }}
                                  >
                                    {h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
                                  </span>
                                ))}
                              </div>

                              {/* Track */}
                              <div className="relative h-6 bg-secondary rounded overflow-hidden">
                                {/* Tick lines */}
                                {ticks.map(h => (
                                  <div
                                    key={h}
                                    className="absolute top-0 h-full w-px bg-border/50"
                                    style={{ left: `${pct(h * 60)}%` }}
                                  />
                                ))}

                                {/* Existing jobs */}
                                {dayJobs.map(j => {
                                  const jTime = j.scheduledDate ? j.scheduledDate.split("T")[1]?.slice(0, 5) : null;
                                  const start = toMins(jTime);
                                  if (start === null) return null;
                                  const end = start + Math.round((j.estimatedHours || 1) * 60);
                                  const left = pct(start);
                                  const width = pct(end) - left;
                                  return (
                                    <div
                                      key={j.id}
                                      className="absolute top-0.5 bottom-0.5 bg-primary/70 rounded text-[8px] text-white flex items-center px-1 overflow-hidden"
                                      style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }}
                                      title={`${j.title} (${fmtMins(start)} – ${fmtMins(end)})`}
                                    >
                                      <span className="truncate">{j.title}</span>
                                    </div>
                                  );
                                })}

                                {/* Proposed slot */}
                                {proposedStart !== null && proposedEnd !== null && (
                                  <div
                                    className="absolute top-0.5 bottom-0.5 rounded border-2 border-blue-400 bg-blue-400/20 text-[8px] text-blue-300 flex items-center px-1 overflow-hidden"
                                    style={{ left: `${pct(proposedStart)}%`, width: `${Math.max(pct(proposedEnd) - pct(proposedStart), 3)}%` }}
                                    title={`This job: ${fmtMins(proposedStart)} – ${fmtMins(proposedEnd)}`}
                                  >
                                    <span className="truncate">This job</span>
                                  </div>
                                )}
                              </div>

                              {/* Legend */}
                              <div className="flex gap-3 mt-1">
                                {dayJobs.length > 0 && (
                                  <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                    <span className="w-2 h-2 rounded-sm bg-primary/70 inline-block" /> Booked
                                  </span>
                                )}
                                {proposedStart !== null && (
                                  <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                    <span className="w-2 h-2 rounded-sm border border-blue-400 bg-blue-400/20 inline-block" /> This job
                                  </span>
                                )}
                                {dayJobs.length === 0 && proposedStart === null && (
                                  <span className="text-[9px] text-green-400">Free all day</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="h-6 flex items-center">
                              <span className="text-[10px] text-muted-foreground italic">Pick a date to see schedule</span>
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Double-booking warning */}
          {bookingConflicts.length > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/40 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 text-orange-400 font-semibold text-sm">
                <AlertTriangle size={15} />
                Scheduling conflict detected
              </div>
              {bookingConflicts.map((c, i) => (
                <p key={i} className="text-xs text-orange-300 pl-5">{c}</p>
              ))}
              <p className="text-[11px] text-orange-400/70 pl-5 pt-1">
                You can still save — check with the workers before confirming.
              </p>
            </div>
          )}

          {/* Notes with character count */}
          <div>
            <div className="flex justify-between items-end">
              <Label>Notes</Label>
              <CharCount current={notesVal.length} max={NOTES_MAX} />
            </div>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background/50 px-3 py-2 text-base focus:ring-2 focus:ring-primary"
              maxLength={NOTES_MAX}
              placeholder="Additional details, special requirements, access instructions..."
              {...form.register("notes")}
            />
            {form.formState.errors.notes && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.notes.message}</p>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={isPending}
            className="w-full h-14 text-lg mt-6 shadow-[0_0_20px_rgba(234,88,12,0.4)]"
          >
            {isPending ? (
              <Loader2 className="animate-spin w-6 h-6" />
            ) : (
              <>
                <Save className="mr-2 w-5 h-5" />
                {initialData ? "Update Job" : "Save Job"}
              </>
            )}
          </Button>
        </div>
      )}
    </form>
  );
}
