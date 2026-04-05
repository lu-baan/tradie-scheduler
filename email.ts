import { Router, type Request, type Response } from "express";

const router: IRouter = Router();

router.get("/test-email", async (req: Request, res: Response) => {
  // Securely fetch credentials from your server's environment variables
  const accountId = process.env.EMAIL_ACCOUNT_ID;
  const apiToken = process.env.EMAIL_API_TOKEN;

  if (!accountId) {
    return res.status(400).json({ ok: false, error: "accountId is missing, please provide a valid accountId." });
  }

  if (!apiToken) {
    return res.status(400).json({ ok: false, error: "API token is missing." });
  }

  try {
    // TODO: Add your 3rd party email sending logic here using accountId and apiToken
    res.json({ ok: true, message: "Email tested successfully!", accountId });
  } catch (error) {
    console.error("Email error:", error);
    res.status(500).json({ ok: false, error: "Failed to send test email." });
  }
});

export default router;