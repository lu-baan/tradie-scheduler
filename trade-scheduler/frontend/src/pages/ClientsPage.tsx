import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Users, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

interface Client {
  clientId:    number;
  clientName:  string;
  clientPhone: string | null;
  clientEmail: string | null;
  address:     string;
  jobCount:    number;
  lastJobDate: string;
}

interface ClientsResponse {
  clients:    Client[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

type SortOption = "recent" | "name_asc" | "name_desc";

const SORT_LABELS: Record<SortOption, string> = {
  recent:    "Recently Added",
  name_asc:  "Name A → Z",
  name_desc: "Name Z → A",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function ClientsPage() {
  const [, navigate] = useLocation();
  const [search, setSearch]           = useState("");
  const [debouncedSearch, setDebounced] = useState("");
  const [sort, setSort]               = useState<SortOption>("recent");
  const [page, setPage]               = useState(1);
  const [data, setData]               = useState<ClientsResponse | null>(null);
  const [loading, setLoading]         = useState(true);

  // Debounce search input by 300 ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever search or sort changes
  useEffect(() => { setPage(1); }, [debouncedSearch, sort]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page:  String(page),
        limit: "20",
        sort,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      const res = await fetch(`/api/clients?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [page, sort, debouncedSearch]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const cycleSorts: SortOption[] = ["recent", "name_asc", "name_desc"];
  const nextSort = () => {
    const idx = cycleSorts.indexOf(sort);
    setSort(cycleSorts[(idx + 1) % cycleSorts.length]);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">
            {data ? `${data.total} client${data.total !== 1 ? "s" : ""} found` : "Loading…"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={nextSort} className="shrink-0 gap-2">
          <ArrowUpDown size={14} />
          {SORT_LABELS[sort]}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-3 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone or address…"
          className="pl-9 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      <Card className="bg-card border-white/5 shadow-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">Loading…</div>
        ) : !data || data.clients.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Users size={40} className="mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground font-semibold">
              {debouncedSearch ? `No matching clients found for "${debouncedSearch}"` : "No clients yet"}
            </p>
            {debouncedSearch && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-primary text-sm hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-5 py-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Name</th>
                    <th className="text-left px-5 py-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Phone</th>
                    <th className="text-left px-5 py-3 font-display text-xs uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Email</th>
                    <th className="text-left px-5 py-3 font-display text-xs uppercase tracking-wider text-muted-foreground hidden xl:table-cell">Address</th>
                    <th className="text-center px-5 py-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Jobs</th>
                    <th className="text-left px-5 py-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Last Job</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clients.map((c, i) => (
                    <tr
                      key={c.clientId}
                      onClick={() => navigate(`/clients/${c.clientId}`)}
                      className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-primary/5 ${
                        i % 2 === 0 ? "bg-background/20" : ""
                      }`}
                    >
                      <td className="px-5 py-3.5 font-semibold text-foreground">{c.clientName}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{c.clientPhone ?? "—"}</td>
                      <td className="px-5 py-3.5 text-muted-foreground hidden lg:table-cell">{c.clientEmail ?? "—"}</td>
                      <td className="px-5 py-3.5 text-muted-foreground hidden xl:table-cell truncate max-w-[200px]">{c.address}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold">
                          {c.jobCount}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs">{formatDate(c.lastJobDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/50">
              {data.clients.map(c => (
                <div
                  key={c.clientId}
                  onClick={() => navigate(`/clients/${c.clientId}`)}
                  className="p-4 cursor-pointer hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{c.clientName}</p>
                      <p className="text-sm text-muted-foreground">{c.clientPhone ?? "No phone"}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{c.address}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary text-sm font-bold">
                        {c.jobCount}
                      </span>
                      <p className="text-[10px] text-muted-foreground mt-1">{formatDate(c.lastJobDate)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages} · {data.total} total
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
