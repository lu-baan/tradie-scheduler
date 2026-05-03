/**
 * Google Maps helpers
 *
 * Reverse-geocodes a GPS coordinate to the nearest suburb (locality),
 * then uses the Distance Matrix API to get real driving distances
 * (toll-free) from that suburb to each job address.
 *
 * Falls back to straight-line haversine if the API key is missing
 * or a request fails.
 */

const API_KEY = (process.env.GOOGLE_MAPS_API_KEY ?? process.env.VITE_GOOGLE_MAPS_API_KEY ?? "").trim();

// ── In-memory caches ──────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

function makeCache<T>(ttlMs: number) {
  const store = new Map<string, CacheEntry<T>>();
  return {
    get(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) { store.delete(key); return undefined; }
      return entry.value;
    },
    set(key: string, value: T) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  };
}

// Suburb lookup: cache for 30 min (user probably doesn't move suburbs)
const suburbCache = makeCache<string>(30 * 60_000);

// Driving distance: cache for 1 hour (routes don't change often)
const distanceCache = makeCache<{ distanceKm: number | null; durationMinutes: number | null }>(60 * 60_000);

// ── Haversine fallback ────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Reverse geocode lat/lng → suburb name ────────────────────────────────────

/**
 * Returns the locality (suburb) string for the given coordinates,
 * e.g. "Fitzroy, VIC 3065, Australia".
 * Falls back to "LAT,LNG" string if the API call fails.
 */
export async function reverseGeocodeSuburb(lat: number, lng: number): Promise<string> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = suburbCache.get(cacheKey);
  if (cached) return cached;

  if (!API_KEY) return `${lat},${lng}`;

  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${lat},${lng}` +
      `&result_type=locality` +
      `&region=au` +
      `&key=${API_KEY}`;

    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json() as any;

    if (data.status === "OK" && data.results?.length > 0) {
      // Prefer the "short" formatted address of the locality result
      const result = data.results[0];
      const suburb = result.formatted_address as string;
      suburbCache.set(cacheKey, suburb);
      return suburb;
    }

    // Fallback: use coordinates as origin — Maps API still handles this correctly
    const fallback = `${lat},${lng}`;
    suburbCache.set(cacheKey, fallback);
    return fallback;
  } catch (err) {
    console.error("[maps] reverseGeocodeSuburb error:", err);
    return `${lat},${lng}`;
  }
}

// ── Distance Matrix: suburb → job addresses ──────────────────────────────────

export interface DriveResult {
  distanceKm: number | null;
  durationMinutes: number | null;
}

/**
 * Fetches real driving distances (toll-free) from the given suburb
 * to each destination address.  Results are returned in the same
 * order as `destinations`.
 */
async function fetchDistanceMatrixBatch(
  origin: string,
  destinations: string[],
): Promise<DriveResult[]> {
  if (!API_KEY || destinations.length === 0) {
    return destinations.map(() => ({ distanceKm: null, durationMinutes: null }));
  }

  const destParam = destinations.map(d => encodeURIComponent(d)).join("|");
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${encodeURIComponent(origin)}` +
    `&destinations=${destParam}` +
    `&mode=driving` +
    `&avoid=tolls` +
    `&region=au` +
    `&key=${API_KEY}`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await resp.json() as any;

  if (data.status !== "OK" || !data.rows?.[0]?.elements) {
    console.error("[maps] Distance Matrix non-OK status:", data.status, data.error_message);
    return destinations.map(() => ({ distanceKm: null, durationMinutes: null }));
  }

  return (data.rows[0].elements as any[]).map((el: any) => {
    if (el.status !== "OK") return { distanceKm: null, durationMinutes: null };
    return {
      distanceKm: Math.round((el.distance.value / 1000) * 10) / 10, // metres → km, 1dp
      durationMinutes: Math.round(el.duration.value / 60),           // seconds → minutes
    };
  });
}

/**
 * Main entry point used by the jobs route.
 *
 * - Reverse-geocodes `userLat/userLng` to the nearest suburb.
 * - Calls the Distance Matrix API in batches of 25 destinations.
 * - Results are cached per (suburb × job address) pair.
 * - Falls back to haversine when the Maps API is unavailable.
 *
 * @param userLat - User's current latitude
 * @param userLng - User's current longitude
 * @param jobs    - Array of jobs, each with { id, address, latitude?, longitude? }
 * @returns       Map from job id → DriveResult
 */
