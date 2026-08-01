import { searchPeople } from "@watchtower/core";
import type { PersonSearchResult } from "@watchtower/types";

export const dynamic = "force-dynamic";

// Type-ahead means many lookups for the same prefixes, so cache briefly.
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; people: PersonSearchResult[] }>();

function readCache(key: string): PersonSearchResult[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh recency so the eviction below drops genuinely cold entries.
  cache.delete(key);
  cache.set(key, hit);
  return hit.people;
}

function writeCache(key: string, people: PersonSearchResult[]): void {
  cache.set(key, { at: Date.now(), people });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

// GET /api/screen/search?q=<actor or director name>
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) {
    return Response.json({ error: "q query param required" }, { status: 400 });
  }

  const key = q.toLowerCase();
  const cached = readCache(key);
  if (cached) {
    return Response.json({ people: cached, cached: true });
  }

  try {
    const people = await searchPeople(q);
    writeCache(key, people);
    return Response.json({ people });
  } catch (err) {
    return Response.json(
      { error: `person search failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
