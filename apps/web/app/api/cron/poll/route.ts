import { defaultAdapters, runWatches, sendExpoPush } from "@watchtower/core";
import { prisma } from "@watchtower/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs the watcher engine over every enabled watch. Triggered by Vercel Cron
// (GET) on a schedule, or manually (POST) during development.
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — allow (local dev)
  const auth = request.headers.get("authorization");
  const qs = new URL(request.url).searchParams.get("secret");
  return auth === `Bearer ${secret}` || qs === secret;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await runWatches({
    prisma,
    adapters: defaultAdapters,
    sendPush: sendExpoPush,
  });
  return Response.json({ ok: true, summary });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
