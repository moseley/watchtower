import type { Prisma, PrismaClient } from "@watchtower/db";
import type { SourceAdapter, WatcherMatch } from "./adapters/types";
import type { DispatchResult, PushSender, PushTarget } from "./push/dispatcher";

export interface RunOptions {
  prisma: PrismaClient;
  /** Adapter registry keyed by source (e.g. { weather: weatherAdapter }). */
  adapters: Record<string, SourceAdapter<any>>;
  sendPush: PushSender;
  now?: Date;
  fetchImpl?: typeof fetch;
}

export interface RunSummary {
  watchesChecked: number;
  matches: number;
  notificationsSent: number;
  errors: string[];
}

/**
 * The watcher engine. For every enabled watch: pick its adapter, validate the
 * stored config, evaluate it, and for each new (non-duplicate) match send a
 * push and log a Notification. Source-agnostic — it only knows the adapter
 * interface, never the domain.
 */
export async function runWatches(opts: RunOptions): Promise<RunSummary> {
  const now = opts.now ?? new Date();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const summary: RunSummary = {
    watchesChecked: 0,
    matches: 0,
    notificationsSent: 0,
    errors: [],
  };

  const watches = await opts.prisma.watch.findMany({
    where: { enabled: true },
    include: { owner: { include: { devices: true } } },
  });

  for (const watch of watches) {
    const adapter = opts.adapters[watch.source];
    if (!adapter) {
      summary.errors.push(`no adapter for source "${watch.source}" (watch ${watch.id})`);
      continue;
    }

    const parsed = adapter.configSchema.safeParse(watch.config);
    if (!parsed.success) {
      summary.errors.push(`invalid config for watch ${watch.id}`);
      continue;
    }

    summary.watchesChecked++;
    let found: WatcherMatch[] = [];
    try {
      found = await adapter.evaluate(parsed.data, { now, fetch: fetchImpl });
    } catch (err) {
      summary.errors.push(`evaluate failed for watch ${watch.id}: ${(err as Error).message}`);
    }
    await opts.prisma.watch.update({
      where: { id: watch.id },
      data: { lastCheckedAt: now },
    });

    for (const match of found) {
      summary.matches++;
      const dedupeKey = `${watch.id}:${match.dedupeKey}`;

      const existing = await opts.prisma.notification.findUnique({ where: { dedupeKey } });
      if (existing) continue; // already alerted for this event

      const targets: PushTarget[] = watch.owner.devices.map((d) => ({
        kind: d.kind,
        expoPushToken: d.expoPushToken,
        webPushSubscription: d.webPushSubscription,
      }));
      let result: DispatchResult = { ok: false, errors: ["owner has no registered devices"] };
      if (targets.length > 0) {
        result = await opts.sendPush(targets, {
          title: match.title,
          body: match.body,
          data: match.data,
        });
      }

      // Prune browser subscriptions the push service reports as gone.
      if (result.expiredEndpoints?.length) {
        await opts.prisma.device.deleteMany({
          where: { webPushEndpoint: { in: result.expiredEndpoints } },
        });
      }

      await opts.prisma.notification.create({
        data: {
          watchId: watch.id,
          dedupeKey,
          title: match.title,
          body: match.body,
          status: result.ok ? "sent" : "failed",
          ...(match.data ? { payload: match.data as Prisma.InputJsonValue } : {}),
        },
      });

      if (result.ok) {
        summary.notificationsSent++;
      } else {
        summary.errors.push(
          `push failed for watch ${watch.id}: ${(result.errors ?? []).join("; ")}`,
        );
      }
      await opts.prisma.watch.update({
        where: { id: watch.id },
        data: { lastMatchedAt: now },
      });
    }
  }

  return summary;
}
