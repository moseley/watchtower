import type { CreateWatchInput } from "@watchtower/types";
import { API_URL } from "./config";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
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
  const res = await fetch(`${API_URL}/api/watches?ownerId=${encodeURIComponent(ownerId)}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const json = (await res.json()) as { watches: WatchRow[] };
  return json.watches;
}
