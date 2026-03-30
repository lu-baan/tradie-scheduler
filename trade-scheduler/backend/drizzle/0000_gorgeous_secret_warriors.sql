CREATE TYPE "public"."job_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'bumped');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('quote', 'booking');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_type" "job_type" DEFAULT 'quote' NOT NULL,
	"validity_code" integer DEFAULT 2 NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"client_name" text NOT NULL,
	"client_phone" text,
	"client_email" text,
	"address" text NOT NULL,
	"latitude" real,
	"longitude" real,
	"price" real NOT NULL,
	"estimated_hours" real NOT NULL,
	"num_tradies" integer DEFAULT 1 NOT NULL,
	"call_up_time_hours" real,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"priority" "job_priority" DEFAULT 'medium' NOT NULL,
	"is_emergency" boolean DEFAULT false NOT NULL,
	"scheduled_date" text,
	"completed_date" text,
	"notes" text,
	"trade_type" text NOT NULL,
	"assigned_worker_ids" text DEFAULT '[]' NOT NULL,
	"customer_confirmed" boolean DEFAULT false NOT NULL,
	"invoice_number" text,
	"invoice_sent_at" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"trade_type" text NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
