import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("[warn] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — image uploads will fail.");
}

export const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

export const IMAGES_BUCKET = "job-images";
