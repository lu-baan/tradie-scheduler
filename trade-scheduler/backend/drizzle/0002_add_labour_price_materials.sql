-- Migration: add labourPrice, includeGst, materialsJson to jobs
-- These columns were already in the backend's local schema but missing from
-- @workspace/db (lib/db).  Now that both are unified, this migration brings
-- existing databases up to the canonical schema.
--
-- Run via:  pnpm --filter trade-scheduler-backend db:push
--           or apply this file manually with psql.

ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "labour_price" real,
  ADD COLUMN IF NOT EXISTS "include_gst" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "materials_json" text NOT NULL DEFAULT '[]';
