import { useState, useEffect, useCallback } from "react";
import { MapPin, Search, ArrowUpAZ, ArrowDownAZ, RefreshCw, Clock, WifiOff, Phone, Mail, Briefcase, Navigation } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { useGeolocation } from "@/hooks/use-geolocation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkerLocation {
  workerId: number;
  workerName: string;
  tradeType: string;
  isAvailable: boolean;
  location: {
    suburb: string;
    lat?: number;
    lng?: number;
    ts: string;
    action: string;
  } | null;
}

interface WorkerDetail {
  id: number;
  name: string;
  tradeType: string;
  phone: string | null;
  email: string | null;
  isAvailable: boolean;
  hourlyRate: number | null;
  skills: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarColor(name: string) {
  const colors = [
    "bg-blue-500", "bg-violet-500", "bg-emerald-500",
    "bg-orange-500", "bg-pink-500", "bg-cyan-500", "bg-amber-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initials = name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  const cls = size === "lg"
    ? "w-14 h-14 text-base"
    : "w-10 h-10 text-sm";
  return (
    <div className={`${cls} rounded-full ${avatarColor(name)} flex items-center justify-center text-white font-bold shrink-0`}>
      {initials}
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  clock_in: "Clocked In",
  en_route: "En Route",
  on_site:  "On Site",
  complete: "Completed",
};

function fmtTime(iso: string) {
  try {
    return format(parseISO(iso), "h:mm a, d MMM");
  } catch {
    return iso;
  }
}

// ── Worker Profile Dialog ─────────────────────────────────────────────────────

function WorkerProfileDialog({ entry, onClose }: { entry: WorkerLocation; onClose: () => void }) {
  const [worker, setWorker] = useState<WorkerDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workers", { credentials: "include" })
      .then(r => r.json())
      .then((workers: WorkerDetail[]) => {
        setWorker(workers.find(w => w.id === entry.workerId) ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entry.workerId]);

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar name={entry.workerName} size="lg" />
            <div>
              <p className="font-display font-bold text-lg leading-tight">{entry.workerName}</p>
              <p className="text-sm text-primary font-medium">{entry.tradeType}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm pt-1">
          {/* Availability */}
          <span className={`inline-flex text-xs font-bold px-2.5 py-1 rounded-full ${entry.isAvailable ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>
            {entry.isAvailable ? "Available" : "Off Duty"}
          </span>

          {loading ? (
            <div className="py-4 text-center text-muted-foreground text-xs">Loading profile…</div>
          ) : (
            <>
              {/* Contact */}
              {worker?.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone size={14} className="text-primary shrink-0" />
                  <a href={`tel:${worker.phone}`} className="hover:text-primary transition-colors">{worker.phone}</a>
                </div>
              )}
              {worker?.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail size={14} className="text-primary shrink-0" />
                  <a href={`mailto:${worker.email}`} className="hover:text-primary transition-colors text-xs truncate">{worker.email}</a>
                </div>
              )}

              {/* Trade / Rate */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Briefcase size={14} className="text-primary shrink-0" />
                <span>{entry.tradeType}{worker?.hourlyRate ? ` · $${worker.hourlyRate}/hr` : ""}</span>
              </div>

              {/* Skills */}
              {worker?.skills && worker.skills.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display mb-1.5">Skills & Licences</p>
                  <div className="flex flex-wrap gap-1">
                    {worker.skills.map(s => (
                      <span key={s} className="text-[10px] bg-secondary px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Last known location */}
          {entry.location && (
            <div className="flex items-start gap-2 pt-3 border-t border-border">
              <MapPin size={14} className="text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{entry.location.suburb}</p>
                <p className="text-xs text-muted-foreground">
                  {ACTION_LABEL[entry.location.action] ?? entry.location.action} · {fmtTime(entry.location.ts)}
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Worker location card ──────────────────────────────────────────────────────

function WorkerLocationCard({ entry, onClick }: { entry: WorkerLocation; onClick: () => void }) {
  const hasLocation = entry.location !== null;

  return (
    <div
      onClick={onClick}
      className="bg-card/40 border border-border/50 rounded-xl p-4 flex items-start gap-3 hover:bg-card/60 hover:border-primary/30 transition-colors cursor-pointer"
    >
      <Avatar name={entry.workerName} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground leading-tight truncate">{entry.workerName}</p>
            <p className="text-xs text-primary truncate">{entry.tradeType}</p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${entry.isAvailable ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>
            {entry.isAvailable ? "Available" : "Off Duty"}
          </span>
        </div>

        <div className="mt-2">
          {hasLocation ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-sm text-foreground">
                <MapPin size={13} className="text-primary shrink-0" />
                <span className="truncate">{entry.location!.suburb}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-[21px]">
                <Clock size={10} />
                <span>{ACTION_LABEL[entry.location!.action] ?? entry.location!.action} · {fmtTime(entry.location!.ts)}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic mt-1">
              <WifiOff size={11} />
              No location recorded yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function LocationView() {
  const [data, setData] = useState<WorkerLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [profileWorker, setProfileWorker] = useState<WorkerLocation | null>(null);

  const { location, suburb, requestLocation, loading: locLoading } = useGeolocation();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/workers/locations", { credentials: "include" });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setLastRefreshed(new Date());
    } catch {
      // silently fail on background refresh
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    requestLocation();
    const interval = setInterval(() => load(true), 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const filtered = data
    .filter(w => w.workerName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sortDir === "asc"
        ? a.workerName.localeCompare(b.workerName)
        : b.workerName.localeCompare(a.workerName)
    );

  const withLocation = filtered.filter(w => w.location !== null);
  const withoutLocation = filtered.filter(w => w.location === null);
  const sorted = [...withLocation, ...withoutLocation];

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex justify-between items-start gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground">Location</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Last known suburb per worker · geotagged on site check-in/out.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastRefreshed && (
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              Updated {format(lastRefreshed, "h:mm:ss a")}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing}
            className="h-8 px-3"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* Your location banner */}
      <div className="flex items-center gap-2 text-xs bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
        <Navigation size={12} className="text-blue-400 shrink-0" />
        {locLoading ? (
          <span className="text-muted-foreground">Locating you…</span>
        ) : location ? (
          <span className="text-blue-400 font-medium">
            Your location: {suburb ?? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
          </span>
        ) : (
          <button
            type="button"
            onClick={requestLocation}
            className="text-blue-400 hover:underline"
          >
            Show your location
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search workers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
          className="h-10 px-3 shrink-0"
          title={sortDir === "asc" ? "A → Z (click to reverse)" : "Z → A (click to reverse)"}
        >
          {sortDir === "asc" ? <ArrowUpAZ size={15} /> : <ArrowDownAZ size={15} />}
          <span className="ml-1.5 text-xs hidden sm:inline">{sortDir === "asc" ? "A–Z" : "Z–A"}</span>
        </Button>
      </div>

      {/* Summary chips */}
      {!loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-full">
            <MapPin size={10} /> {withLocation.length} located
          </span>
          <span className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded-full">
            <WifiOff size={10} /> {withoutLocation.length} no data
          </span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-24 bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground bg-card/30 rounded-xl border border-dashed border-white/10">
          <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-display uppercase">No workers found</h3>
          <p className="text-sm mt-1">
            {search ? "Try a different search term." : "Add workers and they will appear here once they check in."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map(w => (
            <WorkerLocationCard key={w.workerId} entry={w} onClick={() => setProfileWorker(w)} />
          ))}
        </div>
      )}

      {/* Worker profile dialog */}
      {profileWorker && (
        <WorkerProfileDialog entry={profileWorker} onClose={() => setProfileWorker(null)} />
      )}
    </div>
  );
}
