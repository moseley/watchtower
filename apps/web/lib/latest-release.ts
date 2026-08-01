import { getLatestRelease } from "@watchtower/core";
import type { LatestRelease } from "@watchtower/types";

/**
 * An artist's back catalogue barely moves, and both the builder form and the
 * watch-creation path ask for this, so repeats are served from memory.
 * MusicBrainz asks for ~1 request/second and its free tier is non-commercial.
 */
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; release: LatestRelease | null }>();

function readCache(key: string) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  // Refresh recency so the eviction below drops genuinely cold entries.
  cache.delete(key);
  cache.set(key, hit);
  return hit.release;
}

function writeCache(key: string, release: LatestRelease | null) {
  cache.set(key, { at: Date.now(), release });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

export async function lookupLatestRelease(
  mbid: string,
  includeSingles: boolean,
): Promise<LatestRelease | null> {
  const key = `${mbid}:${includeSingles}`;
  const cached = readCache(key);
  if (cached !== undefined) return cached;
  const release = await getLatestRelease(mbid, { includeSingles });
  writeCache(key, release);
  return release;
}
