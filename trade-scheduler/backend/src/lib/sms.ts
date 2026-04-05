import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

function toE164AU(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("61")) return `+${digits}`;
  if (digits.startsWith("0")) return `+61${digits.slice(1)}`;
  return `+${digits}`;
}

export async function sendJobCompletedSMS(
  clientName: string,
  clientPhone: string,
  jobTitle: string,
  invoiceNumber: string
): Promise<void> {
  const message = `Hi ${clientName}, your job "${jobTitle}" has been completed. Your invoice number is ${invoiceNumber}. Thank you for your business!`;

  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: toE164AU(clientPhone),
  });
}

export async function sendBookingConfirmationSMS(
  clientName: string,
  clientPhone: string,
  jobTitle: string,
  scheduledDate: string | null
): Promise<void> {
  const dateStr = scheduledDate
    ? new Date(scheduledDate).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "a date to be confirmed";
  const message = `Hi ${clientName}, your booking for "${jobTitle}" has been confirmed for ${dateStr}. We'll be in touch with further details.`;

  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: toE164AU(clientPhone),
  });
}

export async function sendBumpedSMS(
  clientName: string,
  clientPhone: string,
  jobTitle: string,
  scheduledDate: string | null
): Promise<void> {
  const dateStr = scheduledDate
    ? new Date(scheduledDate).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })
    : "your scheduled date";
  const message = `Hi ${clientName}, we're sorry to let you know your booking "${jobTitle}" on ${dateStr} has been rescheduled due to an emergency job. We'll contact you shortly to find a new time.`;

  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: toE164AU(clientPhone),
  });
}