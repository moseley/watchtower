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
 * Open-Meteo serves hourly data 16 days out, so this is the real ceiling
 * rather than an arbitrary one.
 */
export const MAX_NOTICE_HOURS = 16 * 24;

/**
 * How much notice to give: how far into the forecast to look for a match.
 *
 * Because polling is continuous, a shorter setting never misses a match, it
 * only reports it later — the window slides forward until the qualifying hour
 * falls inside it. So this is genuinely "warn me this far ahead", and the
 * useful value differs by metric: a few hours is enough to react to heat,
 * while rain is something you plan days around.
 */
export const NoticeHoursSchema = z.number().int().min(1).max(MAX_NOTICE_HOURS);

/**
 * A personal-threshold weather rule — the kind of alert phones don't send.
 * Discriminated by `metric` so each rule carries exactly its relevant fields.
 */
export const WeatherRuleSchema = z.discriminatedUnion("metric", [
  z.object({
    metric: z.literal("temperature"),
    comparator: ComparatorSchema,
    threshold: z.number(),
    unit: TemperatureUnitSchema.default("F"),
    withinHours: NoticeHoursSchema.default(4),
  }),
  z.object({
    metric: z.literal("precipitation_probability"),
    comparator: z.literal("above"),
    threshold: z.number().min(0).max(100),
    withinHours: NoticeHoursSchema.default(24),
  }),
  z.object({
    metric: z.literal("wind_speed"),
    comparator: z.literal("above"),
    threshold: z.number().min(0),
    unit: WindUnitSchema.default("mph"),
    withinHours: NoticeHoursSchema.default(12),
  }),
]);
export type WeatherRule = z.infer<typeof WeatherRuleSchema>;

/** Presets offered in the builder, per metric. */
export const NOTICE_OPTIONS: { hours: number; label: string }[] = [
  { hours: 1, label: "1 hour" },
  { hours: 4, label: "4 hours" },
  { hours: 12, label: "12 hours" },
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
];

/** Hour-scale conditions react fast; rain is planned around in days. */
export function noticeOptionsFor(metric: WeatherRule["metric"]) {
  return metric === "precipitation_probability"
    ? NOTICE_OPTIONS.filter((o) => o.hours >= 12)
    : NOTICE_OPTIONS.filter((o) => o.hours <= 24);
}

export function noticeLabel(hours: number): string {
  return NOTICE_OPTIONS.find((o) => o.hours === hours)?.label ?? `${hours} hours`;
}

/** The `config` blob stored on a weather Watch. */
export const WeatherWatchConfigSchema = z.object({
  location: LocationSchema,
  rule: WeatherRuleSchema,
});
export type WeatherWatchConfig = z.infer<typeof WeatherWatchConfigSchema>;
