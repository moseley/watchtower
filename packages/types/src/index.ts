/**
 * Shared types & validation schemas for Watchtower.
 * Imported by web, mobile, and the watcher engine.
 */
import { z } from "zod";

export const APP_NAME = "Watchtower" as const;

/**
 * Health of the service, plus whether the watcher engine is actually running.
 * `pollStale` is the one that matters: the engine going quiet is invisible
 * otherwise, since "no alerts" looks the same as "nothing matched".
 */
export const HealthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  lastPollAt: z.string().nullable().optional(),
  minutesSinceLastPoll: z.number().nullable().optional(),
  pollStale: z.boolean().nullable().optional(),
});
export type Health = z.infer<typeof HealthSchema>;

export * from "./weather";
export * from "./music";
export * from "./watch";
