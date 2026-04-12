import { pgTable, serial, text, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workersTable = pgTable("workers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  tradeType: text("trade_type").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  unavailableUntil: timestamp("unavailable_until"),
  // Skills/certifications: JSON array of strings e.g. ["EWP Licence","White Card","Confined Space"]
  skillsJson: text("skills_json").notNull().default("[]"),
  // Hourly pay rate for job costing
  hourlyRate: real("hourly_rate"),
  // Max hours per week before overtime kicks in (default 38 hrs for AU full-time)
  maxWeeklyHours: real("max_weekly_hours").default(38),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWorkerSchema = createInsertSchema(workersTable).omit({ id: true, createdAt: true });
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workersTable.$inferSelect;
