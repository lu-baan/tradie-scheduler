-- Migration: Add job_workers join table for better data modeling
-- This replaces the text-based assigned_worker_ids column with a proper relational table
-- The old assigned_worker_ids column is kept for backward compatibility during transition

CREATE TABLE IF NOT EXISTS job_workers (
  job_id INTEGER NOT NULL,
  worker_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (job_id, worker_id),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

-- Index for efficient reverse lookups (find all jobs for a worker)
CREATE INDEX IF NOT EXISTS idx_job_workers_worker_id ON job_workers(worker_id);
CREATE INDEX IF NOT EXISTS idx_job_workers_job_id ON job_workers(job_id);

-- MIGRATION NOTE:
-- Old column: jobs.assigned_worker_ids (text) - contains JSON array like "[1, 2, 3]"
-- New table: job_workers - stores individual (job_id, worker_id) pairs
--
-- Backfill script (run after this migration):
-- INSERT INTO job_workers (job_id, worker_id)
-- SELECT 
--   j.id,
--   json_array_elements(j.assigned_worker_ids::json)::integer
-- FROM jobs j
-- WHERE j.assigned_worker_ids != '[]'
-- ON CONFLICT DO NOTHING;
--
-- Once backfill is complete and verified, drop the old column:
-- ALTER TABLE jobs DROP COLUMN assigned_worker_ids;
