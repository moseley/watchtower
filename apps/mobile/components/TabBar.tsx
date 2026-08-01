import { Pressable, StyleSheet, Text, View } from "react-native";
import { Bell, Eye, User, type LucideIcon } from "./icons";
import { colors, fonts } from "./theme";

export type ListView = "watches" | "history" | "settings";

const TABS: { view: ListView; label: string; icon: LucideIcon }[] = [
  { view: "watches", label: "Watches", icon: Eye },
  { view: "history", label: "History", icon: Bell },
  { view: "settings", label: "You", icon: User },
];

export function TabBar({
  view,
  onSelect,
}: {
  view: ListView;
  onSelect: (next: ListView) => void;
}) {
  return (
    <View style={styles.bar}>
      {TABS.map(({ view: value, label, icon: Icon }) => {
        const active = view === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(value)}
            style={styles.tab}
          >
            <Icon size={19} color={active ? colors.accent : colors.faint} />
            <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    // Room for the home indicator, per the spec.
    paddingBottom: 18,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    gap: 4,
  },
  label: { fontFamily: fonts.regular, fontSize: 10, color: colors.faint },
  labelActive: { fontFamily: fonts.semibold, color: colors.accent },
});
