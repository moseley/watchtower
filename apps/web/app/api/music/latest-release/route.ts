import { lookupLatestRelease } from "../../../../lib/latest-release";

export const dynamic = "force-dynamic";

// GET /api/music/latest-release?mbid=<artist>&includeSingles=true|false
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mbid = params.get("mbid")?.trim();
  if (!mbid) {
    return Response.json({ error: "mbid query param required" }, { status: 400 });
  }
  const includeSingles = params.get("includeSingles") === "true";

  try {
    const release = await lookupLatestRelease(mbid, includeSingles);
    return Response.json({ release });
  } catch (err) {
    return Response.json(
      { error: `lookup failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
