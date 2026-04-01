import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

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
    to: clientPhone,
  });
}