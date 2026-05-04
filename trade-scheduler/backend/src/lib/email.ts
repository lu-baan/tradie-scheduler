import { MailtrapClient, type Mail } from "mailtrap";

const DEFAULT_FROM_EMAIL = "noreply@tradescheduler.com.au";
const DEFAULT_FROM_NAME = "Trade Scheduler";

let mailtrapClient: MailtrapClient | null = null;

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value.toLowerCase() === "true";
}

function getMailtrapClient(): MailtrapClient {
  if (mailtrapClient) return mailtrapClient;

  const token = process.env.MAILTRAP_TOKEN ?? process.env.MAILTRAP_API_KEY;
  if (!token) {
    throw new Error("Missing Mailtrap API token. Set MAILTRAP_TOKEN or MAILTRAP_API_KEY.");
  }

  const inboxIdRaw = process.env.MAILTRAP_INBOX_ID;
  const testInboxId = inboxIdRaw ? Number(inboxIdRaw) : undefined;
  if (inboxIdRaw && Number.isNaN(testInboxId)) {
    throw new Error("MAILTRAP_INBOX_ID must be a number.");
  }

  const sandboxFlag = parseBoolean(process.env.MAILTRAP_USE_SANDBOX);
  const sandbox = sandboxFlag ?? testInboxId !== undefined;
  if (sandbox && testInboxId === undefined) {
    throw new Error("MAILTRAP_INBOX_ID is required when Mailtrap sandbox mode is enabled.");
  }

  // Reuse a single API client so each send does not rebuild transport state.
  mailtrapClient = new MailtrapClient({
    token,
    sandbox,
    testInboxId,
  });

  return mailtrapClient;
}

function getFromAddress() {
  return {
    email: process.env.MAILTRAP_FROM_EMAIL ?? DEFAULT_FROM_EMAIL,
    name: process.env.MAILTRAP_FROM_NAME ?? DEFAULT_FROM_NAME,
  };
}

async function sendMail(mail: Mail): Promise<void> {
  await getMailtrapClient().send(mail);
}

export async function sendPasswordResetEmail(opts: {
  toEmail: string;
  toName: string;
  resetLink: string;
}): Promise<void> {
  await sendMail({
    from: getFromAddress(),
    to: [{ email: opts.toEmail, name: opts.toName }],
    subject: "Reset your Trade Scheduler 2 password",
    text: `Hi ${opts.toName},\n\nYou requested a password reset. Click the link below to set a new password:\n\n${opts.resetLink}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.\n\nRegards,\nTrade Scheduler`,
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
          <p style="font-size:13px;color:#666">Or copy this link into your browser:<br><a href="${opts.resetLink}" style="color:#ea580c;word-break:break-all">${opts.resetLink}</a></p>
          <p style="font-size:12px;color:#999;margin-top:20px">This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  });
}

interface InvoiceEmailData {
  clientName: string;
  clientEmail: string;
  jobTitle: string;
  invoiceNumber: string;
  totalWithGst: number;
  pdfBuffer: Buffer;
}

export async function sendInvoiceEmail(data: InvoiceEmailData): Promise<void> {
  await sendMail({
    from: getFromAddress(),
    to: [{ email: data.clientEmail, name: data.clientName }],
    subject: `Invoice ${data.invoiceNumber} - ${data.jobTitle}`,
    text: `Hi ${data.clientName},\n\nThank you for your business! Please find your invoice attached.\n\nInvoice: ${data.invoiceNumber}\nJob: ${data.jobTitle}\nTotal (inc. GST): $${data.totalWithGst.toFixed(2)}\n\nRegards,\nTrade Scheduler`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#222">
        <div style="background:#ea5c0c;padding:20px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px">TAX INVOICE</h1>
          <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px">${data.invoiceNumber}</p>
        </div>
        <div style="background:#f9f9f9;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none">
          <p>Hi <strong>${data.clientName}</strong>,</p>
          <p>Thank you for your business! Please find your invoice attached for the following job:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr>
              <td style="padding:8px 0;color:#666;font-size:14px">Job</td>
              <td style="padding:8px 0;font-weight:600;text-align:right">${data.jobTitle}</td>
            </tr>
            <tr style="border-top:1px solid #e5e5e5">
              <td style="padding:8px 0;color:#666;font-size:14px">Invoice Number</td>
              <td style="padding:8px 0;font-weight:600;text-align:right">${data.invoiceNumber}</td>
            </tr>
            <tr style="border-top:1px solid #e5e5e5">
              <td style="padding:8px 0;color:#666;font-size:14px">Total (inc. GST)</td>
              <td style="padding:8px 0;font-weight:700;font-size:18px;color:#ea5c0c;text-align:right">$${data.totalWithGst.toFixed(2)}</td>
            </tr>
          </table>
          <p style="font-size:13px;color:#666">If you have any questions about this invoice, please don't hesitate to get in touch.</p>
          <p style="margin-top:24px">Regards,<br><strong>Trade Scheduler</strong></p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: `invoice-${data.invoiceNumber}.pdf`,
        content: data.pdfBuffer,
        type: "application/pdf",
      },
    ],
  });
}
