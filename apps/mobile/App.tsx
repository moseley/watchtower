import {
  IBMPlexMono_400Regular,
  IBMPlexMono_600SemiBold,
} from "@expo-google-fonts/ibm-plex-mono";
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { WeatherWatchConfigSchema } from "@watchtower/types";
import { useFonts } from "expo-font";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Logo } from "./components/Logo";
import { TabBar, type ListView } from "./components/TabBar";
import { WatchCard } from "./components/WatchCard";
import {
  AudioLines,
  Clapperboard,
  CloudSun,
  Crosshair,
  Info,
  Layers,
  Plus,
  Search,
  X,
  watchIcon,
} from "./components/icons";
import { Button, FieldLabel, SegmentedControl, TextField } from "./components/primitives";
import { cardShadow, colors, fonts, radius } from "./components/theme";
import { timeAgo } from "./components/watch-display";
import {
  createOwner,
  createWatch,
  deleteWatch,
  fetchLatestRelease,
  geocode,
  listNotifications,
  listWatches,
  registerDevice,
  reverseGeocode,
  searchArtists,
  searchPeople,
  type ArtistHit,
  type PersonHit,
  type GeocodeResult,
  type LatestRelease,
  type NotificationRow,
  type WatchRow,
} from "./lib/api";
import { API_URL } from "./lib/config";
import { getExpoPushToken } from "./lib/push";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Source = "weather" | "music" | "screen";
type Metric = "temperature" | "precipitation_probability" | "wind_speed";
type Comparator = "below" | "above";
type SourceFilter = "all" | "weather" | "music" | "screen";

const MUSIC_LIMIT = 5;

/** Cap on waiting for a GPS fix before falling back to the last known one. */
const LOCATION_TIMEOUT_MS = 8000;

type TempUnit = "F" | "C";

/** How many alerts to show at a time before "View more". */
const HISTORY_PAGE = 10;

/** Local identity, so declining notifications doesn't cost the user their watches. */
const OWNER_KEY = "watchtower.ownerId";

/** Roughly the same temperature in each scale, so the default reads sensibly. */
const DEFAULT_THRESHOLD: Record<TempUnit, string> = { F: "85", C: "29" };

const fahrenheitToCelsius = (f: number) => Math.round(((f - 32) * 5) / 9);
const celsiusToFahrenheit = (c: number) => Math.round((c * 9) / 5 + 32);

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "temperature", label: "Temp" },
  { value: "precipitation_probability", label: "Rain %" },
  { value: "wind_speed", label: "Wind" },
];

