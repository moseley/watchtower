import { WebPushSubscriptionSchema } from "@watchtower/types";
import { sendExpoPush, type PushMessage, type PushResult } from "./expo";
import { sendWebPush, type VapidConfig } from "./webpush";

/** A push destination, mirroring a Device row. */
export interface PushTarget {
  kind: string; // "expo" | "webpush"
  expoPushToken?: string | null;
  webPushSubscription?: unknown; // JSON column; validated before sending
}

export type DispatchResult = PushResult & { expiredEndpoints?: string[] };

export type PushSender = (targets: PushTarget[], message: PushMessage) => Promise<DispatchResult>;

/**
 * Build a sender that fans a message out to every target, choosing the right
 * channel per device kind. Notification channels are pluggable the same way
 * source adapters are.
 */
export function createPushSender(options: { vapid?: VapidConfig }): PushSender {
  return async (targets, message) => {
    const expoTokens = targets
      .filter((t) => t.kind === "expo" && t.expoPushToken)
      .map((t) => t.expoPushToken as string);

    const webSubs = targets
      .filter((t) => t.kind === "webpush")
      .map((t) => WebPushSubscriptionSchema.safeParse(t.webPushSubscription))
      .filter((r) => r.success)
      .map((r) => r.data);

    if (expoTokens.length === 0 && webSubs.length === 0) {
      return { ok: false, errors: ["no valid push targets"] };
    }

    const errors: string[] = [];
    const expiredEndpoints: string[] = [];
    let anySent = false;

    if (expoTokens.length > 0) {
      const result = await sendExpoPush(expoTokens, message);
      if (result.ok) anySent = true;
      else errors.push(...(result.errors ?? ["expo push failed"]));
    }

    if (webSubs.length > 0) {
      if (!options.vapid) {
        errors.push("web push not configured (missing VAPID keys)");
      } else {
        const result = await sendWebPush(webSubs, message, options.vapid);
        if (result.ok) anySent = true;
        else errors.push(...(result.errors ?? ["web push failed"]));
        if (result.expiredEndpoints) expiredEndpoints.push(...result.expiredEndpoints);
      }
    }

    return {
      // ok when at least one channel delivered; per-channel errors still surface
      ok: anySent && errors.length === 0,
      ...(errors.length > 0 ? { errors } : {}),
      ...(expiredEndpoints.length > 0 ? { expiredEndpoints } : {}),
    };
  };
}
