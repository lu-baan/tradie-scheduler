import { useState, useEffect } from "react";
import { useListJobs, ListJobsSortBy } from "@/lib/api-client";
import { JobCard } from "@/components/jobs/JobCard";
import { JobForm } from "@/components/jobs/JobForm";
import { useGeolocation } from "@/hooks/use-geolocation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, SlidersHorizontal, MapPin, Loader2, BriefcaseBusiness } from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import * as Slider from "@radix-ui/react-slider";

export function JobsList() {
  const [sortBy, setSortBy] = useState<ListJobsSortBy>("smart");
  const [priceWeight, setPriceWeight] = useState(0.5);
  const [filterType, setFilterType] = useState<"all" | "quote" | "booking" | "completed">("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  const { location, requestLocation, loading: locLoading } = useGeolocation();

  // If we try to sort by distance or smart, we need location
  useEffect(() => {
    if ((sortBy === "distance" || sortBy === "smart") && !location) {
      requestLocation();
    }
  }, [sortBy, requestLocation]);

  // Fetch Jobs based on sorting and location
  const { data: jobs, isLoading } = useListJobs({
    sortBy,
    lat: location?.lat,
    lng: location?.lng,
    priceWeight,
    distanceWeight: 1 - priceWeight,
  });

  const getFilteredJobs = (tab: typeof filterType) => {
    const all = jobs || [];
    if (tab === "all") return all.filter(job => job.status !== "completed");
    if (tab === "completed") return all.filter(job => job.status === "completed");
    return all.filter(job => job.jobType === tab && job.status !== "completed");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground">Jobs Manager</h1>
          <p className="text-muted-foreground mt-1">Schedule, dispatch, and track all operations.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="font-bold text-base shadow-[0_0_20px_rgba(234,88,12,0.4)]">
              <Plus className="mr-2" /> New Enquiry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Enquiry</DialogTitle>
            </DialogHeader>
            <JobForm onSuccess={() => setIsAddOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-white/5 rounded-xl p-4 shadow-xl">
        <Tabs.Root value={filterType} onValueChange={(v) => setFilterType(v as any)}>
          <Tabs.List className="flex overflow-x-auto border-b border-border mb-6 no-scrollbar">
            {["all", "quote", "booking", "completed"].map(tab => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="px-6 py-3 font-display uppercase tracking-wider font-semibold text-sm transition-colors data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary text-muted-foreground hover:text-foreground whitespace-nowrap"
              >
                {tab === "all" ? "Active Jobs" : tab === "completed" ? "Completed" : tab + "s"}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <div className="bg-background/50 p-4 rounded-lg border border-border mb-6">
            <div className="flex flex-col lg:flex-row gap-6 justify-between lg:items-center">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-display uppercase text-muted-foreground mr-2"><SlidersHorizontal size={14} className="inline mr-1"/> Sort By:</span>
                {(["date", "price", "distance", "smart", "validityCode"] as ListJobsSortBy[]).map(sort => (
                  <Button 
                    key={sort}
                    size="sm" 
                    variant={sortBy === sort ? "default" : "outline"}
                    onClick={() => setSortBy(sort)}
                    className="capitalize"
                  >
                    {sort}
                  </Button>
                ))}
              </div>

              {sortBy === "smart" && (
                <div className="flex-1 max-w-md bg-card p-3 rounded-md border border-border">
                  <div className="flex justify-between text-xs font-display uppercase mb-2 text-muted-foreground">
                    <span>Distance Weight ({(1 - priceWeight).toFixed(1)})</span>
                    <span>Price Weight ({priceWeight.toFixed(1)})</span>
                  </div>
                  <Slider.Root
                    className="relative flex items-center select-none touch-none w-full h-5"
                    value={[priceWeight * 100]}
                    max={100}
                    step={10}
                    onValueChange={(v) => setPriceWeight(v[0] / 100)}
                  >
                    <Slider.Track className="bg-secondary relative grow rounded-full h-2">
                      <Slider.Range className="absolute bg-primary rounded-full h-full" />
                    </Slider.Track>
                    <Slider.Thumb className="block w-5 h-5 bg-white rounded-full shadow-lg border-2 border-primary focus:outline-none focus:ring-2 focus:ring-primary" />
                  </Slider.Root>
                </div>
              )}
            </div>

            {(sortBy === "distance" || sortBy === "smart") && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                {locLoading ? (
                  <><Loader2 className="animate-spin w-4 h-4" /> Locating...</>
                ) : location ? (
                  <><MapPin className="w-4 h-4 text-primary" /> Location active for distance calculation</>
                ) : (
                  <><MapPin className="w-4 h-4 text-destructive" /> Location required for distance sort. <button onClick={requestLocation} className="text-primary underline">Grant Permission</button></>
                )}
              </div>
            )}
          </div>

          {(["all", "quote", "booking", "completed"] as const).map(tab => {
            const tabJobs = getFilteredJobs(tab);
            return (
              <Tabs.Content key={tab} value={tab} className="outline-none">
                {isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} className="h-64 bg-card rounded-xl animate-pulse border border-white/5" />
                    ))}
                  </div>
                ) : tabJobs.length === 0 ? (
                  <div className="py-20 text-center text-muted-foreground bg-card/30 rounded-xl border border-dashed border-white/10">
                    <BriefcaseBusiness className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <h3 className="text-xl font-display uppercase">No jobs found</h3>
                    <p>Adjust your filters or create a new enquiry.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tabJobs.map(job => (
                      <JobCard key={job.id} job={job} />
                    ))}
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
