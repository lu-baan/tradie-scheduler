import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "../db";
import { usersTable } from "../db/schema/users";
import { workersTable } from "../db/schema/workers";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "crypto";
import { promisify } from "util";

const router: IRouter = Router();
const scrypt = promisify(crypto.scrypt);

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

router.post("/register", async (req: Request, res: Response) => {
  try {
    const body = RegisterBody.parse(req.body);

    // Check if login number already exists
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

    // For worker accounts, create a worker record first so they appear in the Workers panel
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

router.post("/login", async (req: Request, res: Response) => {
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

    res.json({
      id: user.id,
      fullName: user.fullName,
      loginNumber: user.loginNumber,
      role: user.role,
      email: user.email,
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

// ── GET /api/auth/users (admin use — list all accounts) ──────────────────────

router.get("/users", async (_req: Request, res: Response) => {
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

export { verifyPassword };
export default router;
