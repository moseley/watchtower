export interface WatchRow {
  id: string;
  label: string;
  source: string;
  config: {
    location?: { label?: string };
    rule?: {
      metric?: string;
      comparator?: string;
      threshold?: number;
      unit?: string;
      withinHours?: number;
    };
    artist?: { name?: string; mbid?: string };
    includeSingles?: boolean;
    person?: { name?: string; tmdbId?: number; knownFor?: string; profilePath?: string };
    includeMinorCredits?: boolean;
    lastRelease?: { date: string; title: string; type: string; artworkUrl?: string };
  };
  // Already returned by /api/watches — the list route selects no subset, so
  // every scalar column comes back. Typing them here surfaces what is there.
  createdAt?: string;
  lastCheckedAt?: string | null;
  lastMatchedAt?: string | null;
}

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
  source: string;
  watchLabel: string;
}

/** Which panel the main region is showing. */
export type ListView = "watches" | "history" | "settings";

/** Source filter applied to the watch grid. */
export type SourceFilter = "all" | "weather" | "music" | "screen";

export interface PersonHit {
  tmdbId: number;
  name: string;
  knownFor?: string;
  profilePath?: string;
  knownForTitles: string[];
}

export interface Place {
  latitude: number;
  longitude: number;
  label: string;
}

export interface ArtistHit {
  mbid: string;
  name: string;
  disambiguation?: string;
  country?: string;
  type?: string;
}
