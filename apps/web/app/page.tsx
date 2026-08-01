"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MobileTabBar } from "./components/MobileTabBar";
import { Sidebar } from "./components/Sidebar";
import { SlideOver } from "./components/SlideOver";
import { WatchCard } from "./components/WatchCard";
import { WatchForm } from "./components/WatchForm";
import { AudioLines, Bell, CloudSun, Layers, Plus, RefreshCw, watchIcon } from "./components/icons";
import { Button } from "./components/primitives";
import type { LatestRelease } from "@watchtower/types";
import type {
  ArtistHit,
  ListView,
  NotificationRow,
  Place,
  SourceFilter,
  WatchRow,
} from "./components/types";
import { describeWatch, timeAgo } from "./components/watch-display";

type Source = "weather" | "music";
type Metric = "temperature" | "precipitation_probability" | "wind_speed";
type Comparator = "below" | "above";
type TempUnit = "F" | "C";

const OWNER_KEY = "watchtower.ownerId";
const MUSIC_LIMIT = 5;

/** How many alerts to show at a time before "View more". */
const HISTORY_PAGE = 10;

/** Roughly the same temperature in each scale, so the default reads sensibly. */
const DEFAULT_THRESHOLD: Record<TempUnit, string> = { F: "85", C: "29" };

const fahrenheitToCelsius = (f: number) => Math.round(((f - 32) * 5) / 9);
const celsiusToFahrenheit = (c: number) => Math.round((c * 9) / 5 + 32);

/** Cap on waiting for a geolocation fix; the browser default is Infinity. */
const LOCATION_TIMEOUT_MS = 8000;

