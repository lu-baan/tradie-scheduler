import { Router, type IRouter, type Request, type Response } from "express";
import { db, jobsTable, workersTable } from "../db";
import { eq, and, inArray, not } from "drizzle-orm";
import { z } from "zod/v4";
import { CreateJobBody, UpdateJobBody, ListJobsQueryParams, ConvertToBookingBody } from "@workspace/api-zod";
import { sendJobCompletedSMS, sendBookingConfirmationSMS, sendBumpedSMS } from "../lib/sms";
import { sendInvoiceEmail } from "../lib/email";
import { generateInvoicePDF } from "../lib/pdf";
import { getDrivingDistances } from "../lib/maps";
import { requireAdmin } from "../middlewares/requireAuth";
import multer from "multer";
import { getSupabase, IMAGES_BUCKET } from "../lib/supabase";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

function parseWorkerIds(raw: string): number[] {
  try { return JSON.parse(raw) ?? []; } catch { return []; }
}

function parseImageUrls(raw: string): string[] {
  try { return JSON.parse(raw) ?? []; } catch { return []; }
}

/** Extract the storage-bucket path from either a Supabase public URL or a proxy URL. */
function extractStoragePath(url: string): string | null {
  // Proxy URL: /api/jobs/:id/img?p=<encoded-path>
  try {
    const u = new URL(url, "http://localhost");
    if (u.pathname.match(/^\/api\/jobs\/\d+\/img$/) && u.searchParams.has("p"))
      return u.searchParams.get("p");
  } catch { /* not a parseable URL, fall through */ }
  // Supabase public URL
  const marker = `/object/public/${IMAGES_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx !== -1) return url.slice(idx + marker.length);
  return null;
}

/** Convert a stored Supabase public URL to a backend-proxied URL. */
function toProxyUrl(jobId: number, supabaseUrl: string): string {
  const marker = `/object/public/${IMAGES_BUCKET}/`;
  const idx = supabaseUrl.indexOf(marker);
  if (idx === -1) return supabaseUrl;
  const path = supabaseUrl.slice(idx + marker.length);
  return `/api/jobs/${jobId}/img?p=${encodeURIComponent(path)}`;
}

function parseJsonArr<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try { return JSON.parse(raw) ?? []; } catch { return []; }
}

type AttendanceEvent = { workerId: number; action: string; ts: string };
const AttendanceBody = z.object({
  action: z.enum(["clock_in", "en_route", "on_site", "break_start", "break_end", "complete"]),
});

async function hydrateJobs(
  jobs: (typeof jobsTable.$inferSelect)[],
  userLat?: number,
  userLng?: number,
) {
  const allWorkerIds = [...new Set(jobs.flatMap(j => parseWorkerIds(j.assignedWorkerIds)))];
  const workersMap: Record<number, typeof workersTable.$inferSelect> = {};
  if (allWorkerIds.length > 0) {
    const workers = await db.select().from(workersTable).where(inArray(workersTable.id, allWorkerIds));
    workers.forEach(w => { workersMap[w.id] = w; });
  }

  // Fetch real driving distances (toll-free, suburb → job address) via Google Maps
  let driveMap = new Map<number, { distanceKm: number | null; durationMinutes: number | null }>();
  if (userLat !== undefined && userLng !== undefined) {
    try {
      driveMap = await getDrivingDistances(userLat, userLng, jobs.map(j => ({
        id: j.id,
        address: j.address,
        latitude: j.latitude,
        longitude: j.longitude,
      })));
    } catch (err) {
      console.error("[jobs] getDrivingDistances failed:", err);
    }
  }

  return jobs.map(job => {
    const ids = parseWorkerIds(job.assignedWorkerIds);
    const drive = driveMap.get(job.id) ?? { distanceKm: null, durationMinutes: null };
    return {
      ...job,
      validityCode: job.validityCode ?? 2,
      numTradies: job.numTradies ?? 1,
      assignedWorkerIds: ids,
      assignedWorkers: ids.map(id => workersMap[id]).filter(Boolean).map(w => ({
        ...w, createdAt: w.createdAt.toISOString(),
      })),
      imageUrls: parseImageUrls(job.imageUrls).map(u => toProxyUrl(job.id, u)),
      requiredSkills: parseJsonArr<string>(job.requiredSkillsJson),
      attendance: parseJsonArr<AttendanceEvent>(job.attendanceJson),
      distanceKm: drive.distanceKm,
      travelTimeMinutes: drive.durationMinutes,
      smartScore: null as number | null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  });
}

function generateInvoiceNumber(jobId: number): string {
  return `INV-${new Date().getFullYear()}-${String(jobId).padStart(5, "0")}`;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const query = ListJobsQueryParams.parse(req.query);
    const { sortBy, lat, lng, priceWeight = 0.5, distanceWeight = 0.5 } = query;

    let rows = await db.select().from(jobsTable);

    // Workers only see jobs they are assigned to — strip client PII for safety
    if (req.session.role === "worker") {
      const workerDbId = req.session.workerId;
      if (!workerDbId) {
        res.json([]);
        return;
      }
      rows = rows.filter(j => parseWorkerIds(j.assignedWorkerIds).includes(workerDbId));
    }

    const hydrated = await hydrateJobs(rows, lat, lng);

    if (sortBy === "smart" || sortBy === "distance") {
      const prices = hydrated.map(j => j.price);
      const distances = hydrated.map(j => j.distanceKm).filter((d): d is number => d !== null);
      const minP = Math.min(...prices), maxP = Math.max(...prices);
      const maxD = distances.length > 0 ? Math.max(...distances) : 100;

      hydrated.forEach(job => {
        const nPrice = maxP === minP ? 1 : (job.price - minP) / (maxP - minP);
        const nDist = job.distanceKm !== null ? 1 - job.distanceKm / maxD : 0.5;
        const vBonus = (job.validityCode / 3) * 0.2;
        job.smartScore = Math.round((nPrice * Number(priceWeight) + nDist * Number(distanceWeight) + vBonus) * 1000) / 1000;
      });
    }

    if (sortBy === "price") hydrated.sort((a, b) => b.price - a.price);
    else if (sortBy === "validityCode") hydrated.sort((a, b) => b.validityCode - a.validityCode);
    else if (sortBy === "distance") hydrated.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    else if (sortBy === "smart") hydrated.sort((a, b) => (b.smartScore ?? 0) - (a.smartScore ?? 0));
    else if (sortBy === "date") {
      hydrated.sort((a, b) => {
        if (!a.scheduledDate && !b.scheduledDate) return 0;
        if (!a.scheduledDate) return 1;
        if (!b.scheduledDate) return -1;
        return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
      });
    }

    // Emergency jobs always first
    hydrated.sort((a, b) => (b.isEmergency ? 1 : 0) - (a.isEmergency ? 1 : 0));

    res.json(hydrated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = CreateJobBody.parse(req.body);
    if (!body.clientPhone && !body.clientEmail) {
      res.status(400).json({ error: "Must have at least phone or email" });
      return;
    }
    const { requiredSkills: reqSkills, ...restBody } = body as typeof body & { requiredSkills?: string[] };
    const [job] = await db.insert(jobsTable).values({
      ...restBody,
      jobType: body.jobType ?? "quote",
      validityCode: body.validityCode ?? 2,
      numTradies: body.numTradies ?? 1,
      status: body.status ?? "pending",
      priority: body.priority ?? "medium",
      isEmergency: body.isEmergency ?? false,
      assignedWorkerIds: JSON.stringify(body.assignedWorkerIds ?? []),
      requiredSkillsJson: JSON.stringify(reqSkills ?? []),
    }).returning();

    const [hydrated] = await hydrateJobs([job]);

    // Send confirmation SMS for new bookings
    if (job.jobType === "booking" && job.clientPhone) {
      sendBookingConfirmationSMS(job.clientName, job.clientPhone, job.title, job.scheduledDate ?? null)
        .catch(err => console.error("Booking confirmation SMS failed:", err));
    }

    res.status(201).json(hydrated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.get("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    const [hydrated] = await hydrateJobs([job]);
    res.json(hydrated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    // Fetch existing job to detect status change
    const [existing] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Job not found" }); return; }

    const body = UpdateJobBody.parse(req.body);
    const { requiredSkills: reqSkillsUpd, ...restBodyUpd } = body as typeof body & { requiredSkills?: string[] };
    const updateData: Record<string, unknown> = { ...restBodyUpd, updatedAt: new Date() };
    if (body.assignedWorkerIds !== undefined) {
      updateData.assignedWorkerIds = JSON.stringify(body.assignedWorkerIds);
    }
    if (reqSkillsUpd !== undefined) {
      updateData.requiredSkillsJson = JSON.stringify(reqSkillsUpd);
    }

    // Detect completion
    const isNowCompleted = body.status === "completed" && existing.status !== "completed";
    if (isNowCompleted) {
      updateData.completedDate = new Date().toISOString();
      if (!existing.invoiceNumber) {
        updateData.invoiceNumber = generateInvoiceNumber(id);
      }
    }

    const [job] = await db.update(jobsTable).set(updateData).where(eq(jobsTable.id, id)).returning();
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    // Send SMS + invoice email after DB update, non-blocking
    if (isNowCompleted) {
      const invoiceNum = (updateData.invoiceNumber as string) || job.invoiceNumber || generateInvoiceNumber(id);

      if (job.clientPhone) {
        sendJobCompletedSMS(job.clientName, job.clientPhone, job.title, invoiceNum)
          .catch(err => console.error("SMS send failed:", err));
      }

      if (job.clientEmail) {
        // Build invoice data to generate PDF attachment
        const [hydratedForEmail] = await hydrateJobs([job]);
        const gst = Math.round(job.price * 0.1 * 100) / 100;
        generateInvoicePDF({
          invoiceNumber: invoiceNum,
          jobTitle: job.title,
          clientName: job.clientName,
          clientPhone: job.clientPhone ?? null,
          clientEmail: job.clientEmail,
          address: job.address,
          tradeType: job.tradeType,
          estimatedHours: job.estimatedHours,
          price: job.price,
          gst,
          totalWithGst: Math.round((job.price + gst) * 100) / 100,
          scheduledDate: job.scheduledDate ?? null,
          completedDate: job.completedDate ?? null,
          notes: job.notes ?? null,
          assignedWorkers: hydratedForEmail.assignedWorkers,
        }).then(pdfBuffer =>
          sendInvoiceEmail({
            clientName: job.clientName,
            clientEmail: job.clientEmail!,
            jobTitle: job.title,
            invoiceNumber: invoiceNum,
            totalWithGst: Math.round((job.price + gst) * 100) / 100,
            pdfBuffer,
          })
        ).catch(err => console.error("Invoice email failed:", err));
      }
    }

    const [hydrated] = await hydrateJobs([job]);
    res.json(hydrated);
  } catch (err) {
    if (err instanceof z.ZodError) res.status(400).json({ error: "Validation error", details: err.message });
    else { console.error(err); res.status(500).json({ error: "Internal server error" }); }
  }
});

router.delete("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [deleted] = await db.delete(jobsTable).where(eq(jobsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Job not found" }); return; }
    res.status(204).send();
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/:id/emergency", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    // ── Code 9: find the best worker to take this job next ───────────────────
    // Strategy: among workers of the matching tradeType, prefer whoever is
    // currently in_progress and closest to finishing. If nobody is in_progress,
    // fall back to whoever has the soonest upcoming confirmed/pending booking.
    // The Code 9 job is inserted as that worker's very next slot; any job
    // already occupying that slot is bumped.

    const tradeType = job.tradeType;
    let targetWorkerId: number | null = null;
    let scheduledStart: string | null = job.scheduledDate ?? null;
    const bumped: (typeof jobsTable.$inferSelect)[] = [];

    if (tradeType) {
      // Fetch all workers of the matching trade type
      const tradeWorkers = await db.select().from(workersTable)
        .where(eq(workersTable.tradeType, tradeType));
      const tradeWorkerIds = new Set(tradeWorkers.map(w => w.id));

      if (tradeWorkerIds.size > 0) {
        // Fetch all active jobs for those workers
        const activeJobs = await db.select().from(jobsTable)
          .where(and(
            not(eq(jobsTable.id, id)),
            inArray(jobsTable.status, ["in_progress", "confirmed", "pending"]),
          ));

        // Map each active job to the assigned trade-type workers it belongs to
        type WorkerJob = { workerId: number; job: typeof jobsTable.$inferSelect; finishMs: number };
        const workerJobs: WorkerJob[] = [];
        for (const j of activeJobs) {
          const assigned = parseWorkerIds(j.assignedWorkerIds).filter(wid => tradeWorkerIds.has(wid));
          for (const wid of assigned) {
            if (j.scheduledDate) {
              const startMs = new Date(j.scheduledDate).getTime();
              const estimatedMs = (j.estimatedHours ?? 1) * 60 * 60 * 1000;
              workerJobs.push({ workerId: wid, job: j, finishMs: startMs + estimatedMs });
            }
          }
        }

        // Prefer in_progress jobs (closest finisher first), else fall back to soonest upcoming
        const inProgress = workerJobs.filter(wj => wj.job.status === "in_progress");
        const upcoming   = workerJobs.filter(wj => wj.job.status !== "in_progress");

        const candidates = inProgress.length > 0 ? inProgress : upcoming;
        if (candidates.length > 0) {
          candidates.sort((a, b) => a.finishMs - b.finishMs);
          const best = candidates[0];
          targetWorkerId = best.workerId;
          // Schedule Code 9 to start exactly when the current job is estimated to finish
          scheduledStart = new Date(best.finishMs).toISOString();

          // Bump the next job already assigned to that worker that starts at or after scheduledStart
          const nextJobForWorker = upcoming
            .filter(wj => wj.workerId === targetWorkerId && wj.finishMs > best.finishMs)
            .sort((a, b) => new Date(a.job.scheduledDate!).getTime() - new Date(b.job.scheduledDate!).getTime());

          if (nextJobForWorker.length > 0) {
            const nextJob = nextJobForWorker[0].job;
            const [bumpedJob] = await db.update(jobsTable)
              .set({ status: "bumped", updatedAt: new Date() })
              .where(eq(jobsTable.id, nextJob.id))
              .returning();
            if (bumpedJob) bumped.push(bumpedJob);
          }
        }
      }
    }

    // Build the update payload — assign the target worker if found
    const updatePayload: Record<string, unknown> = {
      isEmergency: true,
      status: "confirmed",
      priority: "urgent",
      updatedAt: new Date(),
    };
    if (scheduledStart) updatePayload.scheduledDate = scheduledStart;
    if (targetWorkerId !== null) {
      const existing = parseWorkerIds(job.assignedWorkerIds);
      if (!existing.includes(targetWorkerId)) {
        updatePayload.assignedWorkerIds = JSON.stringify([...existing, targetWorkerId]);
      }
    }

    const [emergencyJob] = await db.update(jobsTable)
      .set(updatePayload)
      .where(eq(jobsTable.id, id))
      .returning();

    // Notify the emergency job's client
    if (emergencyJob.clientPhone) {
      sendBookingConfirmationSMS(emergencyJob.clientName, emergencyJob.clientPhone, emergencyJob.title, emergencyJob.scheduledDate ?? null)
        .catch(err => console.error("Emergency confirmation SMS failed:", err));
    }

    // Notify bumped clients via SMS (non-blocking)
    for (const bumpedJob of bumped) {
      if (bumpedJob.clientPhone) {
        sendBumpedSMS(bumpedJob.clientName, bumpedJob.clientPhone, bumpedJob.title, bumpedJob.scheduledDate ?? null)
          .catch(err => console.error(`Bumped SMS failed for job ${bumpedJob.id}:`, err));
      }
    }

    const [hydrated] = await hydrateJobs([emergencyJob]);
    res.json({
      emergencyJob: hydrated,
      assignedWorkerId: targetWorkerId,
      scheduledStart,
      bumpedCount: bumped.length,
      bumpedJobIds: bumped.map(b => b.id),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/:id/convert-to-booking", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const body = ConvertToBookingBody.parse(req.body);
    const [job] = await db.update(jobsTable).set({
      jobType: "booking",
      estimatedHours: body.estimatedHours,
      numTradies: body.numTradies ?? 1,
      callUpTimeHours: body.callUpTimeHours ?? null,
      scheduledDate: body.scheduledDate ?? null,
      assignedWorkerIds: JSON.stringify(body.assignedWorkerIds ?? []),
      notes: body.notes ?? undefined,
      status: "confirmed",
      updatedAt: new Date(),
    }).where(eq(jobsTable.id, id)).returning();
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    // Send booking confirmation SMS
    if (job.clientPhone) {
      sendBookingConfirmationSMS(job.clientName, job.clientPhone, job.title, job.scheduledDate ?? null)
        .catch(err => console.error("Booking confirmation SMS failed:", err));
    }

    const [hydrated] = await hydrateJobs([job]);
    res.json(hydrated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/:id/suggest-times", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    // Get existing scheduled jobs to find gaps
    const existing = await db.select().from(jobsTable)
      .where(and(inArray(jobsTable.status, ["pending", "confirmed", "in_progress"])));

    const bookedDates = new Set(existing.filter(j => j.scheduledDate).map(j => j.scheduledDate!.split("T")[0]));

    const suggestions = [];
    const base = new Date();
    base.setHours(8, 0, 0, 0);

    let dayIndex = 1;
    
    while (suggestions.length < 2 && dayIndex < 30) {
      const candidate = new Date(base);
      candidate.setDate(base.getDate() + dayIndex);
      const dayOfWeek = candidate.getDay();
      const dateStr = candidate.toISOString().split("T")[0];

      // Only check weekdays (Mon-Fri) that aren't already booked
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !bookedDates.has(dateStr)) {
        // For the first available day, try AM first
        // Then if we need a second slot and the day can accept PM, add PM on the same day
        if (suggestions.length === 0) {
          // Add AM slot (8:00)
          const amSlot = new Date(candidate);
          amSlot.setHours(8, 0, 0, 0);
          const amLabel = amSlot.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }) +
            ` at 8:00 AM`;
          suggestions.push({
            slot: amSlot.toISOString(),
            label: amLabel,
            reason: "Next available morning slot",
          });
        } else if (suggestions.length === 1) {
          // Add PM slot (13:00) on the SAME day if possible
          const pmSlot = new Date(candidate);
          pmSlot.setHours(13, 0, 0, 0);
          const pmLabel = pmSlot.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }) +
            ` at 1:00 PM`;
          suggestions.push({
            slot: pmSlot.toISOString(),
            label: pmLabel,
            reason: "Alternative afternoon slot same day",
          });
          
          // We have both slots for this day, move to next day for future lookups
          dayIndex++;
          continue;
        }
      }

      // If we didn't find both AM and PM on same day, move to next day
      dayIndex++;
    }

    res.json({ suggestions });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ── PATCH /api/jobs/:id/notes — update job notes (accessible to assigned workers) ──

router.patch("/:id/notes", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    // Workers may only update notes for jobs they are assigned to
    if (req.session.role === "worker") {
      const assigned = parseWorkerIds(job.assignedWorkerIds);
      if (!req.session.workerId || !assigned.includes(req.session.workerId)) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    const { notes } = z.object({ notes: z.string() }).parse(req.body);
    await db.update(jobsTable).set({ notes, updatedAt: new Date() }).where(eq(jobsTable.id, id));
    res.json({ notes });
  } catch (err) {
    if (err instanceof z.ZodError) res.status(400).json({ error: "notes field is required" });
    else { console.error(err); res.status(500).json({ error: "Internal server error" }); }
  }
});

router.get("/:id/invoice", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    const [hydrated] = await hydrateJobs([job]);
    const invoiceNumber = job.invoiceNumber || generateInvoiceNumber(job.id);
    if (!job.invoiceNumber) {
      await db.update(jobsTable).set({ invoiceNumber, updatedAt: new Date() }).where(eq(jobsTable.id, id));
    }

    const gst = Math.round(hydrated.price * 0.1 * 100) / 100;
    const invoiceData = {
      invoiceNumber,
      jobTitle: job.title,
      clientName: job.clientName,
      clientPhone: job.clientPhone ?? null,
      clientEmail: job.clientEmail ?? null,
      address: job.address,
      tradeType: job.tradeType,
      estimatedHours: job.estimatedHours,
      price: hydrated.price,
      gst,
      totalWithGst: Math.round((hydrated.price + gst) * 100) / 100,
      scheduledDate: job.scheduledDate ?? null,
      completedDate: job.completedDate ?? null,
      notes: job.notes ?? null,
      assignedWorkers: hydrated.assignedWorkers,
    };

    // Return PDF if requested
    console.log("Query params:", req.query, "format value:", req.query.format, typeof req.query.format);
if (String(req.query.format) === "pdf") {
      const pdfBuffer = await generateInvoicePDF(invoiceData);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoiceNumber}.pdf"`);
      res.send(pdfBuffer);
      return;
    }

    res.json({ ...invoiceData, status: job.status, issuedAt: new Date().toISOString() });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ── GET /api/jobs/:id/img?p=<path> — proxy image from Supabase storage ───────
