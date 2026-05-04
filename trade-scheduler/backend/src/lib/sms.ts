import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);
const publicApiBaseUrl = (process.env.PUBLIC_API_BASE_URL ?? "https://trade-scheduler-api.onrender.com").replace(/\/$/, "");
export const twilioDeliveryStatusCallbackUrl = `${publicApiBaseUrl}/api/twilio/message-status`;
const twilioMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim();

function toE164AU(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("61")) return `+${digits}`;
  if (digits.startsWith("0")) return `+61${digits.slice(1)}`;
  return `+${digits}`;
}

function validateE164(normalized: string, original: string): void {
  // E.164: + followed by 7-15 digits. AU mobile numbers are +614XXXXXXXX.
  if (!/^\+\d{7,15}$/.test(normalized)) {
    throw new Error(`SMS aborted: invalid phone number "${original}" -> "${normalized}"`);
  }
}

async function sendSmsMessage(to: string, body: string): Promise<void> {
  const request: {
    body: string;
    to: string;
    statusCallback: string;
    messagingServiceSid?: string;
    from?: string;
  } = {
    body,
    to,
    statusCallback: twilioDeliveryStatusCallbackUrl,
  };

  if (twilioMessagingServiceSid) {
    request.messagingServiceSid = twilioMessagingServiceSid;
  } else if (twilioPhoneNumber) {
    request.from = twilioPhoneNumber;
  } else {
    throw new Error("SMS aborted: configure TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER.");
  }

  await client.messages.create(request);
}

export async function sendJobCompletedSMS(
  clientName: string,
  clientPhone: string,
  jobTitle: string,
  invoiceNumber: string
): Promise<void> {
  const to = toE164AU(clientPhone);
  validateE164(to, clientPhone);
  const message = `Hi ${clientName}, your job "${jobTitle}" has been completed. Your invoice number is ${invoiceNumber}. Thank you for your business!`;
  await sendSmsMessage(to, message);
}

export async function sendBookingConfirmationSMS(
  clientName: string,
  clientPhone: string,
  jobTitle: string,
  scheduledDate: string | null
): Promise<void> {
  const to = toE164AU(clientPhone);
  validateE164(to, clientPhone);
  const dateStr = scheduledDate
    ? new Date(scheduledDate).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "a date to be confirmed";
  const message = `Hi ${clientName}, your booking for "${jobTitle}" has been confirmed for ${dateStr}. We'll be in touch with further details.`;
  await sendSmsMessage(to, message);
}

export async function sendBumpedSMS(
  clientName: string,
  clientPhone: string,
  jobTitle: string,
  scheduledDate: string | null
): Promise<void> {
  const to = toE164AU(clientPhone);
  validateE164(to, clientPhone);
  const dateStr = scheduledDate
    ? new Date(scheduledDate).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })
    : "your scheduled date";
  const message = `Hi ${clientName}, we're sorry to let you know your booking "${jobTitle}" on ${dateStr} has been rescheduled due to an emergency job. We'll contact you shortly to find a new time.`;
  await sendSmsMessage(to, message);
}
