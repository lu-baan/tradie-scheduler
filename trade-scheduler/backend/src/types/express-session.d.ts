import "express-session";

declare module "express-session" {
  interface SessionData {
    userId: number;
    role: "admin" | "worker";
    loginNumber: string;
    workerId: number | null;
  }
}
