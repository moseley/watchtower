export const dynamic = "force-dynamic";

const FORWARD_URL = "https://geocoding-api.open-meteo.com/v1/search";
const REVERSE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";

interface ForwardHit {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country_code?: string;
}

interface ReverseResult {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  principalSubdivisionCode?: string; // e.g. "US-HI"
}

// GET /api/geocode?q=<city or postal code>  → forward geocode
// GET /api/geocode?lat=..&lon=..            → reverse geocode (label for coords)
// Both return { latitude, longitude, label }.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");

  if (q) {
    const res = await fetch(
      `${FORWARD_URL}?name=${encodeURIComponent(q)}&count=1&language=en&format=json`,
    );
    if (!res.ok) {
      return Response.json({ error: "geocoding service unavailable" }, { status: 502 });
    }
    const json = (await res.json()) as { results?: ForwardHit[] };
    const hit = json.results?.[0];
    if (!hit) {
      return Response.json({ error: `no location found for "${q}"` }, { status: 404 });
    }
    const region = hit.admin1 ?? hit.country_code?.toUpperCase();
    const label = [hit.name, region].filter(Boolean).join(", ");
    return Response.json({ latitude: hit.latitude, longitude: hit.longitude, label });
  }

  if (lat && lon) {
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return Response.json({ error: "invalid lat/lon" }, { status: 400 });
    }
    const res = await fetch(
      `${REVERSE_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
    );
    if (!res.ok) {
      // Reverse geocoding is cosmetic — fall back to a generic label.
      return Response.json({ latitude, longitude, label: "Current location" });
    }
    const json = (await res.json()) as ReverseResult;
    const place = json.city || json.locality;
    const region = json.principalSubdivisionCode?.split("-")[1] ?? json.principalSubdivision;
    const label = place ? [place, region].filter(Boolean).join(", ") : "Current location";
    return Response.json({ latitude, longitude, label });
  }

  return Response.json({ error: "q or lat/lon required" }, { status: 400 });
}
