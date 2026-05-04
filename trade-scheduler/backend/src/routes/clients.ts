import { Router, type IRouter, type Request, type Response } from "express";
import { db, jobsTable } from "../db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Whitelist of permitted sort values — rejects anything outside this set.
const VALID_SORTS = ["name_asc", "name_desc", "recent"] as const;
type SortOption = (typeof VALID_SORTS)[number];

// ── GET /api/clients ──────────────────────────────────────────────────────────
// Returns paginated list of unique clients aggregated from the jobs table.
// Auth: admin only.
// Query params:
//   search  – filters by name, phone, or address (ILIKE)
//   sort    – name_asc | name_desc | recent (default)
//   page    – 1-based page number (default 1)
//   limit   – rows per page, max 50 (default 20)

router.get("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const sort: SortOption = VALID_SORTS.includes(
      req.query.sort as SortOption
    )
      ? (req.query.sort as SortOption)
      : "recent";
    const page = Math.max(
      1,
      parseInt((req.query.page as string) || "1", 10) || 1
    );
    const limit = Math.min(
      50,
      Math.max(1, parseInt((req.query.limit as string) || "20", 10) || 20)
    );
    const offset = (page - 1) * limit;

    const whereClause = search
      ? sql`WHERE (
          client_name ILIKE ${"%" + search + "%"}
          OR COALESCE(client_phone, '') ILIKE ${"%" + search + "%"}
          OR address ILIKE ${"%" + search + "%"}
        )`
      : sql``;

    const orderClause =
      sort === "name_asc"
        ? sql`ORDER BY client_name ASC`
        : sort === "name_desc"
        ? sql`ORDER BY client_name DESC`
        : sql`ORDER BY MAX(created_at) DESC`;

    const { rows } = await db.execute<{
      client_name: string;
      client_phone: string | null;
      client_email: string | null;
      address: string;
      job_count: number;
      last_job_date: string;
      latest_job_id: number;
    }>(sql`
      SELECT
        client_name,
        client_phone,
        MAX(client_email)  AS client_email,
        MAX(address)       AS address,
        COUNT(*)::int      AS job_count,
        MAX(created_at)::text AS last_job_date,
        MAX(id)::int       AS latest_job_id
      FROM jobs
      ${whereClause}
      GROUP BY client_name, client_phone
      ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
    `);

    const { rows: countRows } = await db.execute<{ total: number }>(sql`
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT client_name, client_phone
        FROM jobs
        ${whereClause}
        GROUP BY client_name, client_phone
      ) sub
    `);
    const countRow = countRows[0];

    const total = countRow?.total ?? 0;

    res.json({
      clients: rows.map((r: any) => ({
        clientId:    r.latest_job_id,
        clientName:  r.client_name,
        clientPhone: r.client_phone,
        clientEmail: r.client_email,
        address:     r.address,
        jobCount:    r.job_count,
        lastJobDate: r.last_job_date,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[clients] list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/clients/:clientId ────────────────────────────────────────────────
// Returns a single client's profile plus their full job history.
// clientId = MAX(id) for that client's job group — opaque integer, not PII.
// Auth: admin only.

router.get("/:clientId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    if (isNaN(clientId)) {
      res.status(400).json({ error: "Invalid client ID" });
      return;
    }

    // Resolve the anchor job → get (clientName, clientPhone) for this group.
    const [anchor] = await db
      .select({
        clientName:  jobsTable.clientName,
        clientPhone: jobsTable.clientPhone,
      })
      .from(jobsTable)
      .where(eq(jobsTable.id, clientId))
      .limit(1);

    if (!anchor) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    const matchClause = anchor.clientPhone
      ? sql`client_name = ${anchor.clientName} AND client_phone = ${anchor.clientPhone}`
      : sql`client_name = ${anchor.clientName} AND client_phone IS NULL`;

    const { rows: summaryRows } = await db.execute<{
      client_email:   string | null;
      address:        string;
      job_count:      number;
      last_job_date:  string;
      first_job_date: string;
      total_revenue:  number;
    }>(sql`
      SELECT
        MAX(client_email)        AS client_email,
        MAX(address)             AS address,
        COUNT(*)::int            AS job_count,
        MAX(created_at)::text    AS last_job_date,
        MIN(created_at)::text    AS first_job_date,
        COALESCE(SUM(price), 0)::float8 AS total_revenue
      FROM jobs
      WHERE ${matchClause}
    `);
    const summary = summaryRows[0];

    const { rows: jobs } = await db.execute<{
      id:             number;
      title:          string;
      job_type:       string;
      status:         string;
      priority:       string;
      price:          number;
      scheduled_date: string | null;
      address:        string;
      trade_type:     string;
      created_at:     string;
    }>(sql`
      SELECT
        id, title, job_type, status, priority, price,
        scheduled_date, address, trade_type, created_at::text
      FROM jobs
      WHERE ${matchClause}
      ORDER BY created_at DESC
    `);

    res.json({
      clientId,
      clientName:   anchor.clientName,
      clientPhone:  anchor.clientPhone,
      clientEmail:  summary?.client_email  ?? null,
      address:      summary?.address       ?? "",
      jobCount:     summary?.job_count     ?? 0,
      lastJobDate:  summary?.last_job_date ?? null,
      firstJobDate: summary?.first_job_date ?? null,
      totalRevenue: summary?.total_revenue  ?? 0,
      jobs,
    });
  } catch (err) {
    console.error("[clients] profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
