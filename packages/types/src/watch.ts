import { z } from "zod";
import { WeatherWatchConfigSchema } from "./weather";

/** Every adapter registers a source key. Grows as domains are added. */
export const WatchSourceSchema = z.enum(["weather"]);
export type WatchSource = z.infer<typeof WatchSourceSchema>;

/**
 * Input to create a Watch. Discriminated by `source` so `config` is validated
 * against the right adapter's schema. Today only "weather"; when a second
 * adapter lands this becomes a `z.discriminatedUnion("source", [...])`.
 */
export const CreateWatchInputSchema = z.object({
  source: z.literal("weather"),
  label: z.string().min(1).max(80),
  config: WeatherWatchConfigSchema,
});
export type CreateWatchInput = z.infer<typeof CreateWatchInputSchema>;

/** A phone registering itself so it can receive pushes (Phase 1 identity). */
export const DeviceRegistrationSchema = z.object({
  expoPushToken: z.string().min(1),
  platform: z.enum(["ios", "android"]).optional(),
});
export type DeviceRegistration = z.infer<typeof DeviceRegistrationSchema>;
