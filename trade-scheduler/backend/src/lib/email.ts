interface InvoiceEmailData {
  clientName: string;
  clientEmail: string;
  jobTitle: string;
  invoiceNumber: string;
  totalWithGst: number;
  pdfBuffer: Buffer;
}

async function getMailtrapToken(): Promise<string> {
  return process.env.MAILTRAP_API_KEY!;
}

export async function sendInvoiceEmail(data: InvoiceEmailData): Promise<void> {
  const token = await getMailtrapToken();

  const pdfBase64 = data.pdfBuffer.toString("base64");

  const payload = {
    from: {
      email: process.env.MAILTRAP_FROM_EMAIL ?? "noreply@tradescheduler.com.au",
      name: process.env.MAILTRAP_FROM_NAME ?? "Trade Scheduler",
    },
    to: [{ email: data.clientEmail, name: data.clientName }],
    subject: `Invoice ${data.invoiceNumber} — ${data.jobTitle}`,
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
        content: pdfBase64,
        type: "application/pdf",
        disposition: "attachment",
      },
    ],
  };

  const res = await fetch("https://send.api.mailtrap.io/api/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mailtrap API error ${res.status}: ${body}`);
  }
}
