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

export function registerDevice(expoPushToken: string, platform: "ios" | "android") {
  return post<{ ownerId: string; deviceId: string }>("/api/devices/register", {
    expoPushToken,
    platform,
  });
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
    rule?: { metric?: string; comparator?: string; threshold?: number };
  };
}

export async function listWatches(ownerId: string): Promise<WatchRow[]> {
  const json = await request<{ watches: WatchRow[] }>(
    `/api/watches?ownerId=${encodeURIComponent(ownerId)}`,
  );
  return json.watches;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  label: string;
}

/** City name or postal code → coordinates + display label. */
export function geocode(query: string): Promise<GeocodeResult> {
  return request<GeocodeResult>(`/api/geocode?q=${encodeURIComponent(query)}`);
}

/** Coordinates → display label (for the GPS default). */
export function reverseGeocode(latitude: number, longitude: number): Promise<GeocodeResult> {
  return request<GeocodeResult>(`/api/geocode?lat=${latitude}&lon=${longitude}`);
}
