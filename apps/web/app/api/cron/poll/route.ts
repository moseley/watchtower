import { createPushSender, defaultAdapters, runWatches } from "@watchtower/core";
import { prisma } from "@watchtower/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs the watcher engine over every enabled watch. Triggered by the external
// cron service (GET) on a schedule, or manually (POST) during development.
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — allow (local dev)
  const auth = request.headers.get("authorization");
  const qs = new URL(request.url).searchParams.get("secret");
  return auth === `Bearer ${secret}` || qs === secret;
}

function vapidFromEnv() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return undefined;
  return {
    subject: process.env.VAPID_SUBJECT ?? "https://watchtower-web-nu.vercel.app",
    publicKey,
    privateKey,
  };
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await runWatches({
    prisma,
    adapters: defaultAdapters,
    sendPush: createPushSender({ vapid: vapidFromEnv() }),
  });
  return Response.json({ ok: true, summary });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
