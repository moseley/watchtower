import webpush from "web-push";
import type { WebPushSubscription } from "@watchtower/types";
import type { PushMessage, PushResult } from "./expo";

export interface VapidConfig {
  subject: string; // "mailto:you@example.com" or the site URL
  publicKey: string;
  privateKey: string;
}

/**
 * Send a Web Push notification to browser subscriptions. Endpoints that the
 * push service reports as gone (404/410) are returned in `expiredEndpoints`
 * so the engine can prune them.
 */
export async function sendWebPush(
  subscriptions: WebPushSubscription[],
  message: PushMessage,
  vapid: VapidConfig,
): Promise<PushResult & { expiredEndpoints?: string[] }> {
  if (subscriptions.length === 0) {
    return { ok: false, errors: ["no web push subscriptions"] };
  }

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    data: message.data ?? {},
  });

  const errors: string[] = [];
  const expiredEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
          {
            vapidDetails: {
              subject: vapid.subject,
              publicKey: vapid.publicKey,
              privateKey: vapid.privateKey,
            },
          },
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.push(sub.endpoint); // subscription no longer valid
        } else {
          errors.push(`web push failed (${statusCode ?? "?"}): ${(err as Error).message}`);
        }
      }
    }),
  );

  return {
    ok: errors.length === 0,
    ...(errors.length > 0 ? { errors } : {}),
    ...(expiredEndpoints.length > 0 ? { expiredEndpoints } : {}),
  };
}
