ALTER TABLE "jobs" DROP COLUMN IF EXISTS "code_nine_queue";
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "booking_queue";
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "queue_number" integer;
