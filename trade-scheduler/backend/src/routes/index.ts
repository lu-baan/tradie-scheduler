import { Router, type IRouter, type Request, type Response } from "express";
import healthRouter from "./health";
import jobsRouter from "./jobs";
import workersRouter from "./workers";
import authRouter from "./auth";
import geoRouter from "./geo";
import { sendInvoiceEmail } from "../lib/email";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/jobs", jobsRouter);
router.use("/workers", workersRouter);
router.use("/auth", authRouter);
router.use("/geo", geoRouter);

router.get("/test-email", async (req: Request, res: Response) => {
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