export async function getDrivingDistances(
  userLat: number,
  userLng: number,
  jobs: Array<{ id: number; address: string; latitude?: number | null; longitude?: number | null }>,
): Promise<Map<number, DriveResult>> {
  const results = new Map<number, DriveResult>();

  if (jobs.length === 0) return results;

  // Get suburb of user
  const suburb = await reverseGeocodeSuburb(userLat, userLng);

  // Separate cached from uncached
  const toFetch: Array<{ job: (typeof jobs)[number]; idx: number }> = [];

  for (const job of jobs) {
    const cacheKey = `${suburb}||${job.address}`;
    const cached = distanceCache.get(cacheKey);
    if (cached) {
      results.set(job.id, cached);
    } else {
      toFetch.push({ job, idx: toFetch.length });
    }
  }

  if (toFetch.length === 0) return results;

  // Batch into groups of 25 (Distance Matrix limit with 1 origin)
  const BATCH = 25;
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    const addresses = batch.map(b => b.job.address);

    let batchResults: DriveResult[];
    try {
      batchResults = await fetchDistanceMatrixBatch(suburb, addresses);
    } catch (err) {
      console.error("[maps] Distance Matrix fetch error:", err);
      // Haversine fallback for this batch
      batchResults = batch.map(b =>
        b.job.latitude && b.job.longitude
          ? {
              distanceKm: Math.round(haversineKm(userLat, userLng, b.job.latitude, b.job.longitude) * 10) / 10,
              durationMinutes: null,
            }
          : { distanceKm: null, durationMinutes: null }
      );
    }

    for (let j = 0; j < batch.length; j++) {
      const { job } = batch[j];
      const result = batchResults[j] ?? { distanceKm: null, durationMinutes: null };

      // If Maps returned null (e.g. address not found), fall back to haversine
      const final: DriveResult = result.distanceKm !== null
        ? result
        : job.latitude && job.longitude
        ? {
            distanceKm: Math.round(haversineKm(userLat, userLng, job.latitude, job.longitude) * 10) / 10,
            durationMinutes: null,
          }
        : { distanceKm: null, durationMinutes: null };

      distanceCache.set(`${suburb}||${job.address}`, final);
      results.set(job.id, final);
    }
  }

  return results;
}

// ── Distance Matrix: multiple worker locations → single job address ────────────

export interface WorkerDistance {
  workerId: number;
  distanceKm: number | null;
  durationMinutes: number | null;
}

/**
 * Fetches driving distances from multiple worker locations to a single job address.
 * Uses the Distance Matrix API with multiple origins and one destination.
 */
export async function getWorkerDistancesToJob(
  workers: Array<{ workerId: number; lat: number; lng: number }>,
  jobAddress: string,
): Promise<WorkerDistance[]> {
  if (workers.length === 0 || !jobAddress) return [];

  const results: WorkerDistance[] = [];
  const toFetch: typeof workers = [];

  for (const w of workers) {
    const cacheKey = `wdist||${w.lat.toFixed(4)},${w.lng.toFixed(4)}||${jobAddress}`;
    const cached = distanceCache.get(cacheKey);
    if (cached) {
      results.push({ workerId: w.workerId, ...cached });
    } else {
      toFetch.push(w);
    }
  }

  if (toFetch.length === 0) return results;

  if (!API_KEY) {
    for (const w of toFetch) results.push({ workerId: w.workerId, distanceKm: null, durationMinutes: null });
    return results;
  }

  const BATCH = 25;
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    const originsParam = batch.map(w => encodeURIComponent(`${w.lat},${w.lng}`)).join("|");
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${originsParam}` +
      `&destinations=${encodeURIComponent(jobAddress)}` +
      `&mode=driving` +
      `&avoid=tolls` +
      `&region=au` +
      `&key=${API_KEY}`;

    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await resp.json() as any;

      if (data.status !== "OK" || !data.rows) {
        console.error("[maps] getWorkerDistancesToJob non-OK:", data.status, data.error_message);
        for (const w of batch) results.push({ workerId: w.workerId, distanceKm: null, durationMinutes: null });
        continue;
      }

      for (let j = 0; j < batch.length; j++) {
        const w = batch[j];
        const el = data.rows[j]?.elements?.[0];
        const result: DriveResult = (!el || el.status !== "OK")
          ? { distanceKm: null, durationMinutes: null }
          : {
              distanceKm: Math.round((el.distance.value / 1000) * 10) / 10,
              durationMinutes: Math.round(el.duration.value / 60),
            };
        distanceCache.set(`wdist||${w.lat.toFixed(4)},${w.lng.toFixed(4)}||${jobAddress}`, result);
        results.push({ workerId: w.workerId, ...result });
      }
    } catch (err) {
      console.error("[maps] getWorkerDistancesToJob fetch error:", err);
      for (const w of batch) results.push({ workerId: w.workerId, distanceKm: null, durationMinutes: null });
    }
  }

  return results;
}
