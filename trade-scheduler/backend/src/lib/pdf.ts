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
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(24).font("Helvetica-Bold").text("TAX INVOICE", { align: "right" });
    doc.fontSize(10).font("Helvetica").text(`Invoice #: ${data.invoiceNumber}`, { align: "right" });
    doc.text(`Date: ${new Date().toLocaleDateString("en-AU")}`, { align: "right" });

    doc.moveDown(2);

    // Client details
    doc.fontSize(12).font("Helvetica-Bold").text("Bill To:");
    doc.fontSize(11).font("Helvetica").text(data.clientName);
    doc.text(data.address);
    if (data.clientPhone) doc.text(`Phone: ${data.clientPhone}`);
    if (data.clientEmail) doc.text(`Email: ${data.clientEmail}`);

    doc.moveDown(1.5);

    // Job details
    doc.fontSize(12).font("Helvetica-Bold").text("Job Details:");
    doc.fontSize(11).font("Helvetica");
    doc.text(`Title: ${data.jobTitle}`);
    doc.text(`Trade Type: ${data.tradeType}`);
    doc.text(`Estimated Hours: ${data.estimatedHours}hrs`);
    if (data.scheduledDate) doc.text(`Scheduled: ${new Date(data.scheduledDate).toLocaleDateString("en-AU")}`);
    if (data.completedDate) doc.text(`Completed: ${new Date(data.completedDate).toLocaleDateString("en-AU")}`);
    if (data.assignedWorkers.length > 0) {
      doc.text(`Tradies: ${data.assignedWorkers.map(w => w.name).join(", ")}`);
    }
    if (data.notes) {
      doc.moveDown(0.5);
      doc.text(`Notes: ${data.notes}`);
    }

    doc.moveDown(1.5);

    // Pricing table
    doc.fontSize(12).font("Helvetica-Bold").text("Summary:");
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica");
    doc.text(`Subtotal:   $${data.price.toFixed(2)}`, { align: "right" });
    doc.text(`GST (10%):  $${data.gst.toFixed(2)}`, { align: "right" });
    doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
    doc.moveDown(0.5);
    doc.fontSize(13).font("Helvetica-Bold").text(`Total (inc. GST):   $${data.totalWithGst.toFixed(2)}`, { align: "right" });

    doc.moveDown(2);
    doc.fontSize(10).font("Helvetica").fillColor("grey")
      .text("Thank you for your business.", { align: "center" });

    doc.end();
  });
}