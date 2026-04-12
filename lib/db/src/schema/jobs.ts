import { pgTable, serial, text, real, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobStatusEnum = pgEnum("job_status", ["pending", "confirmed", "in_progress", "completed", "cancelled", "bumped"]);
export const jobPriorityEnum = pgEnum("job_priority", ["low", "medium", "high", "urgent"]);
export const jobTypeEnum = pgEnum("job_type", ["quote", "booking"]);

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  jobType: jobTypeEnum("job_type").notNull().default("quote"),
  validityCode: integer("validity_code").notNull().default(2),
  title: text("title").notNull(),
  description: text("description"),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone"),
  clientEmail: text("client_email"),
  address: text("address").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  price: real("price").notNull(),
  estimatedHours: real("estimated_hours").notNull(),
  numTradies: integer("num_tradies").notNull().default(1),
  callUpTimeHours: real("call_up_time_hours"),
  status: jobStatusEnum("status").notNull().default("pending"),
  priority: jobPriorityEnum("priority").notNull().default("medium"),
  isEmergency: boolean("is_emergency").notNull().default(false),
  scheduledDate: text("scheduled_date"),
  completedDate: text("completed_date"),
  notes: text("notes"),
  tradeType: text("trade_type").notNull(),
  assignedWorkerIds: text("assigned_worker_ids").notNull().default("[]"),
  customerConfirmed: boolean("customer_confirmed").notNull().default(false),
  invoiceNumber: text("invoice_number"),
  invoiceSentAt: text("invoice_sent_at"),
  labourPrice: real("labour_price"),
  includeGst: boolean("include_gst").notNull().default(true),
  materialsJson: text("materials_json").notNull().default("[]"),
  imageUrls: text("image_urls").notNull().default("[]"),
  requiredSkillsJson: text("required_skills_json").notNull().default("[]"),
  attendanceJson: text("attendance_json").notNull().default("[]"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
