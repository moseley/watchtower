"use client";

import { useCallback, useEffect, useState } from "react";

type Metric = "temperature" | "precipitation_probability" | "wind_speed";
type Comparator = "below" | "above";

interface WatchRow {
  id: string;
  label: string;
  source: string;
  config: {
    location?: { label?: string };
    rule?: { metric?: string; comparator?: string; threshold?: number };
  };
}

const OWNER_KEY = "watchtower.ownerId";

const METRICS: { key: Metric; label: string }[] = [
  { key: "temperature", label: "Temperature" },
  { key: "precipitation_probability", label: "Rain %" },
  { key: "wind_speed", label: "Wind" },
];

const METRIC_NAMES: Record<Metric, string> = {
  temperature: "temperature",
  precipitation_probability: "rain",
  wind_speed: "wind",
};

function iconFor(rule?: { metric?: string; comparator?: string }): string {
  if (rule?.metric === "temperature") return rule.comparator === "below" ? "❄️" : "☀️";
  if (rule?.metric === "precipitation_probability") return "🌧️";
  if (rule?.metric === "wind_speed") return "💨";
  return "🔔";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep status code
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export default function Home() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [supported, setSupported] = useState(true);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationText, setLocationText] = useState("");
  const [locationEdited, setLocationEdited] = useState(false);
  const [locating, setLocating] = useState(false);
  const [metric, setMetric] = useState<Metric>("temperature");
  const [comparator, setComparator] = useState<Comparator>("below");
  const [threshold, setThreshold] = useState("35");
  const [watches, setWatches] = useState<WatchRow[]>([]);
  const [busy, setBusy] = useState(false);

  const refreshWatches = useCallback(async (id: string) => {
    try {
      const json = await api<{ watches: WatchRow[] }>(
        `/api/watches?ownerId=${encodeURIComponent(id)}`,
      );
      setWatches(json.watches);
    } catch {
      // ignore list errors
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    const stored = localStorage.getItem(OWNER_KEY);
    if (stored) {
      setOwnerId(stored);
      void refreshWatches(stored);
    }
  }, [refreshWatches]);

  async function enableNotifications() {
    setBusy(true);
    try {
      setStatus("Setting up notifications…");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("notification permission was not granted");
      }
      const config = await api<{ vapidPublicKey: string | null }>("/api/push/config");
      if (!config.vapidPublicKey) {
        throw new Error("server is missing VAPID keys");
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) as BufferSource,
      });
      const reg = await api<{ ownerId: string }>("/api/devices/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webPushSubscription: subscription.toJSON() }),
      });
      localStorage.setItem(OWNER_KEY, reg.ownerId);
      setOwnerId(reg.ownerId);
      setStatus("Notifications enabled ✓");
      await refreshWatches(reg.ownerId);
    } catch (err) {
      setStatus(`Setup failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ latitude, longitude });
        try {
          const place = await api<{ label: string }>(
            `/api/geocode?lat=${latitude}&lon=${longitude}`,
          );
          setLocationText(place.label);
        } catch {
          setLocationText("Current location");
        }
        setLocationEdited(false);
        setLocating(false);
      },
      () => setLocating(false),
    );
  }

  function thresholdError(): string | null {
    const value = Number(threshold);
    if (threshold.trim() === "" || !Number.isFinite(value)) return "Enter a number";
    if (metric === "precipitation_probability" && (value < 0 || value > 100)) {
      return "Rain % must be between 0 and 100";
    }
    if (metric === "wind_speed" && value < 0) return "Wind speed can't be negative";
    return null;
  }

  async function onCreate() {
    if (!ownerId) return;
    setBusy(true);
    try {
      let loc: { latitude: number; longitude: number; label: string };
      if (locationEdited || !coords) {
        const query = locationText.trim();
        if (!query) throw new Error("Enter a city or zip code");
        loc = await api<{ latitude: number; longitude: number; label: string }>(
          `/api/geocode?q=${encodeURIComponent(query)}`,
        );
        setCoords({ latitude: loc.latitude, longitude: loc.longitude });
        setLocationText(loc.label);
        setLocationEdited(false);
      } else {
        loc = { ...coords, label: locationText.trim() || "Current location" };
      }

      const value = Number(threshold);
      const rule =
        metric === "temperature"
          ? { metric, comparator, threshold: value, unit: "F", withinHours: 12 }
          : metric === "precipitation_probability"
            ? { metric, comparator: "above", threshold: value, withinHours: 6 }
            : { metric, comparator: "above", threshold: value, unit: "mph", withinHours: 12 };

      await api("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId,
          source: "weather",
          label: `${loc.label} · ${METRIC_NAMES[metric]}`,
          config: {
            location: { latitude: loc.latitude, longitude: loc.longitude, label: loc.label },
            rule,
          },
        }),
      });
      setStatus("Watch created ✓");
      await refreshWatches(ownerId);
    } catch (err) {
      setStatus(`Create failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!ownerId) return;
    try {
      await api(`/api/watches/${encodeURIComponent(id)}?ownerId=${encodeURIComponent(ownerId)}`, {
        method: "DELETE",
      });
      setWatches((rows) => rows.filter((w) => w.id !== id));
    } catch (err) {
      setStatus(`Delete failed: ${(err as Error).message}`);
    }
  }

  const thresholdProblem = thresholdError();
  const canCreate =
    Boolean(ownerId) && !busy && !locating && !thresholdProblem && locationText.trim() !== "";

  const inputClass =
    "w-full rounded-lg bg-slate-950 px-4 py-3 text-white placeholder-slate-600 outline-none ring-blue-600 focus:ring-2";

  return (
    <main className="min-h-screen w-full bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-xl px-5 py-12">
        <h1 className="text-4xl font-extrabold">Watchtower</h1>
        <p className="mt-1 text-sm text-slate-400">
          Watch a source, match your criteria, get notified.
        </p>
        {status && <p className="mt-3 text-sm text-slate-300">{status}</p>}

        {!supported && (
          <div className="mt-6 rounded-xl bg-amber-950/60 p-4 text-sm text-amber-200">
            This browser doesn&apos;t support push notifications. On iPhone, add this site to
            your Home Screen first (Share → Add to Home Screen), then open it from there.
          </div>
        )}

        {supported && !ownerId && (
          <div className="mt-6 rounded-2xl bg-slate-900 p-5">
            <h2 className="text-lg font-bold">Turn on notifications</h2>
            <p className="mt-1 text-sm text-slate-400">
              Watchtower alerts you through browser notifications — they arrive even when this
              tab is closed.
            </p>
            <button
              className="mt-4 rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500 disabled:bg-slate-700"
              onClick={enableNotifications}
              disabled={busy}
            >
              {busy ? "Setting up…" : "Enable notifications"}
            </button>
          </div>
        )}

        <div className={`mt-6 rounded-2xl bg-slate-900 p-5 ${ownerId ? "" : "opacity-50"}`}>
          <h2 className="text-lg font-bold">New weather watch</h2>

          <label className="mt-4 block text-xs text-slate-400">Location (city or zip code)</label>
          <div className="mt-1.5 flex gap-2">
            <input
              className={inputClass}
              value={locationText}
              onChange={(e) => {
                setLocationText(e.target.value);
                setLocationEdited(true);
              }}
              placeholder="e.g. Honolulu or 96815"
              disabled={!ownerId}
            />
            <button
              className="rounded-lg bg-slate-700 px-4 hover:bg-slate-600 disabled:opacity-50"
              onClick={useCurrentLocation}
              disabled={!ownerId || locating}
              title="Use current location"
            >
              {locating ? "…" : "📍"}
            </button>
          </div>
          {coords && !locationEdited && (
            <p className="mt-1.5 text-xs text-slate-500">
              Using {coords.latitude.toFixed(3)}, {coords.longitude.toFixed(3)}
            </p>
          )}
          {locationEdited && (
            <p className="mt-1.5 text-xs text-slate-500">Will look up this location on create</p>
          )}

          <label className="mt-4 block text-xs text-slate-400">Metric</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {METRICS.map((m) => (
              <Chip
                key={m.key}
                label={m.label}
                active={metric === m.key}
                onClick={() => setMetric(m.key)}
              />
            ))}
          </div>

          {metric === "temperature" && (
            <>
              <label className="mt-4 block text-xs text-slate-400">When it goes</label>
              <div className="mt-1.5 flex gap-2">
                <Chip
                  label="❄️ Below"
                  active={comparator === "below"}
                  onClick={() => setComparator("below")}
                />
                <Chip
                  label="☀️ Above"
                  active={comparator === "above"}
                  onClick={() => setComparator("above")}
                />
              </div>
            </>
          )}

          <label className="mt-4 block text-xs text-slate-400">
            Threshold{" "}
            {metric === "temperature" ? "(°F)" : metric === "wind_speed" ? "(mph)" : "(0–100 %)"}
          </label>
          <input
            className={`${inputClass} mt-1.5 ${thresholdProblem ? "ring-2 ring-red-400" : ""}`}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            inputMode="numeric"
            placeholder="35"
            disabled={!ownerId}
          />
          {thresholdProblem && <p className="mt-1.5 text-xs text-red-400">{thresholdProblem}</p>}

          <button
            className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-bold hover:bg-blue-500 disabled:bg-slate-700"
            onClick={onCreate}
            disabled={!canCreate}
          >
            {busy ? "Working…" : "Create watch"}
          </button>
        </div>

        <h2 className="mt-8 text-base font-bold">Your watches ({watches.length})</h2>
        <div className="mt-3 space-y-2">
          {watches.length === 0 ? (
            <p className="text-sm text-slate-500">No watches yet.</p>
          ) : (
            watches.map((w) => (
              <div key={w.id} className="flex items-center gap-3 rounded-xl bg-slate-900 p-4">
                <span className="text-xl">{iconFor(w.config.rule)}</span>
                <div className="flex-1">
                  <p className="font-semibold">{w.config.location?.label ?? w.label}</p>
                  <p className="text-sm text-slate-400">
                    {w.config.rule?.metric?.replace(/_/g, " ")} {w.config.rule?.comparator}{" "}
                    {w.config.rule?.threshold}
                  </p>
                </div>
                <button
                  className="rounded-lg p-1.5 hover:bg-slate-800"
                  onClick={() => onDelete(w.id)}
                  title="Delete watch"
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>

        <p className="mt-10 text-xs text-slate-600">
          Watches are checked every ~15 minutes. Web and mobile keep separate watch lists until
          accounts arrive.
        </p>
      </div>
    </main>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
