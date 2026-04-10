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
