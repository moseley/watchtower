import { z } from "zod";
import { MusicWatchConfigSchema } from "./music";
import { WeatherWatchConfigSchema } from "./weather";

/** Every adapter registers a source key. Grows as domains are added. */
export const WatchSourceSchema = z.enum(["weather", "music"]);
export type WatchSource = z.infer<typeof WatchSourceSchema>;

/**
 * Input to create a Watch, discriminated by `source` so `config` is validated
 * against the right adapter's schema.
 */
export const CreateWatchInputSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("weather"),
    label: z.string().min(1).max(80),
    config: WeatherWatchConfigSchema,
  }),
  z.object({
    source: z.literal("music"),
    label: z.string().min(1).max(80),
    config: MusicWatchConfigSchema,
  }),
]);
export type CreateWatchInput = z.infer<typeof CreateWatchInputSchema>;

/** How many watches one owner may keep per source (absent = unlimited). */
export const WATCH_LIMITS: Partial<Record<WatchSource, number>> = {
  music: 5,
};

/** A browser's Web Push subscription (PushSubscription.toJSON()). */
export const WebPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type WebPushSubscription = z.infer<typeof WebPushSubscriptionSchema>;

/**
 * A device registering itself so it can receive pushes (Phase 1 identity):
 * either a phone with an Expo push token, or a browser with a Web Push
 * subscription.
 */
export const DeviceRegistrationSchema = z.union([
  z.object({
    expoPushToken: z.string().min(1),
    platform: z.enum(["ios", "android"]).optional(),
  }),
  z.object({
    webPushSubscription: WebPushSubscriptionSchema,
  }),
]);
export type DeviceRegistration = z.infer<typeof DeviceRegistrationSchema>;
