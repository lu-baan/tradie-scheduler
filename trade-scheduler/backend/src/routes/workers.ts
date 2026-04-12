import { Router, type IRouter, type Request, type Response } from "express";
import { db, workersTable, jobsTable, usersTable, leaveRequestsTable } from "../db";
import { eq, not, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { CreateWorkerBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const workers = await db.select().from(workersTable);

    // Auto-restore workers whose unavailableUntil has passed
    const now = new Date();
    const toRestore = workers.filter(
      w => !w.isAvailable && w.unavailableUntil && w.unavailableUntil <= now
    );
    if (toRestore.length > 0) {
      for (const w of toRestore) {
        await db.update(workersTable)
          .set({ isAvailable: true, unavailableUntil: null })
          .where(eq(workersTable.id, w.id));
        w.isAvailable = true;
        w.unavailableUntil = null;
      }
    }

    // Attach loginNumber from users table for workers that have an account
    const users = await db
      .select({ workerId: usersTable.workerId, loginNumber: usersTable.loginNumber })
      .from(usersTable)
      .where(eq(usersTable.role, "worker"));

    const loginMap = new Map(users.map(u => [u.workerId, u.loginNumber]));

    res.json(workers.map(w => ({
      ...w,
      createdAt: w.createdAt.toISOString(),
      unavailableUntil: w.unavailableUntil ? w.unavailableUntil.toISOString() : null,
      skills: (() => { try { return JSON.parse(w.skillsJson || "[]"); } catch { return []; } })(),
      loginNumber: loginMap.get(w.id) ?? null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const body = CreateWorkerBody.parse(req.body);
    const [worker] = await db.insert(workersTable).values({
      ...body,
      isAvailable: body.isAvailable ?? true,
      unavailableUntil: body.unavailableUntil ? new Date(body.unavailableUntil) : null,
    }).returning();
    res.status(201).json({
      ...worker,
      createdAt: worker.createdAt.toISOString(),
      unavailableUntil: worker.unavailableUntil ? worker.unavailableUntil.toISOString() : null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) res.status(400).json({ error: "Validation error", details: err.message });
    else { console.error(err); res.status(500).json({ error: "Internal server error" }); }
  }
});

// Extended update schema — includes skills, hourly rate, max weekly hours
const UpdateWorkerBody = z.object({
  name: z.string().min(2),
  tradeType: z.string().min(2),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  isAvailable: z.boolean().optional(),
  unavailableUntil: z.string().nullable().optional(),
  skills: z.array(z.string()).optional(),
  hourlyRate: z.number().min(0).nullable().optional(),
  maxWeeklyHours: z.number().min(1).max(168).nullable().optional(),
});

function serializeWorker(w: typeof workersTable.$inferSelect & { loginNumber?: string | null }) {
  return {
    ...w,
    createdAt: w.createdAt.toISOString(),
    unavailableUntil: w.unavailableUntil ? w.unavailableUntil.toISOString() : null,
    skills: (() => { try { return JSON.parse(w.skillsJson || "[]"); } catch { return []; } })(),
    loginNumber: (w as any).loginNumber ?? null,
  };
}

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const body = UpdateWorkerBody.parse(req.body);
    const updateData = {
      name: body.name,
      tradeType: body.tradeType,
      phone: body.phone ?? null,
      email: body.email ?? null,
      isAvailable: body.isAvailable ?? true,
      unavailableUntil: body.unavailableUntil ? new Date(body.unavailableUntil) : null,
      skillsJson: JSON.stringify(body.skills ?? []),
      hourlyRate: body.hourlyRate ?? null,
      maxWeeklyHours: body.maxWeeklyHours ?? 38,
    };
    const [worker] = await db.update(workersTable).set(updateData).where(eq(workersTable.id, id)).returning();
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    res.json(serializeWorker(worker));
  } catch (err) {
    if (err instanceof z.ZodError) res.status(400).json({ error: "Validation error", details: err.message });
    else { console.error(err); res.status(500).json({ error: "Internal server error" }); }
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    // Remove this worker from all jobs that have them assigned
    const allJobs = await db.select().from(jobsTable);
    for (const job of allJobs) {
      const ids: number[] = JSON.parse(job.assignedWorkerIds || "[]");
      if (ids.includes(id)) {
        const updated = ids.filter(wid => wid !== id);
        await db.update(jobsTable)
          .set({ assignedWorkerIds: JSON.stringify(updated), updatedAt: new Date() })
          .where(eq(jobsTable.id, job.id));
      }
    }

    const [deleted] = await db.delete(workersTable).where(eq(workersTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Worker not found" }); return; }
    res.status(204).send();
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
