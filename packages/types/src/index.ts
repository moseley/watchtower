/**
 * Shared types & validation schemas for Watchtower.
 *
 * The real domain models — Owner, Watch, WeatherRule, Notification — land in
 * Phase 1 alongside the Prisma schema. For now this package exists to prove the
 * shared layer is wired: both `web` and `mobile` (and the backend engine) import
 * from `@watchtower/types`.
 */
import { z } from "zod";

export const APP_NAME = "Watchtower" as const;

/** Trivial schema used only to confirm zod + cross-package imports resolve. */
export const HealthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
});

export type Health = z.infer<typeof HealthSchema>;
