import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to the monorepo-root .env (pooled Neon connection).",
    );
  }
  // Pooled connection for runtime queries (serverless-friendly).
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// Reuse a single client across hot-reloads / warm serverless invocations.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Lazy proxy: importing this module does NOT construct the client, so a build
// that only collects route metadata never needs DATABASE_URL. The client is
// created on first real property access — at runtime, where the env var exists.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

// Re-export generated model types (Owner, Device, Watch, Notification, …)
export * from "@prisma/client";
