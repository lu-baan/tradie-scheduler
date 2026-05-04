import { Router, type IRouter, type Request, type Response } from "express";
import healthRouter from "./health";
import jobsRouter from "./jobs";
import workersRouter from "./workers";
import authRouter from "./auth";
import geoRouter from "./geo";
import leaveRouter from "./leave";
import twilioRouter from "./twilio";
import clientsRouter from "./clients";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { sendInvoiceEmail } from "../lib/email";
import { db, workersTable } from "../db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// Public routes - no auth required.
router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/twilio", twilioRouter);

// Worker self-profile - auth only (workers can read/update their own record).
router.get("/workers/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const wid = req.session.workerId;
    if (!wid) { res.status(404).json({ error: "No worker profile linked to this account" }); return; }
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, wid));
    if (!worker) { res.status(404).json({ error: "Worker not found" }); return; }
    res.json({
      ...worker,
      createdAt: worker.createdAt.toISOString(),
      unavailableUntil: worker.unavailableUntil ? worker.unavailableUntil.toISOString() : null,
      skills: (() => { try { return JSON.parse(worker.skillsJson || "[]"); } catch { return []; } })(),
    });
  } catch (err) {
    console.error("[workers/me]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Protected routes - valid session required.
router.use("/jobs", requireAuth, jobsRouter);
// Workers data is admin-only - the UI hides it from workers, and the API enforces it.
router.use("/workers", requireAdmin, workersRouter);
router.use("/geo", requireAuth, geoRouter);
router.use("/leave", leaveRouter);
router.use("/clients", clientsRouter);

// Admin-only test endpoint - should be removed before going fully public.
router.get("/test-email", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await sendInvoiceEmail({
      clientName: "Test Client",
      clientEmail: "vluu0012@student.monash.edu",
      jobTitle: "Test Job",
      invoiceNumber: "INV-TEST-001",
      totalWithGst: 110.00,
      pdfBuffer: Buffer.from("test pdf content"),
    });
    res.json({ ok: true, message: "Email sent - check Mailtrap inbox" });
  } catch (err: any) {
    console.error("Test email failed:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
