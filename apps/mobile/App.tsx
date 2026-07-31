import { WeatherWatchConfigSchema } from "@watchtower/types";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createWatch,
  deleteWatch,
  geocode,
  listWatches,
  registerDevice,
  reverseGeocode,
  searchArtists,
  type ArtistHit,
  type GeocodeResult,
  type WatchRow,
} from "./lib/api";
import { registerForPushNotificationsAsync } from "./lib/push";
import { Logo } from "./components/Logo";

type Source = "weather" | "music";
type Metric = "temperature" | "precipitation_probability" | "wind_speed";
type Comparator = "below" | "above";

const MUSIC_LIMIT = 5;

/** Cap on waiting for a GPS fix before falling back to the last known one. */
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

export default function App() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting…");
  const [source, setSource] = useState<Source>("weather");
  const [watches, setWatches] = useState<WatchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastPush, setLastPush] = useState<string | null>(null);

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
  const [threshold, setThreshold] = useState("35");

  // music form
  const [artistQuery, setArtistQuery] = useState("");
  const [artistHits, setArtistHits] = useState<ArtistHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [artist, setArtist] = useState<ArtistHit | null>(null);
  const [includeSingles, setIncludeSingles] = useState(false);

  const musicCount = watches.filter((w) => w.source === "music").length;

  useEffect(() => {
    let sub: ReturnType<typeof Notifications.addNotificationReceivedListener> | undefined;

    (async () => {
      try {
        setStatus("Registering for notifications…");
        const token = await registerForPushNotificationsAsync();
        const platform = Platform.OS === "ios" ? "ios" : "android";
        const reg = await registerDevice(token, platform);
        setOwnerId(reg.ownerId);
        setStatus("Registered ✓");
        await refreshWatches(reg.ownerId);
      } catch (err) {
        setStatus(`Setup failed: ${(err as Error).message}`);
      }

      await useCurrentLocation();

      sub = Notifications.addNotificationReceivedListener((n) => {
        const t = n.request.content.title ?? "Notification";
        const b = n.request.content.body ?? "";
        setLastPush(`${t} — ${b}`);
      });
    })();

    return () => sub?.remove();
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
        ? { metric, comparator, threshold: value, unit: "F" as const, withinHours: 12 }
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

  async function onCreate() {
    if (!ownerId) return;
    setBusy(true);
    try {
      if (source === "weather") await createWeatherWatch(ownerId);
      else await createMusicWatch(ownerId);
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
      await deleteWatch(id, ownerId);
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

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Logo size={52} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Watchtower</Text>
            <Text style={styles.subtitle}>{status}</Text>
          </View>
        </View>

        {lastPush && (
          <View style={styles.pushBanner}>
            <Text style={styles.pushBannerText}>🔔 {lastPush}</Text>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.tabRow}>
            <Tab
              label="🌤️ Weather"
              active={source === "weather"}
              onPress={() => setSource("weather")}
            />
            <Tab label="🎤 Music" active={source === "music"} onPress={() => setSource("music")} />
          </View>

          {source === "weather" ? (
            <>
              <Text style={styles.fieldLabel}>Location (city or zip code)</Text>
              <View style={styles.locationRow}>
                <TextInput
                  style={[styles.input, styles.locationInput]}
                  value={locationText}
                  onChangeText={(text) => {
                    userTypedRef.current = true;
                    setLocationText(text);
                    setLocationEdited(true);
                  }}
                  placeholder="e.g. Honolulu or 96815"
                  placeholderTextColor="#475569"
                />
                <Pressable
                  style={styles.iconButton}
                  onPress={() => useCurrentLocation({ explicit: true })}
                  disabled={locating}
                >
                  {locating ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.iconButtonText}>📍</Text>
                  )}
                </Pressable>
              </View>
              {coords && !locationEdited && (
                <Text style={styles.confirmedHint}>
                  ✓ {locationText} ({coords.latitude.toFixed(3)}, {coords.longitude.toFixed(3)})
                </Text>
              )}
              {locationEdited &&
                locationHits.map((place) => (
                  <Pressable
                    key={`${place.latitude},${place.longitude}`}
                    style={styles.hitRow}
                    onPress={() => {
                      setCoords({ latitude: place.latitude, longitude: place.longitude });
                      setLocationText(place.label);
                      setLocationEdited(false);
                      setLocationHits([]);
                    }}
                  >
                    <Text style={styles.watchIcon}>📍</Text>
                    <View style={styles.watchBody}>
                      <Text style={styles.hitName}>{place.label}</Text>
                    </View>
                    <Text style={styles.watchMeta}>select</Text>
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

              <Text style={styles.fieldLabel}>Metric</Text>
              <View style={styles.chipRow}>
                {METRICS.map((m) => (
                  <Chip
                    key={m.key}
                    label={m.label}
                    active={metric === m.key}
                    onPress={() => setMetric(m.key)}
                  />
                ))}
              </View>

              {metric === "temperature" && (
                <>
                  <Text style={styles.fieldLabel}>When it goes</Text>
                  <View style={styles.chipRow}>
                    <Chip
                      label="❄️ Below"
                      active={comparator === "below"}
                      onPress={() => setComparator("below")}
                    />
                    <Chip
                      label="☀️ Above"
                      active={comparator === "above"}
                      onPress={() => setComparator("above")}
                    />
                  </View>
                </>
              )}

              <Text style={styles.fieldLabel}>
                Threshold{" "}
                {metric === "temperature" ? "(°F)" : metric === "wind_speed" ? "(mph)" : "(0–100 %)"}
              </Text>
              <TextInput
                style={[styles.input, thresholdProblem ? styles.inputError : null]}
                value={threshold}
                onChangeText={setThreshold}
                keyboardType="numeric"
                placeholder="35"
                placeholderTextColor="#475569"
              />
              {thresholdProblem && <Text style={styles.errorHint}>{thresholdProblem}</Text>}
            </>
          ) : (
            <>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Search for an artist or band</Text>
                <Text style={styles.counter}>
                  {musicCount} / {MUSIC_LIMIT} watched
                </Text>
              </View>
              <View style={styles.searchWrap}>
                <TextInput
                  style={[styles.input, styles.searchInput]}
                  value={artistQuery}
                  onChangeText={setArtistQuery}
                  autoCorrect={false}
                  autoCapitalize="words"
                  returnKeyType="search"
                  placeholder="Start typing a name…"
                  placeholderTextColor="#475569"
                />
                {searching && (
                  <ActivityIndicator style={styles.searchSpinner} color="#60A5FA" size="small" />
                )}
              </View>
              {noResults && !artist && (
                <Text style={styles.hint}>No artists found for &ldquo;{artistQuery.trim()}&rdquo;.</Text>
              )}

              {artist ? (
                <View style={styles.selectedArtist}>
                  <Text style={styles.watchIcon}>🎤</Text>
                  <View style={styles.watchBody}>
                    <Text style={styles.watchLabel}>{artist.name}</Text>
                    {artist.disambiguation && (
                      <Text style={styles.watchMeta}>{artist.disambiguation}</Text>
                    )}
                  </View>
                  <Pressable onPress={() => setArtist(null)}>
                    <Text style={styles.changeLink}>change</Text>
                  </Pressable>
                </View>
              ) : (
                artistHits.map((a) => (
                  <Pressable
                    key={a.mbid}
                    style={styles.hitRow}
                    onPress={() => {
                      setArtist(a);
                      setArtistHits([]);
                    }}
                  >
                    <View style={styles.watchBody}>
                      <Text style={styles.hitName}>{a.name}</Text>
                      <Text style={styles.watchMeta}>
                        {[a.disambiguation, a.type, a.country].filter(Boolean).join(" · ") ||
                          "artist"}
                      </Text>
                    </View>
                    <Text style={styles.watchMeta}>select</Text>
                  </Pressable>
                ))
              )}

              <View style={styles.switchRow}>
                <Switch
                  value={includeSingles}
                  onValueChange={setIncludeSingles}
                  trackColor={{ true: "#2563EB", false: "#334155" }}
                  thumbColor="#fff"
                />
                <Text style={styles.switchLabel}>Include singles</Text>
              </View>
              <Text style={styles.hint}>
                Albums and EPs are always included. Singles can be frequent for busy artists.
              </Text>

              {musicFull && (
                <Text style={styles.warnHint}>
                  You&apos;re watching {MUSIC_LIMIT} artists — delete one to add another.
                </Text>
              )}
            </>
          )}

          <Pressable
            style={[styles.button, !canCreate && styles.buttonDisabled]}
            onPress={onCreate}
            disabled={!canCreate}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create watch</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Your watches ({watches.length})</Text>
        {watches.length === 0 ? (
          <Text style={styles.empty}>No watches yet.</Text>
        ) : (
          watches.map((w) => (
            <View key={w.id} style={styles.watchRow}>
              <Text style={styles.watchIcon}>{iconFor(w)}</Text>
              <View style={styles.watchBody}>
                <Text style={styles.watchLabel}>
                  {w.source === "music"
                    ? (w.config.artist?.name ?? w.label)
                    : (w.config.location?.label ?? w.label)}
                </Text>
                <Text style={styles.watchMeta}>
                  {w.source === "music"
                    ? w.config.includeSingles
                      ? "new albums, EPs & singles"
                      : "new albums & EPs"
                    : `${w.config.rule?.metric?.replace(/_/g, " ")} ${w.config.rule?.comparator} ${w.config.rule?.threshold}`}
                </Text>
              </View>
              <Pressable style={styles.deleteButton} onPress={() => onDelete(w.id)}>
                <Text style={styles.deleteIcon}>🗑️</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F172A" },
  content: { padding: 20, paddingTop: 64, paddingBottom: 48 },
  header: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 16 },
  headerText: { flex: 1 },
  title: { fontSize: 32, fontWeight: "800", color: "#fff" },
  subtitle: { fontSize: 14, color: "#94A3B8", marginTop: 4 },
  pushBanner: { backgroundColor: "#1D4ED8", borderRadius: 12, padding: 14, marginBottom: 16 },
  pushBannerText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  card: { backgroundColor: "#1E293B", borderRadius: 16, padding: 18 },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  tabActive: { backgroundColor: "#334155" },
  tabText: { color: "#64748B", fontWeight: "700", fontSize: 14 },
  tabTextActive: { color: "#fff" },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  counter: { fontSize: 12, color: "#64748B", marginTop: 12, marginBottom: 6 },
  fieldLabel: { fontSize: 13, color: "#94A3B8", marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: "#0F172A",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 16,
  },
  inputError: { borderWidth: 1, borderColor: "#F87171" },
  locationRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  locationInput: { flex: 1 },
  searchWrap: { position: "relative", justifyContent: "center" },
  searchInput: { paddingRight: 44 },
  searchSpinner: { position: "absolute", right: 14 },
  iconButton: {
    backgroundColor: "#334155",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonText: { fontSize: 18 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
  },
  chipActive: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  chipText: { color: "#94A3B8", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  hint: { color: "#64748B", fontSize: 12, marginTop: 8 },
  confirmedHint: { color: "#4ADE80", fontSize: 12, marginTop: 8 },
  warnHint: { color: "#FBBF24", fontSize: 12, marginTop: 10 },
  errorHint: { color: "#F87171", fontSize: 12, marginTop: 6 },
  selectedArtist: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#172554",
  },
  hitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#0F172A",
  },
  hitName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  changeLink: { color: "#94A3B8", fontSize: 13 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  switchLabel: { color: "#E2E8F0", fontSize: 15 },
  button: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 18,
  },
  buttonDisabled: { backgroundColor: "#334155" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#fff", marginTop: 28, marginBottom: 10 },
  empty: { color: "#64748B" },
  watchRow: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  watchIcon: { fontSize: 22 },
  watchBody: { flex: 1 },
  watchLabel: { color: "#fff", fontSize: 15, fontWeight: "600" },
  watchMeta: { color: "#94A3B8", fontSize: 13, marginTop: 4 },
  deleteButton: { padding: 6 },
  deleteIcon: { fontSize: 18 },
});
