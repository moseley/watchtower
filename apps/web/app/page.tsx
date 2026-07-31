"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "./components/Logo";

type Source = "weather" | "music";
type Metric = "temperature" | "precipitation_probability" | "wind_speed";
type Comparator = "below" | "above";

interface WatchRow {
  id: string;
  label: string;
  source: string;
  config: {
    location?: { label?: string };
    rule?: { metric?: string; comparator?: string; threshold?: number; unit?: string };
    artist?: { name?: string; mbid?: string };
    includeSingles?: boolean;
  };
}

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
  source: string;
  watchLabel: string;
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function iconForSource(source: string, title: string): string {
  if (source === "music") return "🎤";
  const leading = Array.from(title)[0];
  // The engine already picks a fitting emoji per alert; reuse it when present.
  return leading && /\p{Extended_Pictographic}/u.test(leading) ? leading : "🔔";
}

interface Place {
  latitude: number;
  longitude: number;
  label: string;
}

interface ArtistHit {
  mbid: string;
  name: string;
  disambiguation?: string;
  country?: string;
  type?: string;
}

const OWNER_KEY = "watchtower.ownerId";
const MUSIC_LIMIT = 5;

type TempUnit = "F" | "C";
type ListView = "watches" | "history";

/** How many alerts to show at a time before "View more". */
const HISTORY_PAGE = 10;

/** Roughly the same temperature in each scale, so the default reads sensibly. */
const DEFAULT_THRESHOLD: Record<TempUnit, string> = { F: "85", C: "29" };

const fahrenheitToCelsius = (f: number) => Math.round(((f - 32) * 5) / 9);
const celsiusToFahrenheit = (c: number) => Math.round((c * 9) / 5 + 32);

/** e.g. "temperature above 85°F", "rain above 60%" */
function describeRule(w: WatchRow): string {
  if (w.source === "music") {
    return w.config.includeSingles ? "new albums, EPs & singles" : "new albums & EPs";
  }
  const rule = w.config.rule;
  if (!rule) return "";
  const suffix =
    rule.metric === "temperature"
      ? `°${rule.unit ?? "F"}`
      : rule.metric === "precipitation_probability"
        ? "%"
        : ` ${rule.unit ?? "mph"}`;
  return `${rule.metric?.replace(/_/g, " ")} ${rule.comparator} ${rule.threshold}${suffix}`;
}

/** Cap on waiting for a geolocation fix; the browser default is Infinity. */
const LOCATION_TIMEOUT_MS = 8000;

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

