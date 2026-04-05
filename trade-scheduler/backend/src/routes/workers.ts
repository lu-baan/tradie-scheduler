import { Router, type IRouter, type Request, type Response } from "express";
import { db, workersTable, jobsTable } from "../db";
import { usersTable } from "../db/schema/users";
import { eq, not, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { CreateWorkerBody } from "../api-zod";

const router: IRouter = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const workers = await db.select().from(workersTable);

    // Attach loginNumber from users table for workers that have an account
    const users = await db
      .select({ workerId: usersTable.workerId, loginNumber: usersTable.loginNumber })
      .from(usersTable)
      .where(eq(usersTable.role, "worker"));

    const loginMap = new Map(users.map(u => [u.workerId, u.loginNumber]));

    res.json(workers.map(w => ({
      ...w,
      createdAt: w.createdAt.toISOString(),
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
    }).returning();
    res.status(201).json({ ...worker, createdAt: worker.createdAt.toISOString() });
  } catch (err) {
    if (err instanceof z.ZodError) res.status(400).json({ error: "Validation error", details: err.message });
    else { console.error(err); res.status(500).json({ error: "Internal server error" }); }
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const body = CreateWorkerBody.parse(req.body);
    const [worker] = await db.update(workersTable).set(body).where(eq(workersTable.id, id)).returning();
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    res.json({ ...worker, createdAt: worker.createdAt.toISOString() });
  } catch (err) {
    if (err instanceof z.ZodError) res.status(400).json({ error: "Validation error", details: err.message });
    else { console.error(err); res.status(500).json({ error: "Internal server error" }); }
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
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
