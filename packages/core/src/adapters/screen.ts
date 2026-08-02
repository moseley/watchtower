import {
  ScreenWatchConfigSchema,
  type PersonSearchResult,
  type ScreenWatchConfig,
} from "@watchtower/types";
import type { AdapterContext, SourceAdapter, WatcherMatch } from "./types";

const TMDB_ROOT = "https://api.themoviedb.org/3";

/**
 * Crew jobs that represent authorship. Producer and "Thanks" style credits are
 * left out by default: prolific people collect a lot of them, and they rarely
 * mean the person is actually making something new.
 */
const CORE_CREW_JOBS = new Set([
  "Director",
  "Series Director",
  "Writer",
  "Screenplay",
  "Story",
  "Teleplay",
  "Creator",
]);

/**
 * Genres that produce alerts nobody asked for. 99 (Documentary) catches both
 * "making of" featurettes and documentaries *about* the person; the rest are
 * the chat-show and reality circuit.
 */
const NOISE_GENRE_IDS = new Set([
  99, // Documentary (movie and tv)
  10767, // Talk (tv)
  10763, // News (tv)
  10764, // Reality (tv)
]);

/**
 * How far in the past a credit can be dated and still count as news.
 *
 * An announcement is either undated or dated ahead; a person turning up on
 * something released years ago is a catalogue correction — archive footage, a
 * late-added credit — not an announcement. Testing surfaced a 1953 awards
 * ceremony this way, which no genre filter would reliably catch.
 */
const MAX_BACKDATE_DAYS = 365;

interface TmdbCredit {
  id: number;
  media_type: "movie" | "tv";
  title?: string; // movies
  name?: string; // tv
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  character?: string;
  job?: string;
}

function token(): string {
  const value = process.env.TMDB_ACCESS_TOKEN;
  if (!value) {
    throw new Error("TMDB_ACCESS_TOKEN is not set");
  }
  return value;
}

