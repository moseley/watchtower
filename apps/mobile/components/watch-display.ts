import type { WatchRow } from "../lib/api";

const DAY_MS = 86_400_000;

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** e.g. "temperature above 85°F", "rain above 60%" */
export function describeRule(w: WatchRow): string {
  if (w.source === "music") {
    return w.config.includeSingles ? "new albums, EPs & singles" : "new albums & EPs";
  }
  const rule = w.config.rule;
  if (!rule) return "";
  const suffix =
    rule.metric === "temperature"
      ? `°${rule.unit ?? "F"}`
      : rule.metric === "precipitation_probability"
        ? "%"
        : ` ${rule.unit ?? "mph"}`;
  return `${rule.metric?.replace(/_/g, " ")} ${rule.comparator} ${rule.threshold}${suffix}`;
}

export function watchTitle(w: WatchRow): string {
  return w.source === "music"
    ? (w.config.artist?.name ?? w.label)
    : (w.config.location?.label ?? w.label);
}

function metricBounds(metric: string | undefined, unit: string | undefined) {
  if (metric === "precipitation_probability") return { min: 0, max: 100 };
  if (metric === "wind_speed") return { min: 0, max: unit === "kmh" ? 100 : 60 };
  return unit === "C" ? { min: -20, max: 50 } : { min: 0, max: 120 };
}

export interface WatchDisplay {
  firing: boolean;
  value: string | null;
  delta: string;
  fill: number;
}

/**
 * What a card shows, derived only from data the list endpoint already returns.
 * Mirrors apps/web/app/components/watch-display.ts — keep them in step.
 *
 * Nothing persists a current reading today, so weather cards render the real
 * layout with an honest blank until one exists; passing `current` lights them
 * up unchanged. "Firing" is inferred from how recently the watch matched.
 */
export function describeWatch(w: WatchRow, current?: number): WatchDisplay {
  const matchedAt = w.lastMatchedAt ? new Date(w.lastMatchedAt).getTime() : null;
  const firing = matchedAt !== null && Date.now() - matchedAt < DAY_MS;

  if (w.source === "music") {
    // Prefer a release we actually alerted on, then the catalogue position
    // recorded when the watch was made, and only fall back to the watch's own
    // start date for watches created before that lookup existed.
    const recorded = w.config.lastRelease?.date
      ? // Date-only, so anchor at midday UTC to avoid a timezone off-by-one.
        new Date(`${w.config.lastRelease.date}T12:00:00Z`).getTime()
      : null;
    const since = matchedAt ?? recorded ?? (w.createdAt ? new Date(w.createdAt).getTime() : null);
    if (since === null) return { firing, value: null, delta: "no activity yet", fill: 0 };

    const days = Math.max(0, Math.floor((Date.now() - since) / DAY_MS));
    const delta =
      matchedAt || recorded !== null ? "since last release" : "since you started watching";
    return { firing, value: `${days}d`, delta, fill: 0 };
  }

  const rule = w.config.rule;
  const threshold = rule?.threshold;
  const unit = rule?.unit;
  const unitSuffix =
    rule?.metric === "temperature"
      ? `°${unit ?? "F"}`
      : rule?.metric === "precipitation_probability"
        ? "%"
        : "";

  if (current === undefined || threshold === undefined) {
    return { firing, value: null, delta: "no reading yet", fill: 0 };
  }

  const { min, max } = metricBounds(rule?.metric, unit);
  const over = current - threshold;
  const rounded = Math.round(Math.abs(over));
  const word =
    rule?.comparator === "below" ? (over < 0 ? "under" : "over") : over > 0 ? "over" : "under";
  return {
    firing,
    value: `${Math.round(current)}${unitSuffix}`,
    delta: `${rounded}${unitSuffix} ${word} threshold`,
    fill: (current - min) / (max - min),
  };
}
