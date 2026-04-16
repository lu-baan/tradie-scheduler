import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../../lib/db/src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Exclude tables not managed by Drizzle (e.g. connect-pg-simple session store)
  tablesFilter: ["!session"],
});
