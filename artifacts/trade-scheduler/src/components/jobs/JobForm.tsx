import { useState, useRef, useEffect, useCallback, RefObject } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useCreateJob, useUpdateJob, useListWorkers, JobType, ValidityCode, Job } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Save, MapPin } from "lucide-react";

// ── Australian phone regex ──
// Accepts: 04XX XXX XXX, 04XXXXXXXX, +614XXXXXXXX, 614XXXXXXXX
const ausPhoneRegex = /^(?:\+?61\s?4\d{2}\s?\d{3}\s?\d{3}|04\d{2}\s?\d{3}\s?\d{3}|04\d{8})$/;

const jobSchema = z.object({
  jobType: z.nativeEnum(JobType),
  validityCode: z.coerce.number().min(1).max(3) as z.ZodType<ValidityCode>,
  title: z.string().min(2, "Title is required"),
  tradeType: z.string().min(2, "Trade type is required"),
  clientName: z.string().min(2, "Client name is required"),
  clientPhone: z
    .string()
    .optional()
    .refine(
      (val: string | undefined) => !val || ausPhoneRegex.test(val.replace(/\s+/g, " ").trim()),
      { message: "Enter a valid Australian mobile number (e.g. 0412 345 678 or +61412345678)" }
    ),
  clientEmail: z
    .string()
    .optional()
    .refine(
      (val: string | undefined) => !val || /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val),
      { message: "Enter a valid email address" }
    ),
  address: z.string().min(5, "Address is required"),
  notes: z.string().optional(),

  // Step 2 fields
  price: z.coerce.number().min(0),
  estimatedHours: z.coerce.number().min(1, "Minimum 1 hour"),
  numTradies: z.coerce.number().min(1).optional(),
  callUpTimeHours: z.coerce.number().optional(),
  scheduledDate: z.string().optional(),
}).refine((data: { clientPhone?: string; clientEmail?: string }) => data.clientPhone || data.clientEmail, {
  message: "Either Phone or Email must be provided",
  path: ["clientPhone"]
});

type JobFormValues = z.infer<typeof jobSchema>;

// ── Google Maps Places Autocomplete Hook ──
function useGooglePlacesAutocomplete(
  inputRef: RefObject<HTMLInputElement | null>,
  onPlaceSelected: (address: string, lat: number | null, lng: number | null) => void
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null);

  useEffect(() => {
    if (!inputRef.current) return;
    if (typeof google === "undefined" || !google.maps?.places) return;

    // Only initialise once
    if (autocompleteRef.current) return;

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "au" },
      fields: ["formatted_address", "geometry"],
      types: ["address"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place?.formatted_address) {
        const lat = place.geometry?.location?.lat() ?? null;
        const lng = place.geometry?.location?.lng() ?? null;
        onPlaceSelected(place.formatted_address, lat, lng);
      }
    });

    autocompleteRef.current = autocomplete;
  }, [inputRef, onPlaceSelected]);
}

