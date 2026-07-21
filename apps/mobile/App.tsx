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
import { createWatch, listWatches, registerDevice, type WatchRow } from "./lib/api";
import { registerForPushNotificationsAsync } from "./lib/push";

type Metric = "temperature" | "precipitation_probability" | "wind_speed";
type Comparator = "below" | "above";

const METRICS: { key: Metric; label: string }[] = [
  { key: "temperature", label: "Temperature" },
  { key: "precipitation_probability", label: "Rain %" },
  { key: "wind_speed", label: "Wind" },
];

export default function App() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting…");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [placeLabel, setPlaceLabel] = useState("Home");
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

      try {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (perm === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }
      } catch {
        // location optional
      }

      sub = Notifications.addNotificationReceivedListener((n) => {
        const t = n.request.content.title ?? "Notification";
        const b = n.request.content.body ?? "";
        setLastPush(`${t} — ${b}`);
      });
    })();

    return () => sub?.remove();
  }, []);

  async function refreshWatches(id: string) {
    try {
      setWatches(await listWatches(id));
    } catch {
      // ignore list errors
    }
  }

  async function onCreate() {
    if (!ownerId || !coords) return;
    setBusy(true);
    try {
      const value = Number(threshold);
      const rule =
        metric === "temperature"
          ? { metric, comparator, threshold: value, unit: "F" as const, withinHours: 12 }
          : metric === "precipitation_probability"
            ? { metric, comparator: "above" as const, threshold: value, withinHours: 6 }
            : { metric, comparator: "above" as const, threshold: value, unit: "mph" as const, withinHours: 12 };

      const config = WeatherWatchConfigSchema.parse({
        location: { latitude: coords.latitude, longitude: coords.longitude, label: placeLabel },
        rule,
      });

      await createWatch({
        ownerId,
        source: "weather",
        label: `${placeLabel} · ${metric.replace("_", " ")}`,
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

  const canCreate = Boolean(ownerId && coords) && !busy && threshold.trim() !== "";

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

          <Text style={styles.fieldLabel}>Label</Text>
          <TextInput
            style={styles.input}
            value={placeLabel}
            onChangeText={setPlaceLabel}
            placeholder="Home"
          />

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
                <Chip label="Below" active={comparator === "below"} onPress={() => setComparator("below")} />
                <Chip label="Above" active={comparator === "above"} onPress={() => setComparator("above")} />
              </View>
            </>
          )}

          <Text style={styles.fieldLabel}>
            Threshold {metric === "temperature" ? "(°F)" : metric === "wind_speed" ? "(mph)" : "(%)"}
          </Text>
          <TextInput
            style={styles.input}
            value={threshold}
            onChangeText={setThreshold}
            keyboardType="numeric"
            placeholder="35"
          />

          <Text style={styles.hint}>
            {coords
              ? `Location: ${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}`
              : "Waiting for location permission…"}
          </Text>

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
              <Text style={styles.watchLabel}>{w.label}</Text>
              <Text style={styles.watchMeta}>
                {w.config.rule?.metric} {w.config.rule?.comparator} {w.config.rule?.threshold}
              </Text>
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
  hint: { color: "#64748B", fontSize: 12, marginTop: 12 },
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
  },
  watchLabel: { color: "#fff", fontSize: 15, fontWeight: "600" },
  watchMeta: { color: "#94A3B8", fontSize: 13, marginTop: 4 },
});
