import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import session from "express-session";
import router from "./routes";

// Silence unused-import warning — the augmentation must be imported somewhere.
import "./types/express-session.js";

const app: Express = express();

app.use(helmet());

// Comma-separated list of allowed frontend origins, e.g.
//   FRONTEND_ORIGIN=https://tradie-scheduler.vercel.app,http://localhost:5173
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin requests (no Origin header) and listed origins.
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production — refusing to start with an insecure fallback.");
  }
  console.warn(
    "[warn] SESSION_SECRET is not set — using insecure fallback. Set it in .env before deploying.",
  );
}

// NOTE: MemoryStore is not suitable for multi-instance deploys.
// Replace with connect-pg-simple or a Redis-backed store before scaling beyond one dyno.
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "change-me-in-dev-only",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // In production the API is proxied by Vercel on the same hostname, so
      // SameSite: lax is fine.  Secure requires HTTPS (Render provides it).
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

// Global rate-limit: 200 requests per 15 minutes per IP.
// Stricter limits are applied per-route below (e.g. auth).
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use("/api", router);

export default app;
