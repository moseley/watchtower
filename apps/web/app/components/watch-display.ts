import { noticeLabel, tmdbImageUrl } from "@watchtower/types";
import type { WatchRow } from "./types";

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
  if (w.source === "screen") {
    return w.config.includeMinorCredits
      ? "any new credit"
      : "new films & series";
  }
  const rule = w.config.rule;
  if (!rule) return "";
  const suffix =
    rule.metric === "temperature"
      ? `°${rule.unit ?? "F"}`
      : rule.metric === "precipitation_probability"
        ? "%"
        : ` ${rule.unit ?? "mph"}`;
  // The notice setting is otherwise invisible once a watch exists.
  const notice = rule.withinHours ? ` · ${noticeLabel(rule.withinHours)} notice` : "";
  return `${rule.metric?.replace(/_/g, " ")} ${rule.comparator} ${rule.threshold}${suffix}${notice}`;
}

/**
 * A picture for the card, where one exists.
 *
 * Neither MusicBrainz nor iTunes offers an artist photo, so a music watch
 * shows the sleeve of the artist's last release instead — which also says more
 * than a press shot would. Weather has nothing to show and keeps its icon.
 */
export function watchImageUrl(w: WatchRow): string | null {
  if (w.source === "music") return w.config.lastRelease?.artworkUrl ?? null;
  if (w.source === "screen") {
    const path = w.config.person?.profilePath;
    return path ? tmdbImageUrl(path) : null;
  }
  return null;
}

export function watchTitle(w: WatchRow): string {
  if (w.source === "music") return w.config.artist?.name ?? w.label;
  if (w.source === "screen") return w.config.person?.name ?? w.label;
  return w.config.location?.label ?? w.label;
}

/**
 * Plausible display bounds per metric, so a reading can be placed on the
 * threshold bar. Only used once a current value exists.
 */
function metricBounds(metric: string | undefined, unit: string | undefined) {
  if (metric === "precipitation_probability") return { min: 0, max: 100 };
  if (metric === "wind_speed") return { min: 0, max: unit === "kmh" ? 100 : 60 };
  return unit === "C" ? { min: -20, max: 50 } : { min: 0, max: 120 };
}

export interface WatchDisplay {
  /** Whether the watch matched recently enough to call it firing. */
  firing: boolean;
  /** The headline number, or null when there is nothing truthful to show. */
  value: string | null;
  /** The line to the right of the number. */
  delta: string;
  /** 0–1 position for the threshold bar. */
  fill: number;
}

/**
 * What a card shows, derived only from data the list endpoint already returns.
 *
 * The design leads with a live reading against the threshold, but nothing
 * persists a current value today — the engine fetches a forecast during a poll
 * and keeps only the alerts it produced. Rather than invent a number, weather
 * cards render the real layout with an honest blank until a reading exists;
 * passing `current` lights them up unchanged.
 *
 * "Firing" is likewise inferred from how recently the watch matched, since
 * whether it matches *right now* is not something we store.
 */
export function describeWatch(w: WatchRow, current?: number): WatchDisplay {
  const matchedAt = w.lastMatchedAt ? new Date(w.lastMatchedAt).getTime() : null;
  const firing = matchedAt !== null && Date.now() - matchedAt < DAY_MS;

  // Music and screen watches both count from the last thing the person put
  // out, and neither has a numeric threshold to plot.
  if (w.source === "music" || w.source === "screen") {
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
    const noun = w.source === "screen" ? "since last credit" : "since last release";
    const delta = matchedAt || recorded !== null ? noun : "since you started watching";
    return {
      firing,
      value: `${days}d`,
      delta,
      fill: 0, // no numeric threshold — the spec leaves this track empty
    };
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
  const word = rule?.comparator === "below" ? (over < 0 ? "under" : "over") : over > 0 ? "over" : "under";
  return {
    firing,
    value: `${Math.round(current)}${unitSuffix}`,
    delta: `${rounded}${unitSuffix} ${word} threshold`,
    fill: (current - min) / (max - min),
  };
}
