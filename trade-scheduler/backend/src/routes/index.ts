import { Router, type IRouter, type Request, type Response } from "express";
import healthRouter from "./health";
import jobsRouter from "./jobs";
import workersRouter from "./workers";
import authRouter from "./auth";
import geoRouter from "./geo";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { sendInvoiceEmail } from "../lib/email";

const router: IRouter = Router();

// Public routes — no auth required.
router.use(healthRouter);
router.use("/auth", authRouter);

// Protected routes — valid session required.
router.use("/jobs", requireAuth, jobsRouter);
// Workers data is admin-only — the UI hides it from workers, and the API enforces it.
router.use("/workers", requireAdmin, workersRouter);
router.use("/geo", requireAuth, geoRouter);

// Admin-only test endpoint — should be removed before going fully public.
router.get("/test-email", requireAdmin, async (req: Request, res: Response) => {
  try {
    await sendInvoiceEmail({
      clientName: "Test Client",
      clientEmail: "vluu0012@student.monash.edu",
      jobTitle: "Test Job",
      invoiceNumber: "INV-TEST-001",
      totalWithGst: 110.00,
      pdfBuffer: Buffer.from("test pdf content"),
    });
    res.json({ ok: true, message: "Email sent — check Mailtrap inbox" });
  } catch (err: any) {
    console.error("Test email failed:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
