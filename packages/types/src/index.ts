/**
 * Shared types & validation schemas for Watchtower.
 * Imported by web, mobile, and the watcher engine.
 */
import { z } from "zod";

export const APP_NAME = "Watchtower" as const;

/** Trivial health schema (used by the /api/health endpoint). */
export const HealthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
});
export type Health = z.infer<typeof HealthSchema>;

export * from "./weather";
export * from "./watch";
