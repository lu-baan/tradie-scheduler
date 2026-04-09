import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, workersTable } from "../db";
import { eq, count } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "crypto";
import { promisify } from "util";
import rateLimit from "express-rate-limit";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";

const router: IRouter = Router();
const scrypt = promisify(crypto.scrypt);

// Stricter rate-limit for auth endpoints — 10 attempts per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts — try again later" },
});

// ── Password hashing ──────────────────────────────────────────────────────────

async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await scrypt(plain, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scrypt(plain, salt, 64)) as Buffer;
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), derived);
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const RegisterBody = z.object({
  fullName: z.string().min(2),
  loginNumber: z.string().length(6).regex(/^\d{6}$/),
  password: z.string().min(8),
  email: z.string().email().optional().nullable(),
  role: z.enum(["admin", "worker"]),
  tradeType: z.string().min(2).optional().nullable(),
  phone: z.string().optional().nullable(),
});

const LoginBody = z.object({
  loginNumber: z.string().length(6).regex(/^\d{6}$/),
  password: z.string().min(1),
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
// Requires an active admin session, UNLESS no admin account exists yet (bootstrap).

async function requireAdminOrBootstrap(req: Request, res: Response, next: Function) {
  // Allow if the caller is already an admin
  if (req.session.userId && req.session.role === "admin") {
    next();
    return;
  }
  // Allow if there are no admins in the database yet (first-time setup)
  const [{ adminCount }] = await db
    .select({ adminCount: count() })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));
  if (adminCount === 0) {
    next();
    return;
  }
  res.status(403).json({ error: "Admin account required to register new users" });
}

router.post("/register", authLimiter, requireAdminOrBootstrap, async (req: Request, res: Response) => {
  try {
    const body = RegisterBody.parse(req.body);

    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.loginNumber, body.loginNumber))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Login number already in use" });
      return;
    }

    const passwordHash = await hashPassword(body.password);

    let workerId: number | null = null;
    if (body.role === "worker") {
      const [worker] = await db
        .insert(workersTable)
        .values({
          name: body.fullName,
          email: body.email ?? null,
          phone: body.phone ?? null,
          tradeType: body.tradeType ?? "General",
          isAvailable: true,
        })
        .returning({ id: workersTable.id });
      workerId = worker.id;
    }

    const [user] = await db
      .insert(usersTable)
      .values({
        fullName: body.fullName,
        loginNumber: body.loginNumber,
        passwordHash,
        role: body.role,
        email: body.email ?? null,
        workerId,
      })
      .returning({
        id: usersTable.id,
        fullName: usersTable.fullName,
        loginNumber: usersTable.loginNumber,
        role: usersTable.role,
        email: usersTable.email,
        workerId: usersTable.workerId,
        createdAt: usersTable.createdAt,
      });

    res.status(201).json(user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: err.message });
    } else {
      console.error("[auth] register error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post("/login", authLimiter, async (req: Request, res: Response) => {
  try {
    const body = LoginBody.parse(req.body);

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.loginNumber, body.loginNumber))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "Invalid login number or password" });
      return;
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid login number or password" });
      return;
    }

    // Regenerate session ID before writing credentials to prevent session fixation.
    req.session.regenerate((err) => {
      if (err) {
        console.error("[auth] session regeneration error:", err);
        res.status(500).json({ error: "Internal server error" });
        return;
      }
      req.session.userId = user.id;
      req.session.role = user.role as "admin" | "worker";
      req.session.loginNumber = user.loginNumber;
      req.session.workerId = user.workerId ?? null;

      res.json({
        id: user.id,
        fullName: user.fullName,
        loginNumber: user.loginNumber,
        role: user.role,
        email: user.email,
        workerId: user.workerId ?? null,
      });
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: err.message });
    } else {
      console.error("[auth] login error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("[auth] logout error:", err);
      res.status(500).json({ error: "Logout failed" });
      return;
    }
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        loginNumber: usersTable.loginNumber,
        role: usersTable.role,
        email: usersTable.email,
        workerId: usersTable.workerId,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!))
      .limit(1);

    if (!user) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "Session user not found" });
      return;
    }

    res.json(user);
  } catch (err) {
    console.error("[auth] me error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/auth/users (admin only) ─────────────────────────────────────────

router.get("/users", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        loginNumber: usersTable.loginNumber,
        role: usersTable.role,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .orderBy(usersTable.createdAt);

    res.json(users);
  } catch (err) {
    console.error("[auth] list users error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/auth/profile ───────────────────────────────────────────────────

router.patch("/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const { loginNumber, email } = z
      .object({
        loginNumber: z.string().length(6),
        email: z.string().email().nullable().optional(),
      })
      .parse(req.body);

    // Users may only update their own profile; admins can update any.
    if (req.session.role !== "admin" && req.session.loginNumber !== loginNumber) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ email: email ?? null })
      .where(eq(usersTable.loginNumber, loginNumber))
      .returning({ id: usersTable.id, email: usersTable.email });

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ email: updated.email });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: err.message });
    } else {
      console.error("[auth] profile error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export { verifyPassword };
export default router;
