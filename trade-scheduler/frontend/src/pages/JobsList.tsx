import { useState, useEffect } from "react";
import { useListJobs, ListJobsSortBy } from "@/lib/api-client";
import { JobCard } from "@/components/jobs/JobCard";
import { JobForm } from "@/components/jobs/JobForm";
import { useGeolocation } from "@/hooks/use-geolocation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, SlidersHorizontal, MapPin, Loader2, BriefcaseBusiness, Info, ArrowUp, ArrowDown } from "lucide-react";
import type { UserRole } from "@/App";
import * as Tabs from "@radix-ui/react-tabs";
import * as Slider from "@radix-ui/react-slider";

const SORT_DESCRIPTIONS: Record<string, string> = {
  date: "Sort by scheduled date",
  price: "Sort by job price",
  distance: "Sort by distance from your location",
  smart: "Combined score using distance + price + validity code weights",
  validityCode: "Sort by validity code (priority)",
};

type SortDir = "asc" | "desc";

const SORT_DEFAULT_DIR: Record<ListJobsSortBy, SortDir> = {
  date: "asc",
  price: "desc",
  distance: "asc",
  smart: "desc",
  validityCode: "desc",
};

export function JobsList({ userRole = "admin" }: { userRole?: UserRole }) {
  const userRoleFromSession = (sessionStorage.getItem("ts2_role") as UserRole) ?? userRole;
  const workerId = (() => {
    const v = sessionStorage.getItem("ts2_worker_id");
    if (!v || v === "" || v === "null") return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  })();
  const [sortBy, setSortBy] = useState<ListJobsSortBy>("smart");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [priceWeight, setPriceWeight] = useState(0.5);
  const [filterType, setFilterType] = useState<"all" | "quote" | "booking" | "completed" | "cancelled">("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [showSortInfo, setShowSortInfo] = useState(false);

  const { location, suburb, requestLocation, loading: locLoading } = useGeolocation();

  useEffect(() => {
    if ((sortBy === "distance" || sortBy === "smart") && !location) {
      requestLocation();
    }
  }, [sortBy, requestLocation]);

  const { data: jobs, isLoading } = useListJobs({
    sortBy,
    lat: location?.lat,
    lng: location?.lng,
    priceWeight,
    distanceWeight: 1 - priceWeight,
  });

  const handleSortChange = (newSort: ListJobsSortBy) => {
    if (newSort === sortBy) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(newSort);
      setSortDir(SORT_DEFAULT_DIR[newSort]);
    }
  };

  const getFilteredJobs = (tab: typeof filterType) => {
    let all = jobs || [];
    // Workers only see their assigned jobs
    if (userRoleFromSession === "worker") {
      all = workerId
        ? all.filter(j =>
            (j as any).assignedWorkers?.some((w: any) => w.id === workerId) ||
            (j as any).assignedWorkerIds?.includes(workerId)
          )
        : []; // worker with no linked workerId sees nothing
    }
    let result: typeof all;
    if (tab === "all") result = all.filter(job => job.status !== "completed" && job.status !== "cancelled");
    else if (tab === "completed") result = all.filter(job => job.status === "completed");
    else if (tab === "cancelled") result = all.filter(job => job.status === "cancelled");
    else result = all.filter(job => job.jobType === tab && job.status !== "completed" && job.status !== "cancelled");

    // Emergencies always pin to the top; everything else sorts by the chosen criteria.
    // Unassigned status does not influence position.
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = (() => {
      if (sortBy === "date") {
        return [...result].sort((a, b) =>
          dir * ((a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""))
        );
      }
      if (sortBy === "price") {
        return [...result].sort((a, b) => dir * ((a.price ?? 0) - (b.price ?? 0)));
      }
      if (sortBy === "validityCode") {
        return [...result].sort((a, b) => dir * ((a.validityCode ?? 0) - (b.validityCode ?? 0)));
      }
      // For "smart" and "distance" the API has already scored/sorted — just respect direction.
      return sortDir === "asc" ? result : [...result].reverse();
    })();

    // Stable partition: emergencies first, then the rest in their sorted order.
    return [
      ...sorted.filter(j => j.isEmergency),
      ...sorted.filter(j => !j.isEmergency),
    ];
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground">Jobs Manager</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Schedule, dispatch, and track all operations.</p>
        </div>

        {userRoleFromSession === "admin" && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="font-bold text-base shadow-[0_0_20px_rgba(234,88,12,0.4)] w-full sm:w-auto">
                <Plus className="mr-2" /> New Enquiry
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto"
              onInteractOutside={(e) => {
                if ((e.target as Element).closest?.(".pac-container")) e.preventDefault();
              }}
            >
              <DialogHeader>
                <DialogTitle>Create New Enquiry</DialogTitle>
              </DialogHeader>
              <JobForm onSuccess={() => setIsAddOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="bg-card border border-white/5 rounded-xl p-3 sm:p-4 shadow-xl">
        <Tabs.Root value={filterType} onValueChange={v => setFilterType(v as any)}>
          <Tabs.List className="flex overflow-x-auto border-b border-border mb-4 sm:mb-6 no-scrollbar">
            {["all", "quote", "booking", "completed", "cancelled"].map(tab => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="px-3 sm:px-6 py-2.5 sm:py-3 font-display uppercase tracking-wider font-semibold text-xs sm:text-sm transition-colors data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary text-muted-foreground hover:text-foreground whitespace-nowrap"
              >
                {tab === "all" ? "Active Jobs" : tab === "completed" ? "Completed" : tab === "cancelled" ? "Cancelled" : tab + "s"}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* Sort & Filter Controls */}
          <div className="bg-background/50 p-3 sm:p-4 rounded-lg border border-border mb-4 sm:mb-6">
            <div className="flex flex-col gap-4">
              {/* Sort buttons row */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-display uppercase text-muted-foreground flex items-center gap-1">
                  <SlidersHorizontal size={13} /> Sort:
                </span>
                {(["date", "price", "distance", "smart", "validityCode"] as ListJobsSortBy[]).map(sort => (
                  <button
                    type="button"
                    key={sort}
                    onClick={() => handleSortChange(sort)}
                    title={SORT_DESCRIPTIONS[sort]}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border transition-all ${
                      sortBy === sort
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {sort === "validityCode" ? "Priority" : sort.charAt(0).toUpperCase() + sort.slice(1)}
                    {sortBy === sort && (
                      sortDir === "asc"
                        ? <ArrowUp size={11} />
                        : <ArrowDown size={11} />
                    )}
                  </button>
                ))}
                {/* Standalone asc/desc toggle */}
                <button
                  type="button"
                  onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                  title={sortDir === "asc" ? "Currently ascending — click for descending" : "Currently descending — click for ascending"}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-all"
                >
                  {sortDir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                  {sortDir === "asc" ? "Asc" : "Desc"}
                </button>
                <button
                  type="button"
                  className="ml-0.5"
                  onClick={() => setShowSortInfo(!showSortInfo)}
                  title="What do these sorting options mean?"
                >
                  <Info size={15} className="text-muted-foreground/60 hover:text-primary transition-colors cursor-help" />
                </button>
              </div>

              {/* Smart sort weight slider */}
              {sortBy === "smart" && (
                <div className="w-full max-w-md bg-card p-3 rounded-md border border-border">
                  <div className="flex justify-between text-xs font-display uppercase mb-2 text-muted-foreground">
                    <span>Distance ({(1 - priceWeight).toFixed(1)})</span>
                    <span>Price ({priceWeight.toFixed(1)})</span>
                  </div>
                  <Slider.Root
                    className="relative flex items-center select-none touch-none w-full h-5"
                    value={[priceWeight * 100]}
                    max={100}
                    step={10}
                    onValueChange={v => setPriceWeight(v[0] / 100)}
                  >
                    <Slider.Track className="bg-secondary relative grow rounded-full h-2">
                      <Slider.Range className="absolute bg-primary rounded-full h-full" />
                    </Slider.Track>
                    <Slider.Thumb className="block w-5 h-5 bg-white rounded-full shadow-lg border-2 border-primary focus:outline-none focus:ring-2 focus:ring-primary" />
                  </Slider.Root>
                  <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                    Slide left to prioritise closer jobs, or right to prioritise higher-paying jobs.
                    The smart score also factors in the job's validity code (priority level).
                  </p>
                </div>
              )}
            </div>

            {/* Sort info panel */}
            {showSortInfo && (
              <div className="mt-4 bg-secondary/30 border border-border rounded-lg p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <p className="text-xs font-semibold text-foreground mb-2">Sorting options explained:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(SORT_DESCRIPTIONS).map(([key, desc]) => (
                    <div key={key} className="flex items-start gap-2 text-xs">
                      <span className="font-semibold text-primary capitalize min-w-[60px]">
                        {key === "validityCode" ? "Priority" : key}:
                      </span>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Location status */}
            {(sortBy === "distance" || sortBy === "smart") && (
              <div className="mt-3 flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                {locLoading ? (
                  <><Loader2 className="animate-spin w-4 h-4" /> Locating...</>
                ) : location ? (
                  <><MapPin className="w-4 h-4 text-primary" /> Location active{suburb ? `: ${suburb}` : ""}</>
                ) : (
                  <><MapPin className="w-4 h-4 text-destructive" /> Location required.{" "}
                    <button type="button" onClick={requestLocation} className="text-primary underline">Grant Permission</button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Job cards */}
          {(["all", "quote", "booking", "completed", "cancelled"] as const).map(tab => {
            const tabJobs = getFilteredJobs(tab);
            return (
              <Tabs.Content key={tab} value={tab} className="outline-none">
                {isLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} className="h-64 bg-card rounded-xl animate-pulse border border-white/5" />
                    ))}
                  </div>
                ) : tabJobs.length === 0 ? (
                  <div className="py-16 sm:py-20 text-center text-muted-foreground bg-card/30 rounded-xl border border-dashed border-white/10">
                    <BriefcaseBusiness className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg sm:text-xl font-display uppercase">No jobs found</h3>
                    <p className="text-sm mt-1">Adjust your filters or create a new enquiry.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                    {tabJobs.map(job => <JobCard key={job.id} job={job} userRole={userRoleFromSession} />)}
                  </div>
                )}
              </Tabs.Content>
            );
          })}
        </Tabs.Root>
      </div>
    </div>
  );
}