const METRIC_NAMES: Record<Metric, string> = {
  temperature: "temperature",
  precipitation_probability: "rain",
  wind_speed: "wind",
};

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

  // presentation only — which sources the grid shows, and whether the builder
  // panel is open. Neither touches what is fetched or how a watch is made.
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [builderOpen, setBuilderOpen] = useState(false);

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
  const [lastRelease, setLastRelease] = useState<LatestRelease | null>(null);
  const [loadingRelease, setLoadingRelease] = useState(false);

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
      setStatus("Notifications enabled");
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

  // Show where the artist's catalogue stands while the watch is being set up,
  // so "how long since their last release" is visible before creating it.
  // Re-runs on the singles toggle, which changes what counts as a release.
  useEffect(() => {
    if (!artist) {
      setLastRelease(null);
      setLoadingRelease(false);
      return;
    }
    const controller = new AbortController();
    setLoadingRelease(true);
    (async () => {
      try {
        const json = await api<{ release: LatestRelease | null }>(
          `/api/music/latest-release?mbid=${encodeURIComponent(artist.mbid)}&includeSingles=${includeSingles}`,
          { signal: controller.signal },
        );
        setLastRelease(json.release);
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // superseded
        setLastRelease(null);
      } finally {
        if (!controller.signal.aborted) setLoadingRelease(false);
      }
    })();
    return () => controller.abort();
  }, [artist, includeSingles]);

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
      setStatus("Watch created");
      await refreshWatches(ownerId);
      setBuilderOpen(false);
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

  const counts = {
    all: watches.length,
    weather: watches.filter((w) => w.source === "weather").length,
    music: musicCount,
  };
  const visibleWatches =
    sourceFilter === "all" ? watches : watches.filter((w) => w.source === sourceFilter);
  const firingCount = watches.filter((w) => describeWatch(w).firing).length;
  const lastCheckedAt = watches
    .map((w) => w.lastCheckedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  const heading =
    sourceFilter === "all"
      ? "All watches"
      : sourceFilter === "weather"
        ? "Weather watches"
        : "Music watches";

  function refreshAll() {
    if (!ownerId) return;
    void refreshWatches(ownerId);
    void refreshNotifications(ownerId);
  }

  function openBuilder() {
    setStatus("");
    setBuilderOpen(true);
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar
        view={listView}
        sourceFilter={sourceFilter}
        counts={counts}
        onNewWatch={openBuilder}
        onSelectSource={(next) => {
          setSourceFilter(next);
          setListView("watches");
        }}
        onSelectView={setListView}
      />

      <main className="flex min-w-0 flex-1 flex-col gap-5 px-5 pb-28 pt-5 lg:px-7 lg:pb-6 lg:pt-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold tracking-[-.03em] text-ink lg:text-[28px]">
              {listView === "watches" ? heading : listView === "history" ? "History" : "Settings"}
            </h1>
            {listView === "watches" && (
              <p className="mt-1 text-[13px] text-muted">
                {firingCount} firing now
                {lastCheckedAt ? ` · last check ${timeAgo(lastCheckedAt)}` : ""}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={refreshAll}
              className="hidden items-center gap-2 rounded-control border border-hairline bg-surface px-3.5 py-2 text-[13.5px] font-medium text-ink transition-colors hover:border-hairline-strong lg:flex"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
            <button
              type="button"
              onClick={openBuilder}
              aria-label="New watch"
              className="grid h-[34px] w-[34px] place-items-center rounded-control bg-accent text-white transition-colors hover:bg-[#0c5740] lg:hidden"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {!supported && (
          <div className="rounded-card border border-hairline bg-surface p-4 text-[13.5px] text-muted">
            This browser doesn&apos;t support push notifications. On iPhone, add this site to your
            Home Screen first (Share → Add to Home Screen), then open it from there.
          </div>
        )}

        {supported && !ownerId && (
          <div className="rounded-card border border-hairline bg-surface p-5 shadow-card">
            <h2 className="text-[15px] font-semibold text-ink">Turn on notifications</h2>
            <p className="mt-1 text-[13.5px] text-muted">
              Watchtower alerts you through browser notifications — they arrive even when this tab
              is closed.
            </p>
            <Button className="mt-4" onClick={enableNotifications} disabled={busy}>
              {busy ? "Setting up…" : "Enable notifications"}
            </Button>
          </div>
        )}

        {status && <p className="text-[13px] text-muted">{status}</p>}

        {listView === "watches" && (
          <>
            {/* Mobile source filter */}
            <div className="flex gap-2 overflow-x-auto lg:hidden">
              {(
                [
                  { value: "all" as SourceFilter, label: `All ${counts.all}`, icon: Layers },
                  { value: "weather" as SourceFilter, label: "Weather", icon: CloudSun },
                  { value: "music" as SourceFilter, label: "Music", icon: AudioLines },
                ] satisfies { value: SourceFilter; label: string; icon: typeof Layers }[]
              ).map(({ value, label, icon: Icon }) => {
                const active = sourceFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSourceFilter(value)}
                    className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium transition-colors ${
                      active
                        ? "bg-ink text-white"
                        : "border border-hairline bg-surface text-ink"
                    }`}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                );
              })}
            </div>

            {visibleWatches.length === 0 ? (
              <p className="text-[14px] text-muted">
                {watches.length === 0
                  ? "No watches yet."
                  : `No ${sourceFilter} watches yet.`}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {visibleWatches.map((w) => (
                  <WatchCard key={w.id} watch={w} onDelete={onDelete} />
                ))}
              </div>
            )}

            {/* Recent activity — the history lives in its own view on mobile */}
            {notifications.length > 0 && (
              <section className="hidden lg:block">
                <h2 className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[.09em] text-faint">
                  Recent activity
                </h2>
                <ul className="mt-2">
                  {notifications.slice(0, 4).map((n) => {
                    const Icon = watchIcon(n.source, undefined);
                    return (
                      <li
                        key={n.id}
                        className="flex items-center gap-3 border-b border-hairline py-3 last:border-0"
                      >
                        <Icon size={16} className="shrink-0 text-faint" />
                        <span className="min-w-0 flex-1 truncate text-[14px] text-ink">
                          {n.body}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-faint">
                          {timeAgo(n.createdAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}

        {listView === "history" && (
          <div className="flex flex-col gap-2">
            {notifications.length === 0 ? (
              <p className="text-[14px] text-muted">
                No alerts yet. They&apos;ll appear here as your watches fire.
              </p>
            ) : (
              <>
                {notifications.slice(0, historyLimit).map((n) => {
                  const Icon = watchIcon(n.source, undefined);
                  return (
                    <article
                      key={n.id}
                      className="flex items-start gap-3 rounded-card border border-hairline bg-surface p-4 shadow-card"
                    >
                      <Icon size={17} className="mt-0.5 shrink-0 text-faint" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] text-ink">{n.body}</p>
                        <p className="mt-1 font-mono text-[11px] text-faint">
                          {n.watchLabel} · {timeAgo(n.createdAt)}
                          {n.status === "failed" ? " · not delivered" : ""}
                        </p>
                      </div>
                    </article>
                  );
                })}
                {notifications.length > historyLimit && (
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setHistoryLimit((n) => n + HISTORY_PAGE)}
                  >
                    View {Math.min(HISTORY_PAGE, notifications.length - historyLimit)} more
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {listView === "settings" && (
          <div className="flex flex-col gap-3">
            <section className="rounded-card border border-hairline bg-surface p-5 shadow-card">
              <h2 className="text-[15px] font-semibold text-ink">Notifications</h2>
              <p className="mt-1 text-[13.5px] text-muted">
                {ownerId
                  ? "This browser is registered for alerts."
                  : "Not registered yet — turn on notifications to start receiving alerts."}
              </p>
              {!ownerId && supported && (
                <Button className="mt-4" onClick={enableNotifications} disabled={busy}>
                  {busy ? "Setting up…" : "Enable notifications"}
                </Button>
              )}
            </section>

            <section className="rounded-card border border-hairline bg-surface p-5 shadow-card">
              <h2 className="text-[15px] font-semibold text-ink">About</h2>
              <p className="mt-1 text-[13.5px] text-muted">
                Watches are checked every ~15 minutes. Web and mobile keep separate watch lists
                until accounts arrive.
              </p>
              <p className="mt-3 text-[12.5px] text-faint">
                Weather by Open-Meteo · Music data by MusicBrainz · Reverse geocoding by
                BigDataCloud
              </p>
              <a
                href="/privacy"
                className="mt-3 inline-block text-[13px] text-accent underline underline-offset-2"
              >
                Privacy
              </a>
            </section>
          </div>
        )}
      </main>

      <SlideOver open={builderOpen} title="New watch" onClose={() => setBuilderOpen(false)}>
        <WatchForm
          source={source}
          onSourceChange={setSource}
          disabled={!ownerId}
          locationText={locationText}
          onLocationChange={(next) => {
            userTypedRef.current = true;
            setLocationText(next);
            setLocationEdited(true);
          }}
          locationEdited={locationEdited}
          coords={coords}
          locating={locating}
          locationHits={locationHits}
          searchingLocation={searchingLocation}
          onUseCurrentLocation={() => useCurrentLocation({ explicit: true })}
          onPickPlace={(place) => {
            setCoords({ latitude: place.latitude, longitude: place.longitude });
            setLocationText(place.label);
            setLocationEdited(false);
            setLocationHits([]);
          }}
          metric={metric}
          onMetricChange={setMetric}
          comparator={comparator}
          onComparatorChange={setComparator}
          tempUnit={tempUnit}
          onTempUnitChange={switchTempUnit}
          threshold={threshold}
          onThresholdChange={setThreshold}
          thresholdProblem={thresholdProblem}
          artistQuery={artistQuery}
          onArtistQueryChange={setArtistQuery}
          artistHits={artistHits}
          searching={searching}
          noResults={noResults}
          artist={artist}
          onPickArtist={(hit) => {
            setArtist(hit);
            setArtistHits([]);
          }}
          includeSingles={includeSingles}
          onIncludeSinglesChange={setIncludeSingles}
          musicCount={musicCount}
          musicLimit={MUSIC_LIMIT}
          musicFull={musicFull}
          lastRelease={lastRelease}
          loadingRelease={loadingRelease}
          canCreate={canCreate}
          busy={busy}
          onCreate={onCreate}
          onCancel={() => setBuilderOpen(false)}
        />
      </SlideOver>

      <MobileTabBar view={listView} onSelect={setListView} />
    </div>
  );
}
