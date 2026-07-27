import { searchArtists } from "@watchtower/core";

export const dynamic = "force-dynamic";

// GET /api/music/search?q=<artist or band name>
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) {
    return Response.json({ error: "q query param required" }, { status: 400 });
  }
  try {
    const artists = await searchArtists(q);
    return Response.json({ artists });
  } catch (err) {
    return Response.json(
      { error: `artist search failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
