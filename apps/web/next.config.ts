import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript; Next must transpile them.
  transpilePackages: ["@watchtower/types", "@watchtower/core", "@watchtower/db"],
  // Pin the workspace root so Turbopack doesn't misinfer it in the monorepo.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