function daysSince(date: string): number {
  // Date-only, so anchor at midday UTC to avoid a timezone off-by-one.
  const then = new Date(`${date}T12:00:00Z`).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

const METRIC_NAMES: Record<Metric, string> = {
  temperature: "temperature",
  precipitation_probability: "rain",
  wind_speed: "wind",
};

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_600SemiBold,
  });

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [source, setSource] = useState<Source>("weather");
  const [watches, setWatches] = useState<WatchRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [listView, setListView] = useState<ListView>("watches");
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const scrollRef = useRef<ScrollView>(null);
  const [busy, setBusy] = useState(false);
  const [lastPush, setLastPush] = useState<string | null>(null);

  // presentation only — which sources the list shows, and whether the builder
  // sheet is open. Neither touches what is fetched or how a watch is made.
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [builderOpen, setBuilderOpen] = useState(false);

  // weather form
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationText, setLocationText] = useState("");
  const [locationEdited, setLocationEdited] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationHits, setLocationHits] = useState<GeocodeResult[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  // Tracks whether the user has typed a location, so a late-arriving GPS fix
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

  // film & tv form
  const [personQuery, setPersonQuery] = useState("");
  const [personHits, setPersonHits] = useState<PersonHit[]>([]);
  const [searchingPerson, setSearchingPerson] = useState(false);
  const [noPersonResults, setNoPersonResults] = useState(false);
  const [person, setPerson] = useState<PersonHit | null>(null);
  const [includeMinorCredits, setIncludeMinorCredits] = useState(false);

  const musicCount = watches.filter((w) => w.source === "music").length;
  const screenCount = watches.filter((w) => w.source === "screen").length;

  useEffect(() => {
    let received: ReturnType<typeof Notifications.addNotificationReceivedListener> | undefined;
    let tapped: ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | undefined;
    let currentOwner: string | null = null;

    (async () => {
      try {
        // Reuse the stored identity so declining notifications, or reinstalling
        // the token, never orphans the watches already created.
        let id = await AsyncStorage.getItem(OWNER_KEY);

        // Read the existing permission without prompting — the prompt belongs
        // behind the button, not on first launch.
        const push = await getExpoPushToken({ request: false });
        if (push.ok) {
          const platform = Platform.OS === "ios" ? "ios" : "android";
          const reg = await registerDevice(push.token, platform, id ?? undefined);
          id = reg.ownerId;
          setPushEnabled(true);
        } else {
          setPushEnabled(false);
          if (!id) id = (await createOwner()).ownerId;
        }

        if (id) {
          await AsyncStorage.setItem(OWNER_KEY, id);
          currentOwner = id;
          setOwnerId(id);
          setStatus("");
          await refreshWatches(id);
          await refreshNotifications(id);
        }
      } catch (err) {
        setStatus(`Setup failed: ${(err as Error).message}`);
      }

      await useCurrentLocation();

      received = Notifications.addNotificationReceivedListener((n) => {
        const t = n.request.content.title ?? "Notification";
        const b = n.request.content.body ?? "";
        setLastPush(`${t} — ${b}`);
        if (currentOwner) void refreshNotifications(currentOwner);
      });

      // Tapping a notification should land somewhere that explains it.
      tapped = Notifications.addNotificationResponseReceivedListener(() => {
        if (currentOwner) void refreshNotifications(currentOwner);
        setListView("history");
        setHistoryLimit(HISTORY_PAGE);
        setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 200);
      });
    })();

    return () => {
      received?.remove();
      tapped?.remove();
    };
  }, []);

  // Auto-hide the in-app push banner after a few seconds.
  useEffect(() => {
    if (!lastPush) return;
    const timer = setTimeout(() => setLastPush(null), 5000);
    return () => clearTimeout(timer);
  }, [lastPush]);

  async function useCurrentLocation({ explicit = false } = {}) {
    // An explicit tap on the pin means the user wants GPS to win.
    if (explicit) userTypedRef.current = false;
    setLocating(true);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        if (explicit) setStatus("Location permission denied — type a city or zip instead.");
        return;
      }

      // getCurrentPositionAsync has no timeout option and will wait forever if
      // the device can't get a fix, so cap it and fall back to a cached fix.
      const pos =
        (await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
        ])) ?? (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }));

      if (!pos) {
        if (explicit) setStatus("Couldn't get a location fix — type a city or zip instead.");
        return;
      }
      // Don't clobber a location the user typed while we were waiting.
      if (userTypedRef.current) return;

      const { latitude, longitude } = pos.coords;
      setCoords({ latitude, longitude });
      try {
        const place = await reverseGeocode(latitude, longitude);
        setLocationText(place.label);
      } catch {
        setLocationText("Current location");
      }
      setLocationEdited(false);
    } catch {
      if (explicit) setStatus("Couldn't get a location fix — type a city or zip instead.");
    } finally {
      setLocating(false);
    }
  }

  async function refreshWatches(id: string) {
    try {
      setWatches(await listWatches(id));
    } catch {
      // ignore list errors
    }
  }

  /** Ask for notification permission, then attach this device to our identity. */
  async function enableNotifications() {
    setBusy(true);
    try {
      const push = await getExpoPushToken({ request: true });
      if (!push.ok) {
        setStatus(
          push.reason === "denied"
            ? "Notifications are off. Turn them on in Settings › Watchtower › Notifications."
            : (push.message ?? "Couldn't turn on notifications."),
        );
        return;
      }
      const platform = Platform.OS === "ios" ? "ios" : "android";
      const reg = await registerDevice(push.token, platform, ownerId ?? undefined);
      await AsyncStorage.setItem(OWNER_KEY, reg.ownerId);
      setOwnerId(reg.ownerId);
      setPushEnabled(true);
      setStatus("Notifications on");
      await refreshWatches(reg.ownerId);
      await refreshNotifications(reg.ownerId);
    } catch (err) {
      setStatus(`Couldn't turn on notifications: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshNotifications(id: string) {
    try {
      setNotifications(await listNotifications(id));
    } catch {
      // ignore list errors
    }
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
        const hits = await searchArtists(q, controller.signal);
        setArtistHits(hits);
        setNoResults(hits.length === 0);
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

  // Person search, same debounce-and-abort shape as the artist search.
  useEffect(() => {
    const q = personQuery.trim();
    if (source !== "screen" || person || q.length < 2) {
      setPersonHits([]);
      setNoPersonResults(false);
      setSearchingPerson(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchingPerson(true);
      try {
        const hits = await searchPeople(q, controller.signal);
        setPersonHits(hits);
        setNoPersonResults(hits.length === 0);
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // superseded
        setPersonHits([]);
        setStatus(`Search failed: ${(err as Error).message}`);
      } finally {
        if (!controller.signal.aborted) setSearchingPerson(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [personQuery, source, person]);

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
        const hit = await geocode(q, controller.signal);
        setLocationHits(hit.results);
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
        setLastRelease(await fetchLatestRelease(artist.mbid, includeSingles, controller.signal));
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

  async function createWeatherWatch(id: string) {
    let loc: { latitude: number; longitude: number; label: string };
    if (locationEdited || !coords) {
      const query = locationText.trim();
      if (!query) throw new Error("Enter a city or zip code");
      const hit = await geocode(query);
      loc = hit;
      setCoords({ latitude: hit.latitude, longitude: hit.longitude });
      setLocationText(hit.label);
      setLocationEdited(false);
    } else {
      loc = { ...coords, label: locationText.trim() || "Current location" };
    }

    const value = Number(threshold);
    const rule =
      metric === "temperature"
        ? { metric, comparator, threshold: value, unit: tempUnit, withinHours: 12 }
        : metric === "precipitation_probability"
          ? { metric, comparator: "above" as const, threshold: value, withinHours: 6 }
          : {
              metric,
              comparator: "above" as const,
              threshold: value,
              unit: "mph" as const,
              withinHours: 12,
            };

    const config = WeatherWatchConfigSchema.parse({
      location: { latitude: loc.latitude, longitude: loc.longitude, label: loc.label },
      rule,
    });

    await createWatch({
      ownerId: id,
      source: "weather",
      label: `${loc.label} · ${METRIC_NAMES[metric]}`,
      config,
    });
  }

  async function createMusicWatch(id: string) {
    if (!artist) throw new Error("Pick an artist first");
    await createWatch({
      ownerId: id,
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
    });
    setArtist(null);
    setArtistHits([]);
    setArtistQuery("");
  }

  async function createScreenWatch(id: string) {
    if (!person) throw new Error("Pick someone first");
    await createWatch({
      ownerId: id,
      source: "screen",
      label: person.name,
      config: {
        person: {
          tmdbId: person.tmdbId,
          name: person.name,
          ...(person.knownFor ? { knownFor: person.knownFor } : {}),
        },
        includeMinorCredits,
      },
    });
    setPerson(null);
    setPersonHits([]);
    setPersonQuery("");
  }

  async function onCreate() {
    if (!ownerId) return;
    setBusy(true);
    try {
      if (source === "weather") await createWeatherWatch(ownerId);
      else if (source === "screen") await createScreenWatch(ownerId);
      else await createMusicWatch(ownerId);
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
      await deleteWatch(id, ownerId);
      setWatches((rows) => rows.filter((w) => w.id !== id));
    } catch (err) {
      setStatus(`Delete failed: ${(err as Error).message}`);
    }
  }

  const thresholdProblem = thresholdError();
  const musicFull = musicCount >= MUSIC_LIMIT;
  const screenFull = screenCount >= MUSIC_LIMIT;
  // Deliberately not gated on `locating`: a typed city needs no GPS, so a slow
  // or failed fix must never block creating a watch.
  const canCreate =
    Boolean(ownerId) &&
    !busy &&
    (source === "weather"
      ? !thresholdProblem && locationText.trim() !== ""
      : source === "screen"
        ? Boolean(person) && !screenFull
        : Boolean(artist) && !musicFull);

  const counts = {
    all: watches.length,
    weather: watches.filter((w) => w.source === "weather").length,
    music: musicCount,
    screen: screenCount,
  };
  const visibleWatches =
    sourceFilter === "all" ? watches : watches.filter((w) => w.source === sourceFilter);

  const heading =
    listView === "watches" ? "Watches" : listView === "history" ? "History" : "You";

  /** Plain restatement of the rule being built. */
  function rulePreview(): string | null {
    if (source === "music") {
      if (!artist) return null;
      return `You'll be alerted when ${artist.name} releases ${
        includeSingles ? "an album, EP or single" : "an album or EP"
      }.`;
    }
    if (source === "screen") {
      if (!person) return null;
      return includeMinorCredits
        ? `You'll be alerted whenever ${person.name} is credited on anything new.`
        : `You'll be alerted when ${person.name} is attached to a new film or series.`;
    }
    const place = locationText.trim();
    if (!place || thresholdProblem) return null;
    if (metric === "temperature") {
      return `You'll be alerted when the temperature in ${place} goes ${comparator} ${threshold}°${tempUnit}.`;
    }
    if (metric === "precipitation_probability") {
      return `You'll be alerted when the chance of rain in ${place} goes above ${threshold}%.`;
    }
    return `You'll be alerted when wind in ${place} goes above ${threshold} mph.`;
  }

  const preview = rulePreview();

  // Hold the canvas colour while the typefaces load so the app doesn't flash
  // system-font text and then reflow.
  if (!fontsLoaded) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {listView === "watches" && <Logo size={34} />}
            <Text style={styles.title}>{heading}</Text>
          </View>
          {listView === "watches" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New watch"
              onPress={() => {
                setStatus("");
                setBuilderOpen(true);
              }}
              style={styles.addButton}
            >
              <Plus size={19} color="#FFFFFF" />
            </Pressable>
          )}
        </View>

        {lastPush && (
          <View style={styles.pushBanner}>
            <Text style={styles.pushBannerText}>{lastPush}</Text>
          </View>
        )}

        {!pushEnabled && (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Notifications are off</Text>
            <Text style={styles.noticeBody}>
              You can still set up watches — they just won&apos;t reach you until notifications
              are on.
            </Text>
            <Button
              label="Turn on notifications"
              onPress={enableNotifications}
              busy={busy}
              style={styles.noticeButton}
            />
          </View>
        )}

        {status !== "" && <Text style={styles.status}>{status}</Text>}

        {listView === "watches" && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {(
                [
                  { value: "all", label: `All ${counts.all}`, icon: Layers },
                  { value: "weather", label: "Weather", icon: CloudSun },
                  { value: "music", label: "Music", icon: AudioLines },
                  { value: "screen", label: "Film & TV", icon: Clapperboard },
                ] as { value: SourceFilter; label: string; icon: typeof Layers }[]
              ).map(({ value, label, icon: Icon }) => {
                const active = sourceFilter === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setSourceFilter(value)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Icon size={15} color={active ? "#FFFFFF" : colors.ink} />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {visibleWatches.length === 0 ? (
              <Text style={styles.empty}>
                {watches.length === 0 ? "No watches yet." : `No ${sourceFilter} watches yet.`}
              </Text>
            ) : (
              <View style={styles.cardList}>
                {visibleWatches.map((w) => (
                  <WatchCard key={w.id} watch={w} onDelete={onDelete} />
                ))}
              </View>
            )}
          </>
        )}

        {listView === "history" && (
          <View style={styles.cardList}>
            {notifications.length === 0 ? (
              <Text style={styles.empty}>
                No alerts yet. They&apos;ll appear here as your watches fire.
              </Text>
            ) : (
              <>
                {notifications.slice(0, historyLimit).map((n) => {
                  const Icon = watchIcon(n.source, undefined);
                  return (
                    <View key={n.id} style={styles.historyRow}>
                      <Icon size={17} color={colors.faint} />
                      <View style={styles.historyBody}>
                        <Text style={styles.historyText}>{n.body}</Text>
                        <Text style={styles.historyMeta}>
                          {n.watchLabel} · {timeAgo(n.createdAt)}
                          {n.status === "failed" ? " · not delivered" : ""}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                {notifications.length > historyLimit && (
                  <Button
                    variant="ghost"
                    label={`View ${Math.min(HISTORY_PAGE, notifications.length - historyLimit)} more`}
                    onPress={() => setHistoryLimit((n) => n + HISTORY_PAGE)}
                  />
                )}
              </>
            )}
          </View>
        )}

        {listView === "settings" && (
          <View style={styles.cardList}>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Notifications</Text>
              <Text style={styles.panelBody}>
                {pushEnabled
                  ? "This device is registered for alerts."
                  : "Not registered yet — turn them on to start receiving alerts."}
              </Text>
              {!pushEnabled && (
                <Button
                  label="Turn on notifications"
                  onPress={enableNotifications}
                  busy={busy}
                  style={styles.panelButton}
                />
              )}
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>About</Text>
              <Text style={styles.panelBody}>
                Watches are checked every ~15 minutes. Web and mobile keep separate watch lists
                until accounts arrive.
              </Text>
              <Text style={styles.credits}>
                Weather by Open-Meteo · Music data by MusicBrainz · Reverse geocoding by
                BigDataCloud · Film & TV data by TMDB
              </Text>
              {/* TMDB's terms require stating this explicitly. */}
              <Text style={styles.credits}>
                This product uses the TMDB API but is not endorsed or certified by TMDB.
              </Text>
              <Text style={styles.link} onPress={() => Linking.openURL(`${API_URL}/privacy`)}>
                Privacy
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <TabBar view={listView} onSelect={setListView} />

      <Modal
        visible={builderOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setBuilderOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setBuilderOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>New watch</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setBuilderOpen(false)}
              hitSlop={8}
            >
              <X size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetBody}
            keyboardShouldPersistTaps="handled"
          >
            {/* Source picker */}
            <View style={styles.sourceGrid}>
              {(
                [
                  { value: "weather", label: "Weather", icon: CloudSun },
                  { value: "music", label: "Music", icon: AudioLines },
                  { value: "screen", label: "Film & TV", icon: Clapperboard },
                ] as { value: Source; label: string; icon: typeof CloudSun }[]
              ).map(({ value, label, icon: Icon }) => {
                const selected = source === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setSource(value)}
                    style={[styles.sourceTile, selected && styles.sourceTileSelected]}
                  >
                    <Icon size={17} color={selected ? colors.accent : colors.ink} />
                    <Text style={[styles.sourceLabel, selected && styles.sourceLabelSelected]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {source === "weather" ? (
              <>
                <View style={styles.field}>
                  <FieldLabel>Location</FieldLabel>
                  <View style={styles.row}>
                    <View style={styles.inputWithIcon}>
                      <Search size={16} color={colors.faint} style={styles.inputIcon} />
                      <TextField
                        value={locationText}
                        onChangeText={(text) => {
                          userTypedRef.current = true;
                          setLocationText(text);
                          setLocationEdited(true);
                        }}
                        placeholder="City or zip code"
                        style={styles.inputPadded}
                      />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Use my location"
                      onPress={() => useCurrentLocation({ explicit: true })}
                      disabled={locating}
                      style={styles.locateButton}
                    >
                      {locating ? (
                        <ActivityIndicator size="small" color={colors.muted} />
                      ) : (
                        <Crosshair size={17} color={colors.muted} />
                      )}
                    </Pressable>
                  </View>

                  {coords && !locationEdited && (
                    <Text style={styles.hint}>
                      Using {coords.latitude.toFixed(3)}, {coords.longitude.toFixed(3)}
                    </Text>
                  )}

                  {locationEdited &&
                    locationHits.map((place) => (
                      <Pressable
                        key={`${place.latitude},${place.longitude}`}
                        style={styles.suggestion}
                        onPress={() => {
                          setCoords({ latitude: place.latitude, longitude: place.longitude });
                          setLocationText(place.label);
                          setLocationEdited(false);
                          setLocationHits([]);
                        }}
                      >
                        <Text style={styles.suggestionText}>{place.label}</Text>
                      </Pressable>
                    ))}

                  {locationEdited && locationHits.length === 0 && (
                    <Text style={styles.hint}>
                      {searchingLocation
                        ? "Looking up…"
                        : locationText.trim().length < 2
                          ? "Type a city or zip code"
                          : "No match yet — the closest one is used when you create the watch"}
                    </Text>
                  )}
                </View>

                <View style={styles.field}>
                  <FieldLabel>Metric</FieldLabel>
                  <SegmentedControl
                    options={METRIC_OPTIONS}
                    value={metric}
                    onChange={setMetric}
                  />
                </View>

                {metric === "temperature" && (
                  <View style={styles.field}>
                    <FieldLabel>Alert me when it goes</FieldLabel>
                    <View style={styles.row}>
                      {(["below", "above"] as Comparator[]).map((option) => {
                        const selected = comparator === option;
                        return (
                          <Pressable
                            key={option}
                            onPress={() => setComparator(option)}
                            style={[styles.choice, selected && styles.choiceSelected]}
                          >
                            <Text
                              style={[styles.choiceText, selected && styles.choiceTextSelected]}
                            >
                              {option === "below" ? "Below" : "Above"}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                <View style={styles.field}>
                  <FieldLabel>Threshold</FieldLabel>
                  <View style={styles.row}>
                    <View style={styles.flex1}>
                      <TextField
                        value={threshold}
                        onChangeText={setThreshold}
                        keyboardType="numeric"
                        placeholder={metric === "temperature" ? "85" : "60"}
                        invalid={Boolean(thresholdProblem)}
                      />
                    </View>
                    {metric === "temperature" && (
                      <View style={styles.unitToggle}>
                        <SegmentedControl
                          options={[
                            { value: "F" as TempUnit, label: "°F" },
                            { value: "C" as TempUnit, label: "°C" },
                          ]}
                          value={tempUnit}
                          onChange={switchTempUnit}
                        />
                      </View>
                    )}
                  </View>
                  {thresholdProblem && <Text style={styles.error}>{thresholdProblem}</Text>}
                </View>
              </>
            ) : source === "screen" ? (
              <>
                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <FieldLabel>Actor or director</FieldLabel>
                    <Text style={styles.counter}>
                      {screenCount} / {MUSIC_LIMIT}
                    </Text>
                  </View>

                  {person ? (
                    <View style={styles.selectedArtist}>
                      <Clapperboard size={17} color={colors.accent} />
                      <View style={styles.flex1}>
                        <Text style={styles.selectedArtistName}>{person.name}</Text>
                        {person.knownForTitles.length > 0 && (
                          <Text style={styles.hint} numberOfLines={1}>
                            {person.knownForTitles.join(" · ")}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.changeLink} onPress={() => setPerson(null)}>
                        change
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.inputWithIcon}>
                        <Search size={16} color={colors.faint} style={styles.inputIcon} />
                        <TextField
                          value={personQuery}
                          onChangeText={setPersonQuery}
                          placeholder="Start typing a name…"
                          style={styles.inputPadded}
                        />
                      </View>
                      {personHits.map((hit) => (
                        <Pressable
                          key={hit.tmdbId}
                          style={styles.suggestion}
                          onPress={() => {
                            setPerson(hit);
                            setPersonHits([]);
                          }}
                        >
                          <Text style={styles.suggestionText}>{hit.name}</Text>
                          <Text style={styles.hint} numberOfLines={1}>
                            {[hit.knownFor, ...hit.knownForTitles].filter(Boolean).join(" · ") ||
                              "person"}
                          </Text>
                        </Pressable>
                      ))}
                      {(searchingPerson || noPersonResults) && (
                        <Text style={styles.hint}>
                          {searchingPerson
                            ? "Searching…"
                            : `No people found for "${personQuery.trim()}"`}
                        </Text>
                      )}
                    </>
                  )}
                </View>

                <View style={styles.switchRow}>
                  <Switch
                    value={includeMinorCredits}
                    onValueChange={setIncludeMinorCredits}
                    trackColor={{ true: colors.accent, false: colors.hairlineStrong }}
                    thumbColor="#FFFFFF"
                  />
                  <Text style={styles.switchLabel}>Include documentaries & minor credits</Text>
                </View>
                <Text style={styles.hint}>
                  Off by default: talk shows, behind-the-scenes featurettes and courtesy credits
                  are where most of the noise comes from.
                </Text>

                {screenFull && (
                  <Text style={styles.warning}>
                    You&apos;re watching {MUSIC_LIMIT} people — delete one to add another.
                  </Text>
                )}
              </>
            ) : (
              <>
                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <FieldLabel>Artist or band</FieldLabel>
                    <Text style={styles.counter}>
                      {musicCount} / {MUSIC_LIMIT}
                    </Text>
                  </View>

                  {artist ? (
                    <View style={styles.selectedArtist}>
                      <AudioLines size={17} color={colors.accent} />
                      <View style={styles.flex1}>
                        <Text style={styles.selectedArtistName}>{artist.name}</Text>
                        {artist.disambiguation && (
                          <Text style={styles.hint}>{artist.disambiguation}</Text>
                        )}
                      </View>
                      <Text style={styles.changeLink} onPress={() => setArtist(null)}>
                        change
                      </Text>
                    </View>
                  ) : null}

                  {artist && (
                    <Text style={styles.hint}>
                      {loadingRelease
                        ? "Checking their last release…"
                        : lastRelease
                          ? `Last release: ${lastRelease.title} — ${daysSince(lastRelease.date)} days ago`
                          : "No dated release found for them yet"}
                    </Text>
                  )}

                  {!artist && (
                    <>
                      <View style={styles.inputWithIcon}>
                        <Search size={16} color={colors.faint} style={styles.inputIcon} />
                        <TextField
                          value={artistQuery}
                          onChangeText={setArtistQuery}
                          placeholder="Start typing a name…"
                          style={styles.inputPadded}
                        />
                      </View>
                      {artistHits.map((hit) => (
                        <Pressable
                          key={hit.mbid}
                          style={styles.suggestion}
                          onPress={() => {
                            setArtist(hit);
                            setArtistHits([]);
                          }}
                        >
                          <Text style={styles.suggestionText}>{hit.name}</Text>
                          <Text style={styles.hint}>
                            {[hit.disambiguation, hit.type, hit.country]
                              .filter(Boolean)
                              .join(" · ") || "artist"}
                          </Text>
                        </Pressable>
                      ))}
                      {(searching || noResults) && (
                        <Text style={styles.hint}>
                          {searching
                            ? "Searching…"
                            : `No artists found for "${artistQuery.trim()}"`}
                        </Text>
                      )}
                    </>
                  )}
                </View>

                <View style={styles.switchRow}>
                  <Switch
                    value={includeSingles}
                    onValueChange={setIncludeSingles}
                    trackColor={{ true: colors.accent, false: colors.hairlineStrong }}
                    thumbColor="#FFFFFF"
                  />
                  <Text style={styles.switchLabel}>Include singles</Text>
                </View>
                <Text style={styles.hint}>
                  Albums and EPs are always included. Singles can be frequent for busy artists.
                </Text>

                {musicFull && (
                  <Text style={styles.warning}>
                    You&apos;re watching {MUSIC_LIMIT} artists — delete one to add another.
                  </Text>
                )}
              </>
            )}

            {preview && (
              <View style={styles.preview}>
                <Info size={16} color={colors.faint} />
                <Text style={styles.previewText}>{preview}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <Button variant="ghost" label="Cancel" onPress={() => setBuilderOpen(false)} />
            <Button
              label="Create watch"
              onPress={onCreate}
              disabled={!canCreate}
              busy={busy}
              style={styles.flex1}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, paddingTop: 64, paddingBottom: 32, gap: 16 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontFamily: fonts.bold, fontSize: 26, letterSpacing: -0.8, color: colors.ink },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: radius.control,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  pushBanner: {
    backgroundColor: colors.accentTint,
    borderRadius: radius.control,
    padding: 14,
  },
  pushBannerText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.accent },

  noticeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 18,
    ...cardShadow,
  },
  noticeTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  noticeBody: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.muted, marginTop: 4 },
  noticeButton: { marginTop: 14 },

  status: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },

  chipRow: { gap: 8, paddingRight: 20 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  chipTextActive: { color: "#FFFFFF" },

  cardList: { gap: 12 },
  empty: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },

  historyRow: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 16,
    ...cardShadow,
  },
  historyBody: { flex: 1 },
  historyText: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  historyMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint, marginTop: 4 },

  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 18,
    ...cardShadow,
  },
  panelTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  panelBody: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.muted, marginTop: 4 },
  panelButton: { marginTop: 14 },
  credits: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.faint, marginTop: 12 },
  link: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.accent,
    marginTop: 12,
    textDecorationLine: "underline",
  },

  backdrop: { flex: 1, backgroundColor: "rgba(20,24,26,0.25)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "92%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: colors.hairline,
    paddingTop: 20,
    paddingBottom: 28,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.4, color: colors.ink },
  sheetBody: { paddingHorizontal: 20, paddingBottom: 16, gap: 18 },
  sheetFooter: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },

  sourceGrid: { flexDirection: "row", gap: 10 },
  sourceTile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  sourceTileSelected: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentTint,
  },
  sourceLabel: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  sourceLabelSelected: { fontFamily: fonts.semibold, color: colors.accent },

  field: { gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  counter: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  flex1: { flex: 1 },
  inputWithIcon: { flex: 1, justifyContent: "center" },
  inputIcon: { position: "absolute", left: 12, zIndex: 1 },
  inputPadded: { paddingLeft: 36 },
  locateButton: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.faint },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.danger },
  warning: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.warning },

  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.sidebar,
  },
  suggestionText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.ink },

  choice: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.control,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  choiceSelected: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentTint,
  },
  choiceText: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  choiceTextSelected: { fontFamily: fonts.semibold, color: colors.accent },

  unitToggle: { width: 104 },

  selectedArtist: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentTint,
  },
  selectedArtistName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },
  changeLink: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.muted },

  switchRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  switchLabel: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },

  preview: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: radius.control,
    backgroundColor: colors.sidebar,
  },
  previewText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
});
