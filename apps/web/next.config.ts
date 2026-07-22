import type { NextConfig } from "next";
import path from "node:path";
import { config as loadEnv } from "dotenv";

// Local dev: load the monorepo-root .env so server code sees DATABASE_URL.
// On Vercel this file is absent and env vars are injected directly.
loadEnv({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript; Next must transpile them.
  transpilePackages: ["@watchtower/types", "@watchtower/core", "@watchtower/db"],
  // Keep the Prisma/pg stack as server-side externals (not bundled).
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "web-push"],
  // Pin the workspace root so Turbopack doesn't misinfer it in the monorepo.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
