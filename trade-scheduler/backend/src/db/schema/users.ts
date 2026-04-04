import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workersTable } from "./workers";

export const usersTable = pgTable("users", {
  id:           serial("id").primaryKey(),
  loginNumber:  text("login_number").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role:         text("role", { enum: ["admin", "worker"] }).notNull(),
  fullName:     text("full_name").notNull(),
  email:        text("email"),
  workerId:     integer("worker_id").references(() => workersTable.id),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
