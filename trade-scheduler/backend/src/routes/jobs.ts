import { Router, type IRouter, type Request, type Response } from "express";
import { db, jobsTable, workersTable } from "../db";
import { eq, and, inArray, not } from "drizzle-orm";
import { z } from "zod/v4";
import { CreateJobBody, UpdateJobBody, ListJobsQueryParams, ConvertToBookingBody } from "../api-zod";
import { sendJobCompletedSMS } from "../lib/sms";
import { generateInvoicePDF } from "../lib/pdf";
import { getDrivingDistances } from "../lib/maps";

const router: IRouter = Router();

function parseWorkerIds(raw: string): number[] {
  try { return JSON.parse(raw) ?? []; } catch { return []; }
}

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

router.post("/", async (req: Request, res: Response) => {
  try {
    const body = CreateJobBody.parse(req.body);
    if (!body.clientPhone && !body.clientEmail) {
      res.status(400).json({ error: "Must have at least phone or email" });
      return;
    }
    const [job] = await db.insert(jobsTable).values({
      ...body,
      jobType: body.jobType ?? "quote",
      validityCode: body.validityCode ?? 2,
      numTradies: body.numTradies ?? 1,
      status: body.status ?? "pending",
      priority: body.priority ?? "medium",
      isEmergency: body.isEmergency ?? false,
      assignedWorkerIds: JSON.stringify(body.assignedWorkerIds ?? []),
    }).returning();

    const [hydrated] = await hydrateJobs([job]);
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

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    const [hydrated] = await hydrateJobs([job]);
    res.json(hydrated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    // Fetch existing job to detect status change
    const [existing] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Job not found" }); return; }

    const body = UpdateJobBody.parse(req.body);
    const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
    if (body.assignedWorkerIds !== undefined) {
      updateData.assignedWorkerIds = JSON.stringify(body.assignedWorkerIds);
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

    // Send SMS after DB update, non-blocking
    if (isNowCompleted && job.clientPhone) {
      const invoiceNum = (updateData.invoiceNumber as string) || job.invoiceNumber || generateInvoiceNumber(id);
      sendJobCompletedSMS(job.clientName, job.clientPhone, job.title, invoiceNum)
        .catch(err => console.error("SMS send failed:", err));
    }

    const [hydrated] = await hydrateJobs([job]);
    res.json(hydrated);
  } catch (err) {
    if (err instanceof z.ZodError) res.status(400).json({ error: "Validation error", details: err.message });
    else { console.error(err); res.status(500).json({ error: "Internal server error" }); }
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const [deleted] = await db.delete(jobsTable).where(eq(jobsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Job not found" }); return; }
    res.status(204).send();
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/:id/emergency", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    // Mark this job as emergency
    const [emergencyJob] = await db.update(jobsTable)
      .set({ isEmergency: true, status: "confirmed", priority: "urgent", updatedAt: new Date() })
      .where(eq(jobsTable.id, id))
      .returning();

    // FIXED: Only bump bookings scheduled for the SAME DAY as this emergency job
    const emergencyDate = emergencyJob.scheduledDate?.split("T")[0];
    const bumped = emergencyDate
      ? await db.update(jobsTable)
          .set({ status: "bumped", updatedAt: new Date() })
          .where(
            and(
              not(eq(jobsTable.id, id)),
              eq(jobsTable.jobType, "booking"),
              inArray(jobsTable.status, ["pending", "confirmed"]),
              // Only bump jobs scheduled on the same date as this emergency
              inArray(
                jobsTable.scheduledDate,
                [emergencyDate]
              )
            )
          )
          .returning()
      : [];

    const [hydrated] = await hydrateJobs([emergencyJob]);
    res.json({
      emergencyJob: hydrated,
      bumpedCount: bumped.length,
      bumpedJobIds: bumped.map(b => b.id),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/:id/convert-to-booking", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
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
    const [hydrated] = await hydrateJobs([job]);
    res.json(hydrated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/:id/suggest-times", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
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

router.get("/:id/invoice", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
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

export default router;
