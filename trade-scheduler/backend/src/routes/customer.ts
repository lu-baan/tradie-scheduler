import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { db, jobsTable } from "../db";
import { eq } from "drizzle-orm";
import { verifyConfirmToken } from "../lib/token";
import {
  sendCustomerConfirmedEmail,
  sendCustomerRescheduledEmail,
  sendAdminRescheduleNotification,
} from "../lib/email";

const router: IRouter = Router();

const confirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

function page(title: string, message: string, color: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="font-family:sans-serif;max-width:520px;margin:60px auto;padding:0 16px;color:#222">
  <div style="background:${color};padding:20px 24px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">${title}</h1>
  </div>
  <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none">
    <p style="margin:0;line-height:1.6">${message}</p>
    <p style="color:#999;font-size:13px;margin-top:32px">Trade Scheduler</p>
  </div>
</body>
</html>`;
}

// GET /api/customer/confirm?token=...&action=yes|no
router.get("/confirm", confirmLimiter, async (req: Request, res: Response) => {
  const { token, action } = req.query as { token?: string; action?: string };

  if (!token || !action) {
    res.status(400).send(page("Invalid Link", "This confirmation link is missing required information. Please contact us.", "#dc2626"));
    return;
  }

  const normalised = action.toLowerCase();
  if (normalised !== "yes" && normalised !== "no") {
    res.status(400).send(page(
      "Invalid Response",
      "Please use only <strong>YES</strong> or <strong>NO</strong>. Use the correct button from your confirmation email.",
      "#dc2626",
    ));
    return;
  }

  const parsed = verifyConfirmToken(token);
  if (!parsed) {
    res.status(400).send(page(
      "Link Expired or Invalid",
      "This confirmation link has expired or is invalid. Please contact us to reschedule.",
      "#6b7280",
    ));
    return;
  }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, parsed.jobId));
  if (!job) {
    res.status(404).send(page("Booking Not Found", "We could not find this booking. Please contact us.", "#dc2626"));
    return;
  }

  if (normalised === "yes") {
    // Idempotent: skip if already confirmed
    if (job.status === "confirmed") {
      res.send(page("Already Confirmed", `Your appointment for <strong>${job.title}</strong> is already confirmed. See you then!`, "#16a34a"));
      return;
    }

    await db.update(jobsTable).set({ status: "confirmed", updatedAt: new Date() }).where(eq(jobsTable.id, job.id));

    if (job.clientEmail) {
      sendCustomerConfirmedEmail({
        toEmail:       job.clientEmail,
        toName:        job.clientName,
        jobTitle:      job.title,
        scheduledDate: job.scheduledDate ?? null,
      }).catch(err => console.error("[customer/confirm] confirmed email failed:", err));
    }

    res.send(page(
      "Appointment Confirmed ✓",
      `Thank you, <strong>${job.clientName}</strong>! Your appointment for <strong>${job.title}</strong> is confirmed. We look forward to seeing you!`,
      "#16a34a",
    ));

  } else {
    // Idempotent: skip if already bumped
    if (job.status === "bumped") {
      res.send(page("Already Rescheduling", `We already have a reschedule request for <strong>${job.title}</strong>. Our team will be in touch.`, "#ea580c"));
      return;
    }

    await db.update(jobsTable).set({ status: "bumped", updatedAt: new Date() }).where(eq(jobsTable.id, job.id));

    sendAdminRescheduleNotification({
      clientName:    job.clientName,
      jobTitle:      job.title,
      scheduledDate: job.scheduledDate ?? null,
      jobId:         job.id,
    }).catch(err => console.error("[customer/confirm] admin notification failed:", err));

    if (job.clientEmail) {
      sendCustomerRescheduledEmail({
        toEmail:  job.clientEmail,
        toName:   job.clientName,
        jobTitle: job.title,
      }).catch(err => console.error("[customer/confirm] reschedule email failed:", err));
    }

    res.send(page(
      "Reschedule Requested",
      `No problem, <strong>${job.clientName}</strong>. We've noted that you'd like to reschedule <strong>${job.title}</strong>. Our team will contact you shortly with new available times.`,
      "#ea580c",
    ));
  }
});

export default router;
