import { z } from "zod";

/** A point on Earth plus an optional human label ("Home", "Cabin"). */
export const LocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  label: z.string().min(1).max(80).optional(),
});
export type Location = z.infer<typeof LocationSchema>;

export const TemperatureUnitSchema = z.enum(["F", "C"]);
export type TemperatureUnit = z.infer<typeof TemperatureUnitSchema>;

export const WindUnitSchema = z.enum(["mph", "kmh"]);
export type WindUnit = z.infer<typeof WindUnitSchema>;

export const ComparatorSchema = z.enum(["below", "above"]);
export type Comparator = z.infer<typeof ComparatorSchema>;

/**
 * A personal-threshold weather rule — the kind of alert phones don't send.
 * Discriminated by `metric` so each rule carries exactly its relevant fields.
 * `withinHours` bounds how far into the forecast we look.
 */
export const WeatherRuleSchema = z.discriminatedUnion("metric", [
  z.object({
    metric: z.literal("temperature"),
    comparator: ComparatorSchema,
    threshold: z.number(),
    unit: TemperatureUnitSchema.default("F"),
    withinHours: z.number().int().min(1).max(48).default(12),
  }),
  z.object({
    metric: z.literal("precipitation_probability"),
    comparator: z.literal("above"),
    threshold: z.number().min(0).max(100),
    withinHours: z.number().int().min(1).max(48).default(6),
  }),
  z.object({
    metric: z.literal("wind_speed"),
    comparator: z.literal("above"),
    threshold: z.number().min(0),
    unit: WindUnitSchema.default("mph"),
    withinHours: z.number().int().min(1).max(48).default(12),
  }),
]);
export type WeatherRule = z.infer<typeof WeatherRuleSchema>;

/** The `config` blob stored on a weather Watch. */
export const WeatherWatchConfigSchema = z.object({
  location: LocationSchema,
  rule: WeatherRuleSchema,
});
export type WeatherWatchConfig = z.infer<typeof WeatherWatchConfigSchema>;
