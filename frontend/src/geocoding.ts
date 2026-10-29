// Address search and reverse geocoding through Photon (OpenStreetMap data).
// Photon is a public demo service: check its terms and limits before production use.
const PHOTON_URL = "https://photon.komoot.io";

export type GeocodeResult = { label: string; address: string; latitude: number; longitude: number };

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
};

function toResult(feature: PhotonFeature): GeocodeResult | null {
  const coordinates = feature.geometry?.coordinates;
  const p = feature.properties ?? {};
  if (!coordinates || coordinates.length < 2) return null;
  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const parts = [p.name, street, p.district || p.locality, p.city, p.state, p.postcode]
    .filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index);
  if (!parts.length) return null;
  return { label: parts[0], address: parts.join(", "), latitude, longitude };
}

async function photon(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const response = await fetch(`${PHOTON_URL}${path}?${new URLSearchParams(params).toString()}`, { signal });
  if (!response.ok) throw new Error("Address search is unavailable right now");
  const payload = (await response.json()) as { features?: PhotonFeature[] };
  return (payload.features ?? []).map(toResult).filter((item): item is GeocodeResult => item !== null);
}

export function searchAddresses(query: string, near?: { latitude: number; longitude: number } | null, signal?: AbortSignal) {
  const params: Record<string, string> = { q: query, limit: "6", lang: "en" };
  if (near) { params.lat = String(near.latitude); params.lon = String(near.longitude); }
  return photon("/api/", params, signal);
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodeResult | null> {
  const [first] = await photon("/reverse", { lat: String(latitude), lon: String(longitude), lang: "en" });
  return first ?? null;
}
