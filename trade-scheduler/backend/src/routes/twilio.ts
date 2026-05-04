import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

router.post("/message-status", (req: Request, res: Response) => {
  const {
    MessageSid,
    MessageStatus,
    SmsSid,
    To,
    From,
    ErrorCode,
    ErrorMessage,
  } = req.body ?? {};

  console.log("[twilio/message-status]", {
    messageSid: MessageSid ?? SmsSid ?? null,
    status: MessageStatus ?? null,
    to: To ?? null,
    from: From ?? null,
    errorCode: ErrorCode ?? null,
    errorMessage: ErrorMessage ?? null,
  });

  res.sendStatus(204);
});

export default router;
