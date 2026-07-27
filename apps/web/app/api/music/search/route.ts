import { searchArtists } from "@watchtower/core";
import type { ArtistSearchResult } from "@watchtower/types";

export const dynamic = "force-dynamic";

// Type-ahead means many lookups for the same prefixes, so cache briefly.
// MusicBrainz asks for ~1 request/second and its free tier is non-commercial —
// serving repeats from memory keeps us a good citizen and the UI snappy.
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; artists: ArtistSearchResult[] }>();

function readCache(key: string): ArtistSearchResult[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh recency so the eviction below drops genuinely cold entries.
  cache.delete(key);
  cache.set(key, hit);
  return hit.artists;
}

function writeCache(key: string, artists: ArtistSearchResult[]): void {
  cache.set(key, { at: Date.now(), artists });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

// GET /api/music/search?q=<artist or band name>
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) {
    return Response.json({ error: "q query param required" }, { status: 400 });
  }

  const key = q.toLowerCase();
  const cached = readCache(key);
  if (cached) {
    return Response.json({ artists: cached, cached: true });
  }

  try {
    const artists = await searchArtists(q);
    writeCache(key, artists);
    return Response.json({ artists });
  } catch (err) {
    return Response.json(
      { error: `artist search failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
