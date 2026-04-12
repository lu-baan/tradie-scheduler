import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workersTable } from "./workers";

export const leaveRequestsTable = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => workersTable.id, { onDelete: "cascade" }),
  leaveType: text("leave_type", {
    enum: ["sick", "annual", "training", "personal", "other"],
  }).notNull().default("annual"),
  startDate: text("start_date").notNull(),   // "YYYY-MM-DD"
  endDate: text("end_date").notNull(),        // "YYYY-MM-DD"
  // Optional partial-day times — if null the whole day is blocked
  startTime: text("start_time"),             // "HH:mm" 24-h
  endTime: text("end_time"),                 // "HH:mm" 24-h
  reason: text("reason"),
  status: text("status", {
    enum: ["pending", "approved", "denied"],
  }).notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLeaveRequestSchema = createInsertSchema(leaveRequestsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;
export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;
