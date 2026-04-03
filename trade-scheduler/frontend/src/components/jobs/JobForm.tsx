import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useCreateJob, useUpdateJob, useListWorkers, JobType, ValidityCode, Job } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Save, Info, CheckCircle2 } from "lucide-react";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { toast } from "sonner";

// ── Constants ─────────────────────────────────────────────────────────────────

const JOB_TITLE_MAX = 80;
const CLIENT_NAME_MAX = 80;
const NOTES_MAX = 500;
const MAX_PRICE = 999999.99;

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

  // Step 2 fields
  price: z.coerce
    .number({ invalid_type_error: "Price must be a number" })
    .min(0, "Price cannot be negative")
    .max(MAX_PRICE, `Price cannot exceed $${MAX_PRICE.toLocaleString()}`),
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
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>(initialData?.assignedWorkerIds || []);
  const [showValidityInfo, setShowValidityInfo] = useState(false);

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

  const onSubmit = (data: JobFormValues) => {
    let scheduledDate: string | undefined;
    if (data.scheduledDate) {
      const timePart = data.scheduledTime || "08:00";
      scheduledDate = new Date(`${data.scheduledDate}T${timePart}:00`).toISOString();
    }

    const finalEstimatedHours = data.jobType === "quote" ? 1 : data.estimatedHours;

    const payload = {
      ...data,
      estimatedHours: finalEstimatedHours,
      scheduledDate,
      assignedWorkerIds: selectedWorkerIds,
    };
    delete (payload as any).scheduledTime;

    if (initialData) {
      updateJob.mutate({ id: initialData.id, data: payload });
    } else {
      createJob.mutate({ data: payload });
    }
  };

  const isPending = createJob.isPending || updateJob.isPending;
  const minDate = new Date().toISOString().split("T")[0];

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
              <option value="Electrical">Electrical</option>
              <option value="Plumbing">Plumbing</option>
              <option value="Carpentry">Carpentry</option>
              <option value="Painting">Painting</option>
              <option value="Roofing">Roofing</option>
              <option value="HVAC">HVAC</option>
              <option value="Landscaping">Landscaping</option>
              <option value="General">General Builder</option>
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

          {/* Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label required hint="Enter the total job price in AUD. Must be a positive number.">
                Price (AUD)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={MAX_PRICE}
                  className="pl-8"
                  {...form.register("price")}
                  onKeyDown={e => {
                    if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
                  }}
                />
              </div>
              {form.formState.errors.price && (
                <p className="text-destructive text-sm mt-1">{form.formState.errors.price.message}</p>
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
              <Label hint="Must be today or a future date">Scheduled Date</Label>
              <Input type="date" min={minDate} {...form.register("scheduledDate")} />
              {form.formState.errors.scheduledDate && (
                <p className="text-destructive text-sm mt-1">{form.formState.errors.scheduledDate.message}</p>
              )}
            </div>
            <div>
              <Label hint="Estimated start time for the job. Defaults to 8:00 AM if not set.">Start Time</Label>
              <Input type="time" {...form.register("scheduledTime")} />
            </div>
          </div>

          {/* Assign Workers (booking only) */}
          {jobType === "booking" && workers && workers.length > 0 && (
            <div>
              <Label hint="Select which tradies to assign to this job">Assign Workers</Label>
              <div className="grid grid-cols-2 gap-2">
                {workers.map(w => (
                  <label
                    key={w.id}
                    className={`flex items-center gap-2 p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedWorkerIds.includes(w.id)
                        ? "bg-primary/20 border-primary"
                        : w.isAvailable
                        ? "bg-background border-input hover:bg-secondary"
                        : "bg-background/50 border-input/50 opacity-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={selectedWorkerIds.includes(w.id)}
                      disabled={!w.isAvailable}
                      onChange={e => {
                        if (e.target.checked) setSelectedWorkerIds(prev => [...prev, w.id]);
                        else setSelectedWorkerIds(prev => prev.filter(id => id !== w.id));
                      }}
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm">{w.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {w.tradeType}{!w.isAvailable && " (Off Duty)"}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
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
