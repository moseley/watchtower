import {
  WeatherWatchConfigSchema,
  type Location,
  type WeatherRule,
  type WeatherWatchConfig,
} from "@watchtower/types";
import type { AdapterContext, SourceAdapter, WatcherMatch } from "./types";

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

interface OpenMeteoHourly {
  time: string[];
  temperature_2m?: number[];
  precipitation_probability?: number[];
  wind_speed_10m?: number[];
}

interface OpenMeteoResponse {
  utc_offset_seconds?: number;
  hourly?: OpenMeteoHourly;
}

/**
 * Weather adapter backed by Open-Meteo (global, no API key, hourly forecast).
 * Evaluates personal-threshold rules over the next `withinHours` hours and
 * returns at most one match per rule (the first qualifying hour).
 */
export const weatherAdapter: SourceAdapter<WeatherWatchConfig> = {
  source: "weather",
  configSchema: WeatherWatchConfigSchema,
  async evaluate(config, ctx) {
    const { location, rule } = config;
    const res = await ctx.fetch(buildUrl(location, rule));
    if (!res.ok) {
      throw new Error(`Open-Meteo responded ${res.status}`);
    }
    const json = (await res.json()) as OpenMeteoResponse;
    const hourly = json.hourly;
    if (!hourly?.time) return [];
    const offset = json.utc_offset_seconds ?? 0;
    return evaluateRule(rule, hourly, ctx.now, offset, location);
  },
};

function buildUrl(location: Location, rule: WeatherRule): string {
  // Ask for enough days to cover the notice window. The +1 absorbs the offset
  // between "now" and midnight — a 24-hour window starting at 6pm still needs
  // to reach into the day after tomorrow. Open-Meteo serves 16 days.
  const days = Math.min(16, Math.ceil(rule.withinHours / 24) + 1);
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: "auto",
    forecast_days: String(days),
  });
  const hourly: string[] = [];
  if (rule.metric === "temperature") {
    hourly.push("temperature_2m");
    params.set("temperature_unit", rule.unit === "C" ? "celsius" : "fahrenheit");
  } else if (rule.metric === "precipitation_probability") {
    hourly.push("precipitation_probability");
  } else {
    hourly.push("wind_speed_10m");
    params.set("wind_speed_unit", rule.unit === "kmh" ? "kmh" : "mph");
  }
  params.set("hourly", hourly.join(","));
  return `${OPEN_METEO}?${params.toString()}`;
}

function seriesFor(rule: WeatherRule, hourly: OpenMeteoHourly): number[] | undefined {
  if (rule.metric === "temperature") return hourly.temperature_2m;
  if (rule.metric === "precipitation_probability") return hourly.precipitation_probability;
  return hourly.wind_speed_10m;
}

function meets(rule: WeatherRule, value: number): boolean {
  if (rule.metric === "temperature") {
    return rule.comparator === "below" ? value <= rule.threshold : value >= rule.threshold;
  }
  return value >= rule.threshold; // precipitation & wind rules are "above"
}

function evaluateRule(
  rule: WeatherRule,
  hourly: OpenMeteoHourly,
  now: Date,
  offsetSeconds: number,
  location: Location,
): WatcherMatch[] {
  const series = seriesFor(rule, hourly);
  if (!series) return [];

  const nowMs = now.getTime();
  const horizonMs = nowMs + rule.withinHours * 3_600_000;

  for (let i = 0; i < hourly.time.length; i++) {
    const localIso = hourly.time[i];
    const value = series[i];
    if (localIso == null || value == null) continue;

    // Open-Meteo times are local wall-clock (timezone=auto). Convert to a true
    // UTC instant using the reported offset so the window compares correctly.
    const utcMs = Date.parse(`${localIso}:00Z`) - offsetSeconds * 1000;
    if (Number.isNaN(utcMs) || utcMs < nowMs || utcMs > horizonMs) continue;

    if (meets(rule, value)) {
      return [buildMatch(rule, value, localIso, location, now, offsetSeconds)];
    }
  }
  return [];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatHour(localIso: string): string {
  const hour = Number(localIso.slice(11, 13));
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

/**
 * When the match is, in words. With notice now stretching to a week, "around
 * 11 AM" on its own would be genuinely ambiguous, so anything beyond today
 * carries its day.
 */
function formatWhen(localIso: string, now: Date, offsetSeconds: number): string {
  const time = formatHour(localIso);

  // Compare calendar days in the location's own timezone, not the server's.
  const localNow = new Date(now.getTime() + offsetSeconds * 1000);
  const todayStr = localNow.toISOString().slice(0, 10);
  const matchStr = localIso.slice(0, 10);
  if (matchStr === todayStr) return `around ${time}`;

  const dayDiff = Math.round(
    (Date.parse(`${matchStr}T12:00:00Z`) - Date.parse(`${todayStr}T12:00:00Z`)) / 86_400_000,
  );
  if (dayDiff === 1) return `tomorrow around ${time}`;
  if (dayDiff > 1 && dayDiff < 7) {
    const weekday = WEEKDAYS[new Date(`${matchStr}T12:00:00Z`).getUTCDay()];
    return `${weekday} around ${time}`;
  }
  return `on ${matchStr} around ${time}`;
}

function buildMatch(
  rule: WeatherRule,
  value: number,
  localIso: string,
  location: Location,
  now: Date,
  offsetSeconds: number,
): WatcherMatch {
  const label = location.label ?? "your location";
  const dateStr = localIso.slice(0, 10);
  const when = formatWhen(localIso, now, offsetSeconds);
  const rounded = Math.round(value);

  if (rule.metric === "temperature") {
    const emoji = rule.comparator === "below" ? "❄️" : "☀️";
    const dir = rule.comparator === "below" ? "below" : "above";
    return {
      dedupeKey: `temperature:${rule.comparator}:${rule.threshold}:${dateStr}`,
      title: `${emoji} Temperature alert — ${label}`,
      body: `${rounded}°${rule.unit} forecast ${when}, ${dir} your ${rule.threshold}°${rule.unit} threshold.`,
      data: { metric: "temperature", value, unit: rule.unit, when: localIso, location },
    };
  }

  if (rule.metric === "precipitation_probability") {
    return {
      dedupeKey: `precip:above:${rule.threshold}:${dateStr}`,
      title: `🌧️ Rain likely — ${label}`,
      body: `${rounded}% chance of precipitation ${when}, above your ${rule.threshold}% threshold.`,
      data: { metric: "precipitation_probability", value, when: localIso, location },
    };
  }

  return {
    dedupeKey: `wind:above:${rule.threshold}:${dateStr}`,
    title: `💨 Wind alert — ${label}`,
    body: `Winds near ${rounded} ${rule.unit} ${when}, above your ${rule.threshold} ${rule.unit} threshold.`,
    data: { metric: "wind_speed", value, unit: rule.unit, when: localIso, location },
  };
}
