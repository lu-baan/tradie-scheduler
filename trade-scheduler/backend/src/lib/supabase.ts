import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const IMAGES_BUCKET = "job-images";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use image uploads.");
  }
  _client = createClient(url, key);
  return _client;
}

/** Ensure the storage bucket accepts both images and PDFs. Called at startup. */
export async function ensureBucketAllowsPdfs(): Promise<void> {
  try {
    const sb = getSupabase();
    const { error } = await sb.storage.updateBucket(IMAGES_BUCKET, {
      allowedMimeTypes: ["image/*", "application/pdf"],
    });
    if (error) {
      console.warn("[storage] Could not update bucket MIME types:", error.message);
    } else {
      console.log("[storage] Bucket MIME types updated — images + PDFs allowed.");
    }
  } catch (err) {
    // Non-fatal: bucket may not exist yet or creds not configured
    console.warn("[storage] ensureBucketAllowsPdfs skipped:", err);
  }
}
