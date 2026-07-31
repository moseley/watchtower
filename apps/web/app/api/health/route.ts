import { prisma } from "@watchtower/db";
import { HealthSchema } from "@watchtower/types";

export const dynamic = "force-dynamic";

/** Polling runs every ~15 min, so three missed ticks means something is wrong. */
const STALE_AFTER_MINUTES = 45;

// A watcher that quietly stops watching is this product's worst failure, and it
// looks identical to "nothing matched" from the outside. Watch.lastCheckedAt is
// written on every poll, so it is the honest signal for whether the engine is
// actually alive.
export async function GET() {
  let lastPollAt: string | null = null;
  let minutesSinceLastPoll: number | null = null;

  try {
    const latest = await prisma.watch.aggregate({ _max: { lastCheckedAt: true } });
    const at = latest._max.lastCheckedAt;
    if (at) {
      lastPollAt = at.toISOString();
      minutesSinceLastPoll = Math.round((Date.now() - at.getTime()) / 60_000);
    }
  } catch {
    // Liveness must not depend on the database being reachable.
  }

  const body = HealthSchema.parse({
    ok: true,
    service: "watchtower-web",
    lastPollAt,
    minutesSinceLastPoll,
    pollStale: minutesSinceLastPoll === null ? null : minutesSinceLastPoll > STALE_AFTER_MINUTES,
  });
  return Response.json(body);
}