// Serves images through the backend using the service-role key, so photos load
// regardless of whether the Supabase bucket is public or private.

router.get("/:id/img", async (req: Request, res: Response) => {
  const imagePath = decodeURIComponent(String(req.query.p ?? ""));
  if (!imagePath) { res.status(400).end(); return; }
  try {
    const { data, error } = await getSupabase().storage.from(IMAGES_BUCKET).download(imagePath);
    if (error || !data) { res.status(404).end(); return; }
    const contentType = (data.type && data.type !== "application/octet-stream") ? data.type : "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.end(Buffer.from(await data.arrayBuffer()));
  } catch (err) {
    console.error("[img-proxy]", err);
    res.status(500).end();
  }
});

// ── POST /api/jobs/:id/images — upload a photo ───────────────────────────────
// Available to both admins and assigned workers.

router.post("/:id/images", upload.single("image"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    // Workers may only upload to jobs they are assigned to
    if (req.session.role === "worker") {
      const assigned = parseWorkerIds(job.assignedWorkerIds);
      if (!req.session.workerId || !assigned.includes(req.session.workerId)) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    const ext = (req.file.originalname.split(".").pop() ?? "jpg").toLowerCase();
    const storagePath = `jobs/${id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await getSupabase().storage
      .from(IMAGES_BUCKET)
      .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (uploadError) {
      console.error("[images] Supabase upload error:", uploadError);
      res.status(500).json({ error: "Image upload failed" }); return;
    }

    const { data: urlData } = getSupabase().storage.from(IMAGES_BUCKET).getPublicUrl(storagePath);

    const existing = parseImageUrls(job.imageUrls);
    const [updated] = await db.update(jobsTable)
      .set({ imageUrls: JSON.stringify([...existing, urlData.publicUrl]), updatedAt: new Date() })
      .where(eq(jobsTable.id, id))
      .returning();

    const [hydrated] = await hydrateJobs([updated]);
    res.status(201).json(hydrated);
  } catch (err) {
    console.error("[images] upload error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/jobs/:id/images — remove a photo ─────────────────────────────

router.delete("/:id/images", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const { url } = z.object({ url: z.string().min(1) }).parse(req.body);

    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    if (req.session.role === "worker") {
      const assigned = parseWorkerIds(job.assignedWorkerIds);
      if (!req.session.workerId || !assigned.includes(req.session.workerId)) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    // Accept both proxy URLs (/api/jobs/:id/img/...) and original Supabase public URLs
    const storagePath = extractStoragePath(url);
    if (!storagePath) { res.status(400).json({ error: "Invalid image URL" }); return; }
    await getSupabase().storage.from(IMAGES_BUCKET).remove([storagePath]);

    const updated_urls = parseImageUrls(job.imageUrls).filter(u => extractStoragePath(u) !== storagePath);
    const [updated] = await db.update(jobsTable)
      .set({ imageUrls: JSON.stringify(updated_urls), updatedAt: new Date() })
      .where(eq(jobsTable.id, id))
      .returning();

    const [hydrated] = await hydrateJobs([updated]);
    res.json(hydrated);
  } catch (err) {
    if (err instanceof z.ZodError) res.status(400).json({ error: "url is required" });
    else { console.error("[images] delete error:", err); res.status(500).json({ error: "Internal server error" }); }
  }
});

// ── POST /api/jobs/:id/attendance — log a time & attendance event ─────────────
// Workers can only log events for jobs they are assigned to, and only for themselves.
// Admins can log on behalf of any assigned worker.

router.post("/:id/attendance", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    const assigned = parseWorkerIds(job.assignedWorkerIds);

    // Resolve the workerId for this event
    let workerId: number;
    if (req.session.role === "worker") {
      if (!req.session.workerId || !assigned.includes(req.session.workerId)) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
      workerId = req.session.workerId;
    } else {
      // Admin may pass a workerId in body; default to first assigned worker
      const adminBody = z.object({ workerId: z.number().optional(), action: z.string() }).parse(req.body);
      workerId = adminBody.workerId ?? assigned[0];
      if (!workerId) { res.status(400).json({ error: "No workers assigned to this job" }); return; }
    }

    const { action } = AttendanceBody.parse(req.body);
    const event: AttendanceEvent = { workerId, action, ts: new Date().toISOString() };

    const existing = parseJsonArr<AttendanceEvent>(job.attendanceJson);
    const [updated] = await db.update(jobsTable)
      .set({ attendanceJson: JSON.stringify([...existing, event]), updatedAt: new Date() })
      .where(eq(jobsTable.id, id))
      .returning();

    const [hydrated] = await hydrateJobs([updated]);
    res.json(hydrated);
  } catch (err) {
    if (err instanceof z.ZodError) res.status(400).json({ error: "Invalid action", details: err.message });
    else { console.error("[attendance]", err); res.status(500).json({ error: "Internal server error" }); }
  }
});

// ── POST /api/jobs/:id/respond — worker accepts or declines an assigned job ───

router.post("/:id/respond", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    // Only workers can respond; admins assign directly
    if (req.session.role !== "worker" || !req.session.workerId) {
      res.status(403).json({ error: "Only workers can accept or decline jobs" }); return;
    }

    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    const assigned = parseWorkerIds(job.assignedWorkerIds);
    if (!assigned.includes(req.session.workerId)) {
      res.status(403).json({ error: "You are not assigned to this job" }); return;
    }

    const { response } = z.object({ response: z.enum(["accepted", "rejected"]) }).parse(req.body);
    const workerId = req.session.workerId;

    // Record the response as an attendance-style event
    const existing = parseJsonArr<AttendanceEvent>(job.attendanceJson);
    const event: AttendanceEvent = { workerId, action: response, ts: new Date().toISOString() };
    const updatedAttendance = JSON.stringify([...existing, event]);

    if (response === "rejected") {
      // Remove the worker from this job's assigned list
      const remaining = assigned.filter(wid => wid !== workerId);
      await db.update(jobsTable)
        .set({ assignedWorkerIds: JSON.stringify(remaining), attendanceJson: updatedAttendance, updatedAt: new Date() })
        .where(eq(jobsTable.id, id));
      res.json({ response, removed: true });
    } else {
      await db.update(jobsTable)
        .set({ attendanceJson: updatedAttendance, updatedAt: new Date() })
        .where(eq(jobsTable.id, id));
      res.json({ response, removed: false });
    }
  } catch (err) {
    if (err instanceof z.ZodError) res.status(400).json({ error: "response must be 'accepted' or 'rejected'" });
    else { console.error("[respond]", err); res.status(500).json({ error: "Internal server error" }); }
  }
});

export default router;
