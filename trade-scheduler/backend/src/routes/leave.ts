import { Router, type IRouter, type Request, type Response } from "express";
import { db, leaveRequestsTable, workersTable } from "../db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";

const router: IRouter = Router();

const LeaveBody = z.object({
  workerId: z.number().int().positive(),
  leaveType: z.enum(["sick", "annual", "training", "personal", "other"]).default("annual"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
});

function serialize(r: typeof leaveRequestsTable.$inferSelect) {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

// ── GET /api/leave ────────────────────────────────────────────────────────────
// Admin: all requests. Worker: own requests only.

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.session.role === "admin") {
      const rows = await db.select().from(leaveRequestsTable).orderBy(leaveRequestsTable.createdAt);
      res.json(rows.map(serialize));
    } else {
      const workerId = req.session.workerId;
      if (!workerId) { res.json([]); return; }
      const rows = await db
        .select()
        .from(leaveRequestsTable)
        .where(eq(leaveRequestsTable.workerId, workerId));
      res.json(rows.map(serialize));
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/leave ───────────────────────────────────────────────────────────

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = LeaveBody.parse(req.body);

    // Workers can only submit leave for themselves
    if (req.session.role === "worker") {
      if (body.workerId !== req.session.workerId) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    // Verify worker exists
    const [worker] = await db.select({ id: workersTable.id }).from(workersTable).where(eq(workersTable.id, body.workerId));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }

    const [row] = await db.insert(leaveRequestsTable).values({
      workerId: body.workerId,
      leaveType: body.leaveType,
      startDate: body.startDate,
      endDate: body.endDate,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      reason: body.reason ?? null,
      status: "pending",
    }).returning();

    res.status(201).json(serialize(row));
  } catch (err) {
    if (err instanceof z.ZodError) res.status(400).json({ error: "Validation error", details: err.message });
    else { console.error(err); res.status(500).json({ error: "Internal server error" }); }
  }
});

// ── PATCH /api/leave/:id — admin approves/denies ──────────────────────────────

router.patch("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const { status, adminNote } = z.object({
      status: z.enum(["approved", "denied"]),
      adminNote: z.string().max(300).nullable().optional(),
    }).parse(req.body);

    const [row] = await db
      .update(leaveRequestsTable)
      .set({ status, adminNote: adminNote ?? null })
      .where(eq(leaveRequestsTable.id, id))
      .returning();

    if (!row) { res.status(404).json({ error: "Leave request not found" }); return; }
    res.json(serialize(row));
  } catch (err) {
    if (err instanceof z.ZodError) res.status(400).json({ error: "Validation error", details: err.message });
    else { console.error(err); res.status(500).json({ error: "Internal server error" }); }
  }
});

// ── DELETE /api/leave/:id — cancel a pending request ─────────────────────────

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [existing] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.status !== "pending") { res.status(400).json({ error: "Only pending requests can be cancelled" }); return; }
    if (req.session.role === "worker" && existing.workerId !== req.session.workerId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    await db.delete(leaveRequestsTable).where(eq(leaveRequestsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
