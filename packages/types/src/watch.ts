import { z } from "zod";
import { MusicWatchConfigSchema } from "./music";
import { ScreenWatchConfigSchema } from "./screen";
import { WeatherWatchConfigSchema } from "./weather";

/** Every adapter registers a source key. Grows as domains are added. */
export const WatchSourceSchema = z.enum(["weather", "music", "screen"]);
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
  z.object({
    source: z.literal("screen"),
    label: z.string().min(1).max(80),
    config: ScreenWatchConfigSchema,
  }),
]);
/**
 * Deliberately `z.input`, not `z.infer`: fields carrying a Zod default — and
 * snapshots the server fills in, like knownCredits — are optional for whoever
 * is building the request. `z.infer` describes the parsed result instead, and
 * would demand values a client has no way to supply.
 */
export type CreateWatchInput = z.input<typeof CreateWatchInputSchema>;

/** How many watches one owner may keep per source (absent = unlimited). */
export const WATCH_LIMITS: Partial<Record<WatchSource, number>> = {
  music: 5,
  screen: 5,
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
    /**
     * Attach this device to an existing owner. Sent when the app already has an
     * identity — someone who declined notifications, used the app, then enabled
     * them later — so their watches don't end up stranded under a new owner.
     */
    ownerId: z.string().optional(),
  }),
  z.object({
    webPushSubscription: WebPushSubscriptionSchema,
    ownerId: z.string().optional(),
  }),
]);
export type DeviceRegistration = z.infer<typeof DeviceRegistrationSchema>;
