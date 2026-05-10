import crypto from "crypto";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createConfirmToken(jobId: number): string {
  const issuedAt = Date.now();
  const payload  = `${jobId}:${issuedAt}`;
  const secret   = process.env.SESSION_SECRET ?? "dev-secret";
  const sig      = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyConfirmToken(token: string): { jobId: number } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts   = decoded.split(":");
    if (parts.length !== 3) return null;
    const [jobIdStr, issuedAtStr, sig] = parts;
    const payload  = `${jobIdStr}:${issuedAtStr}`;
    const secret   = process.env.SESSION_SECRET ?? "dev-secret";
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const sigBuf      = Buffer.from(sig,      "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    const issuedAt = parseInt(issuedAtStr, 10);
    if (isNaN(issuedAt) || Date.now() - issuedAt > TOKEN_TTL_MS) return null;
    const jobId = parseInt(jobIdStr, 10);
    if (isNaN(jobId)) return null;
    return { jobId };
  } catch {
    return null;
  }
}
