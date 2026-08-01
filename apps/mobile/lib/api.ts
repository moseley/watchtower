import type { CreateWatchInput } from "@watchtower/types";
import { API_URL } from "./config";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep status code message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function registerDevice(
  expoPushToken: string,
  platform: "ios" | "android",
  ownerId?: string,
) {
  return post<{ ownerId: string; deviceId: string }>("/api/devices/register", {
    expoPushToken,
    platform,
    ...(ownerId ? { ownerId } : {}),
  });
}

/** Create an identity with no push destination, for use before (or without)
 *  notification permission. */
export function createOwner() {
  return post<{ ownerId: string }>("/api/owners", {});
}

export function createWatch(input: CreateWatchInput & { ownerId: string }) {
  return post<{ watch: { id: string } }>("/api/watches", input);
}

export function deleteWatch(id: string, ownerId: string) {
  return request<{ ok: boolean }>(
    `/api/watches/${encodeURIComponent(id)}?ownerId=${encodeURIComponent(ownerId)}`,
    { method: "DELETE" },
  );
}

export interface WatchRow {
  id: string;
  label: string;
  source: string;
  config: {
    location?: { label?: string };
    rule?: { metric?: string; comparator?: string; threshold?: number; unit?: string };
    artist?: { name?: string; mbid?: string };
    includeSingles?: boolean;
    person?: { name?: string; tmdbId?: number; knownFor?: string };
    includeMinorCredits?: boolean;
    lastRelease?: { date: string; title: string; type: string };
  };
  // Already returned by /api/watches — the list route selects no subset, so
  // every scalar column comes back. Typing them here surfaces what is there.
  createdAt?: string;
  lastCheckedAt?: string | null;
  lastMatchedAt?: string | null;
}

export interface ArtistHit {
  mbid: string;
  name: string;
  disambiguation?: string;
  country?: string;
  type?: string;
}

/** Search MusicBrainz for an artist or band to watch. */
export async function searchArtists(
  query: string,
  signal?: AbortSignal,
): Promise<ArtistHit[]> {
  const json = await request<{ artists: ArtistHit[] }>(
    `/api/music/search?q=${encodeURIComponent(query)}`,
    signal ? { signal } : undefined,
  );
  return json.artists;
}

export async function listWatches(ownerId: string): Promise<WatchRow[]> {
  const json = await request<{ watches: WatchRow[] }>(
    `/api/watches?ownerId=${encodeURIComponent(ownerId)}`,
  );
  return json.watches;
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

/** Every alert sent to this owner, newest first. */
export async function listNotifications(ownerId: string): Promise<NotificationRow[]> {
  const json = await request<{ notifications: NotificationRow[] }>(
    `/api/notifications?ownerId=${encodeURIComponent(ownerId)}`,
  );
  return json.notifications;
}

export interface PersonHit {
  tmdbId: number;
  name: string;
  knownFor?: string;
  knownForTitles: string[];
}

/** Search TMDB for an actor or director to watch. */
export async function searchPeople(
  query: string,
  signal?: AbortSignal,
): Promise<PersonHit[]> {
  const json = await request<{ people: PersonHit[] }>(
    `/api/screen/search?q=${encodeURIComponent(query)}`,
    signal ? { signal } : undefined,
  );
  return json.people;
}

export interface LatestRelease {
  date: string;
  title: string;
  type: string;
}

/** The artist's most recent release, for showing how long it has been. */
export async function fetchLatestRelease(
  mbid: string,
  includeSingles: boolean,
  signal?: AbortSignal,
): Promise<LatestRelease | null> {
  const json = await request<{ release: LatestRelease | null }>(
    `/api/music/latest-release?mbid=${encodeURIComponent(mbid)}&includeSingles=${includeSingles}`,
    signal ? { signal } : undefined,
  );
  return json.release;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  label: string;
}

/** City name or postal code → the best match, plus the other candidates. */
export async function geocode(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult & { results: GeocodeResult[] }> {
  const json = await request<GeocodeResult & { results?: GeocodeResult[] }>(
    `/api/geocode?q=${encodeURIComponent(query)}`,
    signal ? { signal } : undefined,
  );
  return { ...json, results: json.results ?? [json] };
}

/** Coordinates → display label (for the GPS default). */
export function reverseGeocode(latitude: number, longitude: number): Promise<GeocodeResult> {
  return request<GeocodeResult>(`/api/geocode?lat=${latitude}&lon=${longitude}`);
}