export function JobForm({ initialData, onSuccess }: { initialData?: Job | null, onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const { data: workers } = useListWorkers();
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>(initialData?.assignedWorkerIds || []);
  const [placesAvailable, setPlacesAvailable] = useState(false);
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  // Check if Google Maps is loaded
  useEffect(() => {
    const check = () => {
      if (typeof google !== "undefined" && google.maps?.places) {
        setPlacesAvailable(true);
      }
    };
    check();
    // Re-check after a short delay in case script loads after mount
    const timer = setTimeout(check, 1000);
    return () => clearTimeout(timer);
  }, []);

  const createJob = useCreateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        onSuccess();
      }
    }
  });

  const updateJob = useUpdateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        onSuccess();
      }
    }
  });

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobSchema),
    defaultValues: initialData ? {
      jobType: initialData.jobType,
      validityCode: initialData.validityCode,
      title: initialData.title,
      tradeType: initialData.tradeType,
      clientName: initialData.clientName,
      clientPhone: initialData.clientPhone || "",
      clientEmail: initialData.clientEmail || "",
      address: initialData.address,
      notes: initialData.notes || "",
      price: initialData.price,
      estimatedHours: initialData.estimatedHours,
      numTradies: initialData.numTradies,
      callUpTimeHours: initialData.callUpTimeHours || 0,
      scheduledDate: initialData.scheduledDate ? initialData.scheduledDate.split('T')[0] : "",
    } : {
      jobType: "quote",
      validityCode: 2,
      title: "",
      tradeType: "",
      clientName: "",
      clientPhone: "",
      clientEmail: "",
      address: "",
      notes: "",
      price: 0,
      estimatedHours: 1,
      numTradies: 1,
      callUpTimeHours: 0,
    }
  });

  // Places autocomplete callback
  const handlePlaceSelected = useCallback(
    (address: string, _lat: number | null, _lng: number | null) => {
      form.setValue("address", address, { shouldValidate: true });
    },
    [form]
  );

  useGooglePlacesAutocomplete(addressInputRef, handlePlaceSelected);

  const jobType = form.watch("jobType");

  const onSubmit = (data: JobFormValues) => {
    const scheduledDate = data.scheduledDate ? new Date(data.scheduledDate).toISOString() : undefined;

    const payload = {
      ...data,
      scheduledDate,
      assignedWorkerIds: selectedWorkerIds,
    };

    if (initialData) {
      updateJob.mutate({ id: initialData.id, data: payload });
    } else {
      createJob.mutate({ data: payload });
    }
  };

  const isPending = createJob.isPending || updateJob.isPending;

  // Phone formatting helper
  const formatPhoneDisplay = (value: string) => {
    // Strip everything except digits and leading +
    const cleaned = value.replace(/[^\d+]/g, "");
    return cleaned;
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {step === 1 && (
        <div className="space-y-4 animate-in slide-in-from-right-4 fade-in">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase text-muted-foreground font-display mb-2 block">Enquiry Type</label>
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
            <div>
              <label className="text-xs uppercase text-muted-foreground font-display mb-2 block">Validity Code (Priority)</label>
              <div className="flex gap-2">
                {[1, 2, 3].map((code) => {
                  const isActive = form.watch("validityCode") === code;
                  return (
                    <Button
                      key={code}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      className={`flex-1 ${isActive && code === 3 ? 'bg-orange-500 hover:bg-orange-600' : isActive && code === 2 ? 'bg-blue-500 hover:bg-blue-600' : isActive ? 'bg-gray-500 hover:bg-gray-600' : ''}`}
                      onClick={() => form.setValue("validityCode", code as ValidityCode)}
                    >
                      {code}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">Job Title</label>
            <Input {...form.register("title")} placeholder="e.g. Rewire Kitchen" />
            {form.formState.errors.title && <p className="text-destructive text-sm mt-1">{form.formState.errors.title.message}</p>}
          </div>

          <div>
            <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">Trade Type</label>
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
          </div>

          <Card className="p-4 bg-secondary/30 border-white/5">
            <h4 className="font-display uppercase text-sm mb-4 text-primary">Client Details</h4>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground font-display mb-1 block">Client Name</label>
                <Input {...form.register("clientName")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground font-display mb-1 block">Phone (AU Mobile)</label>
                  <Input
                    placeholder="0412 345 678"
                    {...form.register("clientPhone")}
                    onChange={(e) => {
                      form.register("clientPhone").onChange(e);
                      form.setValue("clientPhone", formatPhoneDisplay(e.target.value), { shouldValidate: form.formState.isSubmitted });
                    }}
                  />
                  {form.formState.errors.clientPhone && (
                    <p className="text-destructive text-xs mt-1">{form.formState.errors.clientPhone.message}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-display mb-1 block">Email</label>
                  <Input
                    type="email"
                    placeholder="client@example.com"
                    {...form.register("clientEmail")}
                  />
                  {form.formState.errors.clientEmail && (
                    <p className="text-destructive text-xs mt-1">{form.formState.errors.clientEmail.message}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-display mb-1 block flex items-center gap-1">
                  Site Address
                  {placesAvailable && (
                    <span className="inline-flex items-center gap-1 text-green-500">
                      <MapPin size={12} /> Google Autocomplete
                    </span>
                  )}
                </label>
                <Input
                  placeholder="Start typing an Australian address..."
                  {...form.register("address")}
                  ref={(e) => {
                    form.register("address").ref(e);
                    addressInputRef.current = e;
                  }}
                />
                {form.formState.errors.address && (
                  <p className="text-destructive text-xs mt-1">{form.formState.errors.address.message}</p>
                )}
              </div>
            </div>
          </Card>

          <Button
            type="button"
            className="w-full h-12 text-lg mt-4"
            onClick={async () => {
              const ok = await form.trigger(["title", "tradeType", "clientName", "clientPhone", "clientEmail", "address"]);
              if (ok) setStep(2);
            }}
          >
            Next Step <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      )}

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

          {jobType === "quote" ? (
            <div className="bg-primary/10 border border-primary/30 p-4 rounded-lg text-primary-foreground mb-4">
              <p className="text-sm"><strong>Auto-schedule info:</strong> As a Quote, this will automatically block out 1 hour on site plus calculated travel time.</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">Price (AUD)</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-muted-foreground">$</span>
                <Input type="number" step="0.01" className="pl-8" {...form.register("price")} />
              </div>
            </div>

            {jobType === "booking" && (
              <div>
                <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">Est. Hours</label>
                <Input type="number" step="0.5" {...form.register("estimatedHours")} />
              </div>
            )}
          </div>

          {jobType === "booking" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">Number of Tradies</label>
                <Input type="number" min="1" {...form.register("numTradies")} />
              </div>
              <div>
                <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">Call-Up Time (Hrs for materials)</label>
                <Input type="number" min="0" step="0.5" {...form.register("callUpTimeHours")} />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">Scheduled Date (Optional)</label>
            <Input type="date" {...form.register("scheduledDate")} />
          </div>

          {jobType === "booking" && workers && workers.length > 0 && (
            <div>
              <label className="text-xs uppercase text-muted-foreground font-display mb-2 block">Assign Workers</label>
              <div className="grid grid-cols-2 gap-2">
                {workers.map(w => (
                  <label key={w.id} className={`flex items-center gap-2 p-3 rounded-md border cursor-pointer transition-colors ${selectedWorkerIds.includes(w.id) ? 'bg-primary/20 border-primary' : 'bg-background border-input hover:bg-secondary'}`}>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={selectedWorkerIds.includes(w.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedWorkerIds(prev => [...prev, w.id]);
                        else setSelectedWorkerIds(prev => prev.filter(id => id !== w.id));
                      }}
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm">{w.name}</span>
                      <span className="text-xs text-muted-foreground">{w.tradeType}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">Notes</label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background/50 px-3 py-2 text-base focus:ring-2 focus:ring-primary"
              {...form.register("notes")}
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full h-14 text-lg mt-6 shadow-[0_0_20px_rgba(234,88,12,0.4)]">
            {isPending ? <Loader2 className="animate-spin w-6 h-6" /> : (
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