function iconFor(w: WatchRow): string {
  if (w.source === "music") return "🎤";
  const rule = w.config.rule;
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
  const [source, setSource] = useState<Source>("weather");
  const [watches, setWatches] = useState<WatchRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [listView, setListView] = useState<ListView>("watches");
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const [busy, setBusy] = useState(false);

  // weather form
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationText, setLocationText] = useState("");
  const [locationEdited, setLocationEdited] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationHits, setLocationHits] = useState<Place[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  // Tracks whether the user has typed a location, so a late-arriving fix
  // doesn't overwrite what they entered.
  const userTypedRef = useRef(false);
  const [metric, setMetric] = useState<Metric>("temperature");
  const [comparator, setComparator] = useState<Comparator>("below");
  const [tempUnit, setTempUnit] = useState<TempUnit>("F");
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD.F);
  const lastConversionRef = useRef<{
    from: TempUnit;
    to: TempUnit;
    original: string;
    converted: string;
  } | null>(null);

  // music form
  const [artistQuery, setArtistQuery] = useState("");
  const [artistHits, setArtistHits] = useState<ArtistHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [artist, setArtist] = useState<ArtistHit | null>(null);
  const [includeSingles, setIncludeSingles] = useState(false);

  const musicCount = watches.filter((w) => w.source === "music").length;

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

  const refreshNotifications = useCallback(async (id: string) => {
    try {
      const json = await api<{ notifications: NotificationRow[] }>(
        `/api/notifications?ownerId=${encodeURIComponent(id)}`,
      );
      setNotifications(json.notifications);
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
      void refreshNotifications(stored);
    }
  }, [refreshWatches, refreshNotifications]);

  // A browser push arrives in the service worker, so the open page won't know
  // about it. Refresh the history when the tab regains focus.
  useEffect(() => {
    if (!ownerId) return;
    const onFocus = () => void refreshNotifications(ownerId);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [ownerId, refreshNotifications]);

  // The service worker sends a clicked notification to /#history, including
  // when it reuses a tab that is already open.
  useEffect(() => {
    const openHistory = () => {
      if (window.location.hash === "#history") {
        setListView("history");
        setHistoryLimit(HISTORY_PAGE);
      }
    };
    openHistory();
    window.addEventListener("hashchange", openHistory);
    return () => window.removeEventListener("hashchange", openHistory);
  }, []);

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

  function useCurrentLocation({ explicit = false } = {}) {
    if (!("geolocation" in navigator)) return;
    // An explicit click on the pin means the user wants GPS to win.
    if (explicit) userTypedRef.current = false;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        // Don't clobber a location the user typed while we were waiting.
        if (userTypedRef.current) return;
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
      },
      () => {
        setLocating(false);
        if (explicit) setStatus("Couldn't get your location — type a city or zip instead.");
      },
      // The default timeout is Infinity, which can leave this pending forever.
      { timeout: LOCATION_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 },
    );
  }

  // Search as you type. Debounced so a burst of keystrokes makes one request,
  // and the previous request is aborted on every change so a slow early
  // response can never overwrite the results for what's now in the box.
  useEffect(() => {
    const q = artistQuery.trim();
    if (source !== "music" || artist || q.length < 2) {
      setArtistHits([]);
      setNoResults(false);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const json = await api<{ artists: ArtistHit[] }>(
          `/api/music/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        setArtistHits(json.artists);
        setNoResults(json.artists.length === 0);
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // superseded
        setArtistHits([]);
        setStatus(`Search failed: ${(err as Error).message}`);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [artistQuery, source, artist]);

  // Resolve what the user types into concrete places, so an ambiguous name
  // ("San Jose") can be disambiguated before the watch is created rather than
  // after. Same debounce-and-abort shape as the artist search above.
  useEffect(() => {
    const q = locationText.trim();
    if (source !== "weather" || !locationEdited || q.length < 2) {
      setLocationHits([]);
      setSearchingLocation(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchingLocation(true);
      try {
        const json = await api<{ results?: Place[] }>(
          `/api/geocode?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        setLocationHits(json.results ?? []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // superseded
        setLocationHits([]); // e.g. 404 no match — the hint covers it
      } finally {
        if (!controller.signal.aborted) setSearchingLocation(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [locationText, locationEdited, source]);

  /** Convert the entered value so switching scales keeps the same weather. */
  function switchTempUnit(next: TempUnit) {
    if (next === tempUnit) return;
    const prior = lastConversionRef.current;
    // Toggling back without editing restores the exact original: converting
    // both ways rounds twice and would drift 85 -> 29 -> 84.
    if (prior && prior.to === tempUnit && prior.from === next && prior.converted === threshold) {
      setThreshold(prior.original);
      lastConversionRef.current = null;
      setTempUnit(next);
      return;
    }
    const value = Number(threshold);
    const converted =
      Number.isFinite(value) && threshold.trim() !== ""
        ? String(next === "C" ? fahrenheitToCelsius(value) : celsiusToFahrenheit(value))
        : DEFAULT_THRESHOLD[next];
    lastConversionRef.current = { from: tempUnit, to: next, original: threshold, converted };
    setThreshold(converted);
    setTempUnit(next);
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

  async function createWeatherWatch() {
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
        ? { metric, comparator, threshold: value, unit: tempUnit, withinHours: 12 }
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
  }

  async function createMusicWatch() {
    if (!artist) throw new Error("Pick an artist first");
    await api("/api/watches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerId,
        source: "music",
        label: artist.name,
        config: {
          artist: {
            mbid: artist.mbid,
            name: artist.name,
            ...(artist.disambiguation ? { disambiguation: artist.disambiguation } : {}),
          },
          includeSingles,
        },
      }),
    });
    setArtist(null);
    setArtistHits([]);
    setArtistQuery("");
  }

  async function onCreate() {
    if (!ownerId) return;
    setBusy(true);
    try {
      if (source === "weather") await createWeatherWatch();
      else await createMusicWatch();
      setStatus("Watch created ✓");
      await refreshWatches(ownerId);
    } catch (err) {
      setStatus(`${(err as Error).message}`);
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
  const musicFull = musicCount >= MUSIC_LIMIT;
  // Deliberately not gated on `locating`: a typed city needs no GPS, so a slow
  // or failed fix must never block creating a watch.
  const canCreate =
    Boolean(ownerId) &&
    !busy &&
    (source === "weather"
      ? !thresholdProblem && locationText.trim() !== ""
      : Boolean(artist) && !musicFull);

  const inputClass =
    "w-full rounded-lg bg-slate-950 px-4 py-3 text-white placeholder-slate-600 outline-none ring-blue-600 focus:ring-2";

  return (
    <main className="min-h-screen w-full bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-xl px-5 py-12">
        <div className="flex items-center gap-3.5">
          <Logo className="h-14 w-14 shrink-0" />
          <div>
            <h1 className="text-4xl font-extrabold leading-none">Watchtower</h1>
            <p className="mt-2 text-sm text-slate-400">
              Watch a source, match your criteria, get notified.
            </p>
          </div>
        </div>
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
          <div className="flex gap-2">
            <Tab label="🌤️ Weather" active={source === "weather"} onClick={() => setSource("weather")} />
            <Tab label="🎤 Music" active={source === "music"} onClick={() => setSource("music")} />
          </div>

          {source === "weather" ? (
            <>
              <label className="mt-5 block text-xs text-slate-400">
                Location (city or zip code)
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  className={inputClass}
                  value={locationText}
                  onChange={(e) => {
                    userTypedRef.current = true;
                    setLocationText(e.target.value);
                    setLocationEdited(true);
                  }}
                  placeholder="e.g. Honolulu or 96815"
                  disabled={!ownerId}
                />
                <button
                  className="rounded-lg bg-slate-700 px-4 hover:bg-slate-600 disabled:opacity-50"
                  onClick={() => useCurrentLocation({ explicit: true })}
                  disabled={!ownerId || locating}
                  title="Use current location"
                >
                  {locating ? "…" : "📍"}
                </button>
              </div>
              {coords && !locationEdited && (
                <p className="mt-1.5 text-xs text-green-400">
                  ✓ {locationText} ({coords.latitude.toFixed(3)},{" "}
                  {coords.longitude.toFixed(3)})
                </p>
              )}
              {locationEdited && locationHits.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {locationHits.map((place) => (
                    <button
                      key={`${place.latitude},${place.longitude}`}
                      className="flex w-full items-center gap-3 rounded-lg bg-slate-950 p-3 text-left hover:bg-slate-800"
                      onClick={() => {
                        setCoords({ latitude: place.latitude, longitude: place.longitude });
                        setLocationText(place.label);
                        setLocationEdited(false);
                        setLocationHits([]);
                      }}
                    >
                      <span>📍</span>
                      <span className="flex-1 text-sm font-semibold">{place.label}</span>
                      <span className="text-xs text-slate-500">select</span>
                    </button>
                  ))}
                </div>
              )}
              {locationEdited && locationHits.length === 0 && (
                <p className="mt-1.5 text-xs text-slate-500">
                  {searchingLocation
                    ? "Looking up…"
                    : locationText.trim().length < 2
                      ? "Type a city or zip code"
                      : "No match yet — the closest one is used when you create the watch"}
                </p>
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

              {metric === "temperature" && (
                <>
                  <label className="mt-4 block text-xs text-slate-400">Units</label>
                  <div className="mt-1.5 flex gap-2">
                    <Chip
                      label="°F"
                      active={tempUnit === "F"}
                      onClick={() => switchTempUnit("F")}
                    />
                    <Chip
                      label="°C"
                      active={tempUnit === "C"}
                      onClick={() => switchTempUnit("C")}
                    />
                  </div>
                </>
              )}

              <label className="mt-4 block text-xs text-slate-400">
                Threshold{" "}
                {metric === "temperature"
                  ? `(°${tempUnit})`
                  : metric === "wind_speed"
                    ? "(mph)"
                    : "(0–100 %)"}
              </label>
              <input
                className={`${inputClass} mt-1.5 ${thresholdProblem ? "ring-2 ring-red-400" : ""}`}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                inputMode="numeric"
                placeholder={metric === "temperature" ? DEFAULT_THRESHOLD[tempUnit] : "35"}
                disabled={!ownerId}
              />
              {thresholdProblem && (
                <p className="mt-1.5 text-xs text-red-400">{thresholdProblem}</p>
              )}
            </>
          ) : (
            <>
              <div className="mt-5 flex items-baseline justify-between">
                <label className="block text-xs text-slate-400">Search for an artist or band</label>
                <span className="text-xs text-slate-500">
                  {musicCount} / {MUSIC_LIMIT} watched
                </span>
              </div>
              <div className="relative mt-1.5">
                <input
                  className={`${inputClass} pr-11`}
                  value={artistQuery}
                  onChange={(e) => setArtistQuery(e.target.value)}
                  placeholder="Start typing a name…"
                  autoComplete="off"
                  disabled={!ownerId}
                />
                <span
                  className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                  aria-hidden="true"
                >
                  {searching ? (
                    <span className="block h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-blue-400 motion-reduce:animate-none" />
                  ) : (
                    "🔍"
                  )}
                </span>
              </div>
              <p className="sr-only" role="status" aria-live="polite">
                {searching
                  ? "Searching"
                  : artistHits.length > 0
                    ? `${artistHits.length} artists found`
                    : ""}
              </p>

              {artist ? (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-blue-600 bg-blue-950/40 p-3">
                  <span className="text-xl">🎤</span>
                  <div className="flex-1">
                    <p className="font-semibold">{artist.name}</p>
                    {artist.disambiguation && (
                      <p className="text-xs text-slate-400">{artist.disambiguation}</p>
                    )}
                  </div>
                  <button
                    className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-800"
                    onClick={() => setArtist(null)}
                  >
                    change
                  </button>
                </div>
              ) : (
                artistHits.length === 0 ? (
                  noResults && (
                    <p className="mt-3 text-sm text-slate-500">
                      No artists found for &ldquo;{artistQuery.trim()}&rdquo;.
                    </p>
                  )
                ) : (
                  <div className="mt-3 space-y-1.5">
                    {artistHits.map((a) => (
                      <button
                        key={a.mbid}
                        className="flex w-full items-center gap-3 rounded-lg bg-slate-950 p-3 text-left hover:bg-slate-800"
                        onClick={() => {
                          setArtist(a);
                          setArtistHits([]);
                        }}
                      >
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{a.name}</p>
                          <p className="text-xs text-slate-500">
                            {[a.disambiguation, a.type, a.country].filter(Boolean).join(" · ") ||
                              "artist"}
                          </p>
                        </div>
                        <span className="text-xs text-slate-500">select</span>
                      </button>
                    ))}
                  </div>
                )
              )}

              <label className="mt-4 flex items-center gap-2.5 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-blue-600"
                  checked={includeSingles}
                  onChange={(e) => setIncludeSingles(e.target.checked)}
                  disabled={!ownerId}
                />
                Include singles
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Albums and EPs are always included. Singles can be frequent for busy artists.
              </p>

              {musicFull && (
                <p className="mt-3 text-xs text-amber-400">
                  You&apos;re watching {MUSIC_LIMIT} artists — delete one to add another.
                </p>
              )}
            </>
          )}

          <button
            className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-bold hover:bg-blue-500 disabled:bg-slate-700"
            onClick={onCreate}
            disabled={!canCreate}
          >
            {busy ? "Working…" : "Create watch"}
          </button>
        </div>

        <div id="history" className="mt-8 flex gap-2">
          <Tab
            label={`Watches (${watches.length})`}
            active={listView === "watches"}
            onClick={() => setListView("watches")}
          />
          <Tab
            label={`History (${notifications.length})`}
            active={listView === "history"}
            onClick={() => setListView("history")}
          />
        </div>

        <div className="mt-3 space-y-2">
          {listView === "watches" ? (
            watches.length === 0 ? (
              <p className="text-sm text-slate-500">No watches yet.</p>
            ) : (
              watches.map((w) => (
                <div key={w.id} className="flex items-center gap-3 rounded-xl bg-slate-900 p-4">
                  <span className="text-xl">{iconFor(w)}</span>
                  <div className="flex-1">
                    <p className="font-semibold">
                      {w.source === "music"
                        ? (w.config.artist?.name ?? w.label)
                        : (w.config.location?.label ?? w.label)}
                    </p>
                    <p className="text-sm text-slate-400">{describeRule(w)}</p>
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
            )
          ) : notifications.length === 0 ? (
            <p className="text-sm text-slate-500">
              No alerts yet. They&apos;ll appear here as your watches fire.
            </p>
          ) : (
            <>
              {notifications.slice(0, historyLimit).map((n) => (
                <div key={n.id} className="flex items-start gap-3 rounded-xl bg-slate-900 p-4">
                  <span className="text-xl leading-none">{iconForSource(n.source, n.title)}</span>
                  <div className="flex-1">
                    <p className="text-sm">{n.body}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {n.watchLabel} · {timeAgo(n.createdAt)}
                      {n.status === "failed" ? " · not delivered" : ""}
                    </p>
                  </div>
                </div>
              ))}
              {notifications.length > historyLimit && (
                <button
                  className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-slate-400 hover:bg-slate-800"
                  onClick={() => setHistoryLimit((n) => n + HISTORY_PAGE)}
                >
                  View {Math.min(HISTORY_PAGE, notifications.length - historyLimit)} more
                </button>
              )}
            </>
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

function Tab({
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
      className={`flex-1 rounded-lg py-2.5 text-sm font-bold ${
        active ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
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
