import { Router, type IRouter, type Request, type Response } from "express";
import { db, workersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { CreateWorkerBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const workers = await db.select().from(workersTable);
    res.json(workers.map(w => ({ ...w, createdAt: w.createdAt.toISOString() })));
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
    const [deleted] = await db.delete(workersTable).where(eq(workersTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Worker not found" }); return; }
    res.status(204).send();
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
