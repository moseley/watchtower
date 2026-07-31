export const dynamic = "force-dynamic";

const FORWARD_URL = "https://geocoding-api.open-meteo.com/v1/search";
const REVERSE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";

interface ForwardHit {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
  country_code?: string;
}

interface ReverseResult {
  city?: string;
  locality?: string;
  countryCode?: string;
  countryName?: string;
  principalSubdivision?: string;
  principalSubdivisionCode?: string; // e.g. "US-HI"
}

export interface Place {
  latitude: number;
  longitude: number;
  label: string;
}

// Open-Meteo returns full state names ("Hawaii") while the reverse geocoder
// returns codes ("US-HI"). Mapping to abbreviations keeps a typed location and
// a GPS one formatted identically, so "Honolulu, HI" always means one thing.
const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "puerto rico": "PR", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

/** "City, ST" inside the US, "City, Country" elsewhere. */
function buildLabel(
  place: string,
  region: string | undefined,
  countryCode: string | undefined,
  countryName: string | undefined,
): string {
  const cc = countryCode?.toUpperCase();
  if (cc === "US") {
    const abbr = region ? (US_STATES[region.toLowerCase()] ?? region) : undefined;
    return [place, abbr].filter(Boolean).join(", ");
  }
  return [place, countryName ?? cc].filter(Boolean).join(", ");
}

// GET /api/geocode?q=<city or postal code>  → matching places, best first
// GET /api/geocode?lat=..&lon=..            → the place at those coordinates
//
// The forward response also carries the best match at the top level, so app
// builds released before the picker existed keep working unchanged.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");

  if (q) {
    const res = await fetch(
      `${FORWARD_URL}?name=${encodeURIComponent(q)}&count=10&language=en&format=json`,
    );
    if (!res.ok) {
      return Response.json({ error: "geocoding service unavailable" }, { status: 502 });
    }
    const json = (await res.json()) as { results?: ForwardHit[] };

    const seen = new Set<string>();
    const results: Place[] = [];
    for (const hit of json.results ?? []) {
      const label = buildLabel(hit.name, hit.admin1, hit.country_code, hit.country);
      // Open-Meteo often lists several districts that render to one label.
      if (seen.has(label)) continue;
      seen.add(label);
      results.push({ latitude: hit.latitude, longitude: hit.longitude, label });
      if (results.length === 5) break;
    }

    const best = results[0];
    if (!best) {
      return Response.json({ error: `no location found for "${q}"` }, { status: 404 });
    }
    return Response.json({ ...best, results });
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
    const label = place
      ? buildLabel(place, region, json.countryCode, json.countryName)
      : "Current location";
    return Response.json({ latitude, longitude, label });
  }

  return Response.json({ error: "q or lat/lon required" }, { status: 400 });
}