async function tmdb<T>(path: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${TMDB_ROOT}${path}`, {
    headers: { Authorization: `Bearer ${token()}`, accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`TMDB responded ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Unique across both catalogues — a movie and a series can share an id. */
function creditKey(credit: TmdbCredit): string {
  return `${credit.media_type}:${credit.id}`;
}

function creditTitle(credit: TmdbCredit): string {
  return credit.title ?? credit.name ?? "Untitled";
}

function creditDate(credit: TmdbCredit): string | undefined {
  const date = credit.release_date || credit.first_air_date;
  return date && date.length === 10 ? date : undefined;
}

/**
 * The credits that count for this watch. Deliberately does not filter on
 * popularity or vote count: a genuinely new announcement always starts at
 * zero, so that would suppress exactly what we're looking for.
 */
function relevantCredits(
  data: { cast?: TmdbCredit[]; crew?: TmdbCredit[] },
  includeMinorCredits: boolean,
): TmdbCredit[] {
  const cast = data.cast ?? [];
  const crew = (data.crew ?? []).filter(
    (c) => includeMinorCredits || (c.job !== undefined && CORE_CREW_JOBS.has(c.job)),
  );

  const seen = new Set<string>();
  const out: TmdbCredit[] = [];
  for (const credit of [...cast, ...crew]) {
    if (!credit.media_type || (credit.media_type !== "movie" && credit.media_type !== "tv")) {
      continue;
    }
    if (
      !includeMinorCredits &&
      (credit.genre_ids ?? []).some((id) => NOISE_GENRE_IDS.has(id))
    ) {
      continue;
    }
    // The same title can appear as both a cast and a crew credit.
    const key = creditKey(credit);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(credit);
  }
  return out;
}

async function fetchCredits(
  personId: number,
  includeMinorCredits: boolean,
  fetchImpl: typeof fetch,
): Promise<TmdbCredit[]> {
  const data = await tmdb<{ cast?: TmdbCredit[]; crew?: TmdbCredit[] }>(
    `/person/${personId}/combined_credits`,
    fetchImpl,
  );
  return relevantCredits(data, includeMinorCredits);
}

export interface PersonSnapshot {
  /** Credit keys the person already has, so existing work never alerts. */
  knownCredits: string[];
  /** Their most recent released title, for "how long since" on the card. */
  lastRelease?: { date: string; title: string; type: string };
}

/**
 * Everything a new watch needs to know about where a person's career stands.
 * One request serves both, since the baseline and the latest release come from
 * the same filmography.
 */
export async function getPersonSnapshot(
  personId: number,
  { includeMinorCredits = false }: { includeMinorCredits?: boolean } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<PersonSnapshot> {
  const credits = await fetchCredits(personId, includeMinorCredits, fetchImpl);
  const today = toDateString(new Date());

  const released = credits
    .map((c) => ({ credit: c, date: creditDate(c) }))
    .filter((c): c is { credit: TmdbCredit; date: string } => Boolean(c.date) && c.date! <= today)
    .sort((a, b) => b.date.localeCompare(a.date));

  const newest = released[0];
  return {
    knownCredits: credits.map(creditKey),
    ...(newest
      ? {
          lastRelease: {
            date: newest.date,
            title: creditTitle(newest.credit),
            type: newest.credit.media_type === "movie" ? "Film" : "Series",
          },
        }
      : {}),
  };
}

/**
 * Watches a person for newly announced film and television.
 *
 * Unlike a release, an announcement has no reliable date — TMDB happily lists
 * "Untitled <director> Film" with no date and no votes — so this compares the
 * current filmography against the snapshot taken when the watch was made and
 * treats anything unseen as new.
 */
export const screenAdapter: SourceAdapter<ScreenWatchConfig> = {
  source: "screen",
  configSchema: ScreenWatchConfigSchema,
  async evaluate(config, ctx) {
    const credits = await fetchCredits(
      config.person.tmdbId,
      config.includeMinorCredits,
      ctx.fetch,
    );

    const known = new Set(config.knownCredits);
    const matches: WatcherMatch[] = [];

    for (const credit of credits) {
      const key = creditKey(credit);
      if (known.has(key)) continue;

      const title = creditTitle(credit);
      const isFilm = credit.media_type === "movie";
      const date = creditDate(credit);
      const role = credit.job ?? (credit.character ? "cast" : undefined);

      // Undated and forthcoming titles are the point; long-past ones are not.
      if (date && date < toDateString(addDays(ctx.now, -MAX_BACKDATE_DAYS))) continue;

      const when = date
        ? date > toDateString(ctx.now)
          ? `due ${date}`
          : `out ${date}`
        : "no release date yet";

      matches.push({
        // Stable and unique, so a title announces exactly once.
        dedupeKey: `credit:${key}`,
        title: `${isFilm ? "🎬" : "📺"} New ${isFilm ? "film" : "series"} for ${config.person.name}`,
        body: `"${title}" — ${when}.`,
        data: {
          source: "screen",
          person: config.person,
          tmdbId: credit.id,
          mediaType: credit.media_type,
          title,
          ...(date ? { date } : {}),
          ...(role ? { role } : {}),
        },
      });
    }

    return matches;
  },
};

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Person search for the watch-creation picker. */
export async function searchPeople(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PersonSearchResult[]> {
  const data = await tmdb<{
    results?: {
      id: number;
      name: string;
      known_for_department?: string;
      profile_path?: string | null;
      known_for?: { title?: string; name?: string }[];
    }[];
  }>(`/search/person?query=${encodeURIComponent(query)}&include_adult=false`, fetchImpl);

  return (data.results ?? []).slice(0, 8).map((p) => ({
    tmdbId: p.id,
    name: p.name,
    ...(p.known_for_department ? { knownFor: p.known_for_department } : {}),
    ...(p.profile_path ? { profilePath: p.profile_path } : {}),
    knownForTitles: (p.known_for ?? [])
      .map((k) => k.title ?? k.name)
      .filter((t): t is string => Boolean(t))
      .slice(0, 3),
  }));
}
