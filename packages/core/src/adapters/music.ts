import { MusicWatchConfigSchema, type MusicWatchConfig } from "@watchtower/types";
import type { AdapterContext, SourceAdapter, WatcherMatch } from "./types";

const MB_ROOT = "https://musicbrainz.org/ws/2";
const ITUNES_SEARCH = "https://itunes.apple.com/search";

// MusicBrainz requires a descriptive User-Agent identifying the application.
const USER_AGENT = "Watchtower/0.1 ( https://watchtower-web-nu.vercel.app )";

// MusicBrainz asks for at most one request per second.
const MIN_REQUEST_GAP_MS = 1100;
let lastRequestAt = 0;

/**
 * How far back to look. The watch's creation date is the real baseline; this
 * window is a safety net so a long-dormant watch can still catch a release
 * that MusicBrainz indexed late, without ever backfilling a discography.
 */
const LOOKBACK_DAYS = 45;

interface ReleaseGroup {
  id: string;
  title: string;
  "first-release-date"?: string;
  "primary-type"?: string;
}

const TYPE_EMOJI: Record<string, string> = {
  Album: "💿",
  EP: "🎧",
  Single: "🎵",
};

/** YYYY-MM-DD in UTC. MusicBrainz dates are date-only, so compare as strings. */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

/**
 * Best-effort artwork and store link from iTunes. Never blocks an alert —
 * detection is MusicBrainz's job; this only decorates the result.
 */
async function enrich(
  artistName: string,
  title: string,
  fetchImpl: typeof fetch,
): Promise<{ artworkUrl?: string; storeUrl?: string }> {
  try {
    const term = encodeURIComponent(`${artistName} ${title}`);
    const res = await fetchImpl(`${ITUNES_SEARCH}?term=${term}&entity=album&limit=1`);
    if (!res.ok) return {};
    const json = (await res.json()) as {
      results?: { artworkUrl100?: string; collectionViewUrl?: string }[];
    };
    const hit = json.results?.[0];
    if (!hit) return {};
    return {
      // iTunes serves any size by swapping the dimensions in the path.
      ...(hit.artworkUrl100
        ? { artworkUrl: hit.artworkUrl100.replace("100x100", "600x600") }
        : {}),
      ...(hit.collectionViewUrl ? { storeUrl: hit.collectionViewUrl } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Watches an artist for new releases.
 *
 * Detection uses MusicBrainz *release-groups*, which collapse every edition,
 * remaster, and regional variant of a release into one entity — the thing that
 * keeps "new album" alerts from firing four times. The release-group id is the
 * dedupe key, so any given release alerts exactly once, ever.
 */
export const musicAdapter: SourceAdapter<MusicWatchConfig> = {
  source: "music",
  configSchema: MusicWatchConfigSchema,
  async evaluate(config, ctx) {
    const today = toDateString(ctx.now);
    const createdOn = toDateString(ctx.watchCreatedAt);
    const lookbackFrom = toDateString(addDays(ctx.now, -LOOKBACK_DAYS));
    // Never alert on anything older than the watch itself.
    const from = createdOn > lookbackFrom ? createdOn : lookbackFrom;

    const query = `arid:${config.artist.mbid} AND firstreleasedate:[${from} TO ${today}]`;
    const url = `${MB_ROOT}/release-group?query=${encodeURIComponent(query)}&fmt=json&limit=50`;

    await throttle();
    const res = await ctx.fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      throw new Error(`MusicBrainz responded ${res.status}`);
    }
    const json = (await res.json()) as { "release-groups"?: ReleaseGroup[] };
    const groups = json["release-groups"] ?? [];

    const allowedTypes = new Set(
      config.includeSingles ? ["Album", "EP", "Single"] : ["Album", "EP"],
    );

    const matches: WatcherMatch[] = [];
    for (const group of groups) {
      const date = group["first-release-date"];
      // Partial dates ("2024", "2024-11") mean the release date isn't actually
      // known — alerting on those produces false "out now" claims.
      if (!date || date.length !== 10) continue;
      // Future-dated announcements aren't out yet; the range query should
      // exclude them, but the search index can lag behind an edit.
      if (date > today || date < from) continue;

      const type = group["primary-type"];
      if (!type || !allowedTypes.has(type)) continue;

      const extra = await enrich(config.artist.name, group.title, ctx.fetch);
      matches.push({
        // The release-group id is stable and unique — exactly-once alerting.
        dedupeKey: `release:${group.id}`,
        title: `${TYPE_EMOJI[type] ?? "🎶"} New ${type.toLowerCase()} from ${config.artist.name}`,
        body: `"${group.title}" is out now.`,
        data: {
          source: "music",
          artist: config.artist,
          releaseGroupId: group.id,
          title: group.title,
          type,
          releaseDate: date,
          ...extra,
        },
      });
    }
    return matches;
  },
};

/** Artist search for the watch-creation picker. */
export async function searchArtists(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<
  { mbid: string; name: string; disambiguation?: string; country?: string; type?: string }[]
> {
  const url = `${MB_ROOT}/artist?query=${encodeURIComponent(query)}&fmt=json&limit=8`;
  await throttle();
  const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MusicBrainz responded ${res.status}`);
  }
  const json = (await res.json()) as {
    artists?: { id: string; name: string; disambiguation?: string; country?: string; type?: string }[];
  };
  return (json.artists ?? []).map((a) => ({
    mbid: a.id,
    name: a.name,
    ...(a.disambiguation ? { disambiguation: a.disambiguation } : {}),
    ...(a.country ? { country: a.country } : {}),
    ...(a.type ? { type: a.type } : {}),
  }));
}
