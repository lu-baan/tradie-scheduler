import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host:   "smtp.gmail.com",
  port:   587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

const FROM_EMAIL = process.env.GMAIL_FROM_EMAIL ?? process.env.GMAIL_USER ?? "";
const FROM_NAME  = process.env.GMAIL_FROM_NAME  ?? "Trade Scheduler";
const FROM       = `"${FROM_NAME}" <${FROM_EMAIL}>`;

// ── Password reset ────────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(opts: {
  toEmail:   string;
  toName:    string;
  resetLink: string;
}): Promise<void> {
  await transporter.sendMail({
    from:    FROM,
    to:      `"${opts.toName}" <${opts.toEmail}>`,
    subject: "Reset your Trade Scheduler 2 password",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
        <div style="background:#ea580c;padding:20px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:1px">Password Reset</h1>
          <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px">Trade Scheduler 2</p>
        </div>
        <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none">
          <p>Hi <strong>${opts.toName}</strong>,</p>
          <p>You requested a password reset. Click the button below to set a new password:</p>
          <div style="text-align:center;margin:28px 0">
            <a href="${opts.resetLink}" style="background:#ea580c;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Reset Password</a>
          </div>
          <p style="font-size:13px;color:#666">Or copy this link:<br><a href="${opts.resetLink}" style="color:#ea580c;word-break:break-all">${opts.resetLink}</a></p>
          <p style="font-size:12px;color:#999;margin-top:20px">This link expires in <strong>1 hour</strong>. If you didn't request this, ignore this email.</p>
        </div>
      </div>
    `,
    text: `Hi ${opts.toName},\n\nReset your password: ${opts.resetLink}\n\nExpires in 1 hour.`,
  });
}

// ── Booking confirmation ──────────────────────────────────────────────────────

export async function sendBookingConfirmationEmail(opts: {
  toEmail:       string;
  toName:        string;
  jobTitle:      string;
  scheduledDate: string | null;
  workerNames:   string[];
  confirmToken:  string;
}): Promise<void> {
  const dateLine   = opts.scheduledDate
    ? new Date(opts.scheduledDate).toLocaleString("en-AU", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "To be confirmed";
  const tradieLine = opts.workerNames.length > 0 ? opts.workerNames.join(", ") : "To be assigned";
  const base       = (process.env.PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const yesUrl     = `${base}/api/customer/confirm?token=${opts.confirmToken}&action=yes`;
  const noUrl      = `${base}/api/customer/confirm?token=${opts.confirmToken}&action=no`;

  await transporter.sendMail({
    from:    FROM,
    to:      `"${opts.toName}" <${opts.toEmail}>`,
    subject: `Booking Scheduled — Please Confirm: ${opts.jobTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
        <div style="background:#ea580c;padding:20px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:1px">Appointment Scheduled</h1>
          <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px">${FROM_NAME}</p>
        </div>
        <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none">
          <p>Hi <strong>${opts.toName}</strong>,</p>
          <p>An appointment has been scheduled for you. Please confirm whether this time works for you.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#666;font-size:14px">Job</td><td style="padding:8px 0;font-weight:600;text-align:right">${opts.jobTitle}</td></tr>
            <tr style="border-top:1px solid #e5e5e5"><td style="padding:8px 0;color:#666;font-size:14px">Scheduled</td><td style="padding:8px 0;font-weight:600;text-align:right">${dateLine}</td></tr>
            <tr style="border-top:1px solid #e5e5e5"><td style="padding:8px 0;color:#666;font-size:14px">Tradie</td><td style="padding:8px 0;font-weight:600;text-align:right">${tradieLine}</td></tr>
            <tr style="border-top:1px solid #e5e5e5"><td style="padding:8px 0;color:#666;font-size:14px">Company</td><td style="padding:8px 0;font-weight:600;text-align:right">${FROM_NAME}</td></tr>
          </table>
          <p style="font-weight:600;margin-top:24px">Can you make this appointment?</p>
          <div style="text-align:center;margin:24px 0;display:flex;gap:16px;justify-content:center">
            <a href="${yesUrl}" style="background:#16a34a;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;margin-right:12px">✓ YES, confirm</a>
            <a href="${noUrl}"  style="background:#dc2626;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">✗ NO, reschedule</a>
          </div>
          <p style="font-size:12px;color:#999;text-align:center">Or copy these links into your browser:<br>
            YES: <a href="${yesUrl}" style="color:#16a34a;word-break:break-all">${yesUrl}</a><br>
            NO: <a href="${noUrl}" style="color:#dc2626;word-break:break-all">${noUrl}</a>
          </p>
          <p style="font-size:12px;color:#999;margin-top:16px">These links expire in 7 days.</p>
        </div>
      </div>
    `,
    text: `Hi ${opts.toName},\n\nAn appointment has been scheduled:\nJob: ${opts.jobTitle}\nScheduled: ${dateLine}\nTradie: ${tradieLine}\nCompany: ${FROM_NAME}\n\nCan you make this appointment?\n\nYES (confirm): ${yesUrl}\nNO (reschedule): ${noUrl}\n\nLinks expire in 7 days.\n\n${FROM_NAME}`,
  });
}

// ── Booking YES/NO follow-up emails ───────────────────────────────────────────

export async function sendCustomerConfirmedEmail(opts: {
  toEmail:       string;
  toName:        string;
  jobTitle:      string;
  scheduledDate: string | null;
}): Promise<void> {
  const dateLine = opts.scheduledDate
    ? new Date(opts.scheduledDate).toLocaleString("en-AU", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "To be confirmed";

  await transporter.sendMail({
    from:    FROM,
    to:      `"${opts.toName}" <${opts.toEmail}>`,
    subject: `Confirmed! We'll see you for ${opts.jobTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
        <div style="background:#16a34a;padding:20px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:1px">Appointment Confirmed ✓</h1>
          <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px">${FROM_NAME}</p>
        </div>
        <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none">
          <p>Hi <strong>${opts.toName}</strong>,</p>
          <p>Great! Your appointment is locked in. We look forward to seeing you.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#666;font-size:14px">Job</td><td style="padding:8px 0;font-weight:600;text-align:right">${opts.jobTitle}</td></tr>
            <tr style="border-top:1px solid #e5e5e5"><td style="padding:8px 0;color:#666;font-size:14px">Scheduled</td><td style="padding:8px 0;font-weight:600;text-align:right">${dateLine}</td></tr>
          </table>
          <p style="margin-top:24px">Regards,<br><strong>${FROM_NAME}</strong></p>
        </div>
      </div>
    `,
    text: `Hi ${opts.toName},\n\nGreat! Your appointment for "${opts.jobTitle}" is confirmed.\nScheduled: ${dateLine}\n\nWe look forward to seeing you!\n\n${FROM_NAME}`,
  });
}

export async function sendCustomerRescheduledEmail(opts: {
  toEmail:  string;
  toName:   string;
  jobTitle: string;
}): Promise<void> {
  await transporter.sendMail({
    from:    FROM,
    to:      `"${opts.toName}" <${opts.toEmail}>`,
    subject: `We'll reschedule your appointment — ${opts.jobTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
        <div style="background:#ea580c;padding:20px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:1px">Reschedule Requested</h1>
          <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px">${FROM_NAME}</p>
        </div>
        <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none">
          <p>Hi <strong>${opts.toName}</strong>,</p>
          <p>No problem — we've noted that you'd like to reschedule your appointment for <strong>${opts.jobTitle}</strong>.</p>
          <p>Our team will be in touch shortly to arrange a new time that works for you.</p>
          <p style="margin-top:24px">Regards,<br><strong>${FROM_NAME}</strong></p>
        </div>
      </div>
    `,
    text: `Hi ${opts.toName},\n\nNo problem — we'll reschedule your appointment for "${opts.jobTitle}".\nOur team will contact you with new available times shortly.\n\n${FROM_NAME}`,
  });
}

export async function sendAdminRescheduleNotification(opts: {
  clientName:    string;
  jobTitle:      string;
  scheduledDate: string | null;
  jobId:         number;
}): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL ?? process.env.GMAIL_USER ?? "";
  if (!adminEmail) return;

  const dateLine = opts.scheduledDate
    ? new Date(opts.scheduledDate).toLocaleString("en-AU", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "Not set";

  await transporter.sendMail({
    from:    FROM,
    to:      adminEmail,
    subject: `⚠ Reschedule Required — ${opts.jobTitle} (Job #${opts.jobId})`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
        <div style="background:#dc2626;padding:20px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:1px">Reschedule Required</h1>
          <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px">${FROM_NAME}</p>
        </div>
        <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none">
          <p>A customer has declined their appointment and requires rescheduling.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#666;font-size:14px">Job #</td><td style="padding:8px 0;font-weight:600;text-align:right">${opts.jobId}</td></tr>
            <tr style="border-top:1px solid #e5e5e5"><td style="padding:8px 0;color:#666;font-size:14px">Job</td><td style="padding:8px 0;font-weight:600;text-align:right">${opts.jobTitle}</td></tr>
            <tr style="border-top:1px solid #e5e5e5"><td style="padding:8px 0;color:#666;font-size:14px">Client</td><td style="padding:8px 0;font-weight:600;text-align:right">${opts.clientName}</td></tr>
            <tr style="border-top:1px solid #e5e5e5"><td style="padding:8px 0;color:#666;font-size:14px">Was scheduled</td><td style="padding:8px 0;font-weight:600;text-align:right">${dateLine}</td></tr>
          </table>
          <p>Please contact the client and propose a new time.</p>
        </div>
      </div>
    `,
    text: `Reschedule Required\n\nJob #${opts.jobId}: ${opts.jobTitle}\nClient: ${opts.clientName}\nWas scheduled: ${dateLine}\n\nPlease contact the client and propose a new time.`,
  });
}

// ── Invoice ───────────────────────────────────────────────────────────────────

interface InvoiceEmailData {
  clientName:    string;
  clientEmail:   string;
  jobTitle:      string;
  invoiceNumber: string;
  totalWithGst:  number;
  pdfBuffer:     Buffer;
}

export async function sendInvoiceEmail(data: InvoiceEmailData): Promise<void> {
  await transporter.sendMail({
    from:    FROM,
    to:      `"${data.clientName}" <${data.clientEmail}>`,
    subject: `Invoice ${data.invoiceNumber} — ${data.jobTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#222">
        <div style="background:#ea5c0c;padding:20px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px">TAX INVOICE</h1>
          <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px">${data.invoiceNumber}</p>
        </div>
        <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none">
          <p>Hi <strong>${data.clientName}</strong>,</p>
          <p>Thank you for your business! Please find your invoice attached.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px 0;color:#666;font-size:14px">Job</td><td style="padding:8px 0;font-weight:600;text-align:right">${data.jobTitle}</td></tr>
            <tr style="border-top:1px solid #e5e5e5"><td style="padding:8px 0;color:#666;font-size:14px">Invoice</td><td style="padding:8px 0;font-weight:600;text-align:right">${data.invoiceNumber}</td></tr>
            <tr style="border-top:1px solid #e5e5e5"><td style="padding:8px 0;color:#666;font-size:14px">Total (inc. GST)</td><td style="padding:8px 0;font-weight:700;font-size:18px;color:#ea5c0c;text-align:right">$${data.totalWithGst.toFixed(2)}</td></tr>
          </table>
          <p style="margin-top:24px">Regards,<br><strong>Trade Scheduler</strong></p>
        </div>
      </div>
    `,
    text: `Hi ${data.clientName},\n\nInvoice: ${data.invoiceNumber}\nJob: ${data.jobTitle}\nTotal: $${data.totalWithGst.toFixed(2)}`,
    attachments: [
      {
        filename:    `invoice-${data.invoiceNumber}.pdf`,
        content:     data.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
