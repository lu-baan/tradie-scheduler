// Single source of truth: all schema, db instance, and types come from @workspace/db.
// The local drizzle.config.ts points at lib/db/src/schema so migrations stay in sync.
export * from "@workspace/db";
