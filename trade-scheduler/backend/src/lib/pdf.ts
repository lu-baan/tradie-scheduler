import PDFDocument from "pdfkit";

interface InvoiceData {
  invoiceNumber: string;
  jobTitle: string;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  address: string;
  tradeType: string;
  estimatedHours: number;
  price: number;
  gst: number;
  totalWithGst: number;
  scheduledDate?: string | null;
  completedDate?: string | null;
  notes?: string | null;
  assignedWorkers: { name: string }[];
}

export function generateInvoicePDF(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60, size: "A4" });
    const chunks: Buffer[] = [];
    const L = 60;   // left margin
    const R = 535;  // right margin
    const W = R - L;

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Header ────────────────────────────────────────────────────────────────
    doc.fontSize(28).font("Helvetica-Bold").fillColor("#ea580c")
      .text("TAX INVOICE", L, 60, { align: "right" });

    doc.fontSize(10).font("Helvetica").fillColor("#555555")
      .text(`Invoice #: ${data.invoiceNumber}`, { align: "right" })
      .text(`Date: ${new Date().toLocaleDateString("en-AU")}`, { align: "right" });

    // Divider under header
    doc.moveDown(1.5);
    doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(2).strokeColor("#ea580c").stroke();
    doc.moveDown(2);

    // ── Bill To ───────────────────────────────────────────────────────────────
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888")
      .text("BILL TO", L);
    doc.moveDown(0.4);
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#111111")
      .text(data.clientName, L);
    doc.fontSize(11).font("Helvetica").fillColor("#333333");
    doc.moveDown(0.3);
    doc.text(data.address, L);
    if (data.clientPhone) { doc.moveDown(0.3); doc.text(`Phone: ${data.clientPhone}`, L); }
    if (data.clientEmail) { doc.moveDown(0.3); doc.text(`Email: ${data.clientEmail}`, L); }

    doc.moveDown(2.5);

    // ── Job Details ───────────────────────────────────────────────────────────
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888")
      .text("JOB DETAILS", L);
    doc.moveDown(0.4);

    const detailRows: [string, string][] = [
      ["Job Title",        data.jobTitle],
      ["Trade Type",       data.tradeType],
      ["Estimated Hours",  `${data.estimatedHours} hrs`],
    ];
    if (data.scheduledDate)
      detailRows.push(["Scheduled", new Date(data.scheduledDate).toLocaleDateString("en-AU")]);
    if (data.completedDate)
      detailRows.push(["Completed", new Date(data.completedDate).toLocaleDateString("en-AU")]);
    if (data.assignedWorkers.length > 0)
      detailRows.push(["Tradies", data.assignedWorkers.map(w => w.name).join(", ")]);
    if (data.notes)
      detailRows.push(["Notes", data.notes]);

    for (const [label, value] of detailRows) {
      const y = doc.y;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#555555").text(label, L, y, { width: 140 });
      doc.fontSize(10).font("Helvetica").fillColor("#111111").text(value, L + 150, y, { width: W - 150 });
      doc.moveDown(0.6);
    }

    doc.moveDown(2);

    // ── Pricing ───────────────────────────────────────────────────────────────
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888888")
      .text("SUMMARY", L);
    doc.moveDown(0.8);

    // Subtotal row
    let y = doc.y;
    doc.fontSize(11).font("Helvetica").fillColor("#333333")
      .text("Subtotal", L, y)
      .text(`$${data.price.toFixed(2)}`, L, y, { align: "right" });
    doc.moveDown(0.8);

    // GST row
    y = doc.y;
    doc.text("GST (10%)", L, y)
      .text(`$${data.gst.toFixed(2)}`, L, y, { align: "right" });
    doc.moveDown(1.2);

    // Divider above total
    doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(1).strokeColor("#cccccc").stroke();
    doc.moveDown(1);

    // Total row
    y = doc.y;
    doc.fontSize(14).font("Helvetica-Bold").fillColor("#111111")
      .text("Total (inc. GST)", L, y)
      .text(`$${data.totalWithGst.toFixed(2)}`, L, y, { align: "right" });

    doc.moveDown(4);

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.moveTo(L, doc.y).lineTo(R, doc.y).lineWidth(1).strokeColor("#dddddd").stroke();
    doc.moveDown(1);
    doc.fontSize(10).font("Helvetica").fillColor("#888888")
      .text("Thank you for your business.", { align: "center" });

    doc.end();
  });
}
