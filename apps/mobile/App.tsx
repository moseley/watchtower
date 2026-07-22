import { WeatherWatchConfigSchema } from "@watchtower/types";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
  type WatchRow,
} from "./lib/api";
import { registerForPushNotificationsAsync } from "./lib/push";

type Metric = "temperature" | "precipitation_probability" | "wind_speed";
type Comparator = "below" | "above";

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

export default function App() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting…");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationText, setLocationText] = useState("");
  const [locationEdited, setLocationEdited] = useState(false);
  const [locating, setLocating] = useState(false);
  const [metric, setMetric] = useState<Metric>("temperature");
  const [comparator, setComparator] = useState<Comparator>("below");
  const [threshold, setThreshold] = useState("35");
  const [watches, setWatches] = useState<WatchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastPush, setLastPush] = useState<string | null>(null);

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

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({});
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
      // location optional — user can type a city/zip instead
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
      // Resolve the location: geocode typed input, or reuse GPS coords.
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
            : { metric, comparator: "above" as const, threshold: value, unit: "mph" as const, withinHours: 12 };

      const config = WeatherWatchConfigSchema.parse({
        location: { latitude: loc.latitude, longitude: loc.longitude, label: loc.label },
        rule,
      });

      await createWatch({
        ownerId,
        source: "weather",
        label: `${loc.label} · ${METRIC_NAMES[metric]}`,
        config,
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
      await deleteWatch(id, ownerId);
      setWatches((rows) => rows.filter((w) => w.id !== id));
    } catch (err) {
      setStatus(`Delete failed: ${(err as Error).message}`);
    }
  }

  const thresholdProblem = thresholdError();
  const canCreate =
    Boolean(ownerId) && !busy && !locating && !thresholdProblem && locationText.trim() !== "";

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Watchtower</Text>
        <Text style={styles.subtitle}>{status}</Text>

        {lastPush && (
          <View style={styles.pushBanner}>
            <Text style={styles.pushBannerText}>🔔 {lastPush}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>New weather watch</Text>

          <Text style={styles.fieldLabel}>Location (city or zip code)</Text>
          <View style={styles.locationRow}>
            <TextInput
              style={[styles.input, styles.locationInput]}
              value={locationText}
              onChangeText={(text) => {
                setLocationText(text);
                setLocationEdited(true);
              }}
              placeholder="e.g. Honolulu or 96815"
              placeholderTextColor="#475569"
            />
            <Pressable
              style={styles.locateButton}
              onPress={useCurrentLocation}
              disabled={locating}
            >
              {locating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.locateIcon}>📍</Text>}
            </Pressable>
          </View>
          {coords && !locationEdited && (
            <Text style={styles.hint}>
              Using {coords.latitude.toFixed(3)}, {coords.longitude.toFixed(3)}
            </Text>
          )}
          {locationEdited && <Text style={styles.hint}>Will look up this location on create</Text>}

          <Text style={styles.fieldLabel}>Metric</Text>
          <View style={styles.chipRow}>
            {METRICS.map((m) => (
              <Chip key={m.key} label={m.label} active={metric === m.key} onPress={() => setMetric(m.key)} />
            ))}
          </View>

          {metric === "temperature" && (
            <>
              <Text style={styles.fieldLabel}>When it goes</Text>
              <View style={styles.chipRow}>
                <Chip label="❄️ Below" active={comparator === "below"} onPress={() => setComparator("below")} />
                <Chip label="☀️ Above" active={comparator === "above"} onPress={() => setComparator("above")} />
              </View>
            </>
          )}

          <Text style={styles.fieldLabel}>
            Threshold {metric === "temperature" ? "(°F)" : metric === "wind_speed" ? "(mph)" : "(0–100 %)"}
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
              <Text style={styles.watchIcon}>{iconFor(w.config.rule)}</Text>
              <View style={styles.watchBody}>
                <Text style={styles.watchLabel}>{w.config.location?.label ?? w.label}</Text>
                <Text style={styles.watchMeta}>
                  {w.config.rule?.metric?.replace(/_/g, " ")} {w.config.rule?.comparator}{" "}
                  {w.config.rule?.threshold}
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
  title: { fontSize: 32, fontWeight: "800", color: "#fff" },
  subtitle: { fontSize: 14, color: "#94A3B8", marginTop: 4, marginBottom: 16 },
  pushBanner: {
    backgroundColor: "#1D4ED8",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  pushBannerText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  card: { backgroundColor: "#1E293B", borderRadius: 16, padding: 18 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 12 },
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
  locateButton: {
    backgroundColor: "#334155",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  locateIcon: { fontSize: 18 },
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
  errorHint: { color: "#F87171", fontSize: 12, marginTop: 6 },
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
