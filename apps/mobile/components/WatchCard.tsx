import { Pressable, StyleSheet, Text, View } from "react-native";
import type { WatchRow } from "../lib/api";
import { Trash2, watchIcon } from "./icons";
import { IconChip, StatusBadge, ThresholdBar } from "./primitives";
import { cardShadow, colors, fonts, radius } from "./theme";
import { describeRule, describeWatch, watchTitle } from "./watch-display";

/**
 * Leads with the current value against the threshold, per the Atlas spec.
 * `current` is optional: with no reading available the card keeps its shape
 * and shows an honest blank rather than a stand-in number.
 */
export function WatchCard({
  watch,
  current,
  onDelete,
}: {
  watch: WatchRow;
  current?: number;
  onDelete: (id: string) => void;
}) {
  const { firing, value, delta, fill } = describeWatch(watch, current);
  const Icon = watchIcon(watch.source, watch.config.rule?.metric);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <IconChip icon={Icon} active={firing} />
          <View style={styles.identityText}>
            <Text style={styles.title} numberOfLines={1}>
              {watchTitle(watch)}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {describeRule(watch)}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <StatusBadge firing={firing} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete watch for ${watchTitle(watch)}`}
            onPress={() => onDelete(watch.id)}
            hitSlop={8}
            style={styles.delete}
          >
            <Trash2 size={15} color={colors.faint} />
          </Pressable>
        </View>
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, !value && styles.valueEmpty]}>{value ?? "—"}</Text>
        <Text style={styles.delta}>{delta}</Text>
      </View>

      <ThresholdBar fill={fill} firing={firing} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 18,
    gap: 14,
    ...cardShadow,
  },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  identity: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  identityText: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted, marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  delete: { padding: 6 },

  valueRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  // 36px on mobile per the type scale.
  value: { fontFamily: fonts.bold, fontSize: 36, letterSpacing: -1.4, color: colors.ink },
  valueEmpty: { color: colors.neutralBar },
  delta: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted, paddingBottom: 4, flexShrink: 1, textAlign: "right" },
});
