// Sends via Mailtrap sandbox HTTP API (no SMTP, no accountId required).
// Set MAILTRAP_INBOX_ID for sandbox testing; omit it to use production sending.

const FROM_EMAIL = process.env.MAILTRAP_FROM_EMAIL ?? "noreply@demomailtrap.co";
const FROM_NAME  = process.env.MAILTRAP_FROM_NAME  ?? "Trade Scheduler";

async function sendViaSandbox(payload: object): Promise<void> {
  const token   = process.env.MAILTRAP_TOKEN;
  const inboxId = process.env.MAILTRAP_INBOX_ID;
  if (!token)   throw new Error("MAILTRAP_TOKEN is not set");
  if (!inboxId) throw new Error("MAILTRAP_INBOX_ID is not set");

  const res = await fetch(`https://sandbox.api.mailtrap.io/api/send/${inboxId}`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mailtrap sandbox error ${res.status}: ${body}`);
  }
}

// ── Password reset ────────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(opts: {
  toEmail:   string;
  toName:    string;
  resetLink: string;
}): Promise<void> {
  await sendViaSandbox({
    from:    { email: FROM_EMAIL, name: FROM_NAME },
    to:      [{ email: opts.toEmail, name: opts.toName }],
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
  await sendViaSandbox({
    from:    { email: FROM_EMAIL, name: FROM_NAME },
    to:      [{ email: data.clientEmail, name: data.clientName }],
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
        content:     data.pdfBuffer.toString("base64"),
        type:        "application/pdf",
        disposition: "attachment",
      },
    ],
  });
}
