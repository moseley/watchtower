import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Secrets live in the monorepo-root .env, not in this package.
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // The CLI (migrations, introspection) uses the unpooled/direct URL.
    // The runtime client uses the pooled DATABASE_URL — see src/index.ts.
    // Name matches Vercel's injected DATABASE_URL_UNPOOLED.
    url: process.env["DATABASE_URL_UNPOOLED"],
  },
});
