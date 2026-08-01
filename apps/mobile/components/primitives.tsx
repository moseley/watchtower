import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";
import { cardShadow, colors, fonts, radius } from "./theme";

export function StatusBadge({ firing }: { firing: boolean }) {
  return (
    <View style={[styles.badge, firing ? styles.badgeFiring : styles.badgeIdle]}>
      <Text style={[styles.badgeText, firing && styles.badgeTextFiring]}>
        {firing ? "FIRING" : "WATCHING"}
      </Text>
    </View>
  );
}

export function ThresholdBar({ fill, firing }: { fill: number; firing: boolean }) {
  const pct = `${Math.max(0, Math.min(1, fill)) * 100}%` as const;
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.trackFill,
          { width: pct, backgroundColor: firing ? colors.accent : colors.neutralBar },
        ]}
      />
    </View>
  );
}

export function IconChip({
  icon: Icon,
  active,
  size = 34,
  iconSize = 17,
}: {
  icon: LucideIcon;
  active?: boolean;
  size?: number;
  iconSize?: number;
}) {
  return (
    <View
      style={[
        styles.iconChip,
        {
          width: size,
          height: size,
          backgroundColor: active ? colors.accentTint : colors.chipIdle,
        },
      ]}
    >
      <Icon size={iconSize} color={active ? colors.accent : colors.muted} />
    </View>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.segmentTrack}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function TextField({
  invalid,
  style,
  ...props
}: TextInputProps & { invalid?: boolean }) {
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      {...props}
      style={[styles.input, invalid && styles.inputInvalid, style]}
    />
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  style?: object;
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonGhost,
        (disabled || busy) && (primary ? styles.buttonPrimaryDisabled : styles.buttonDisabled),
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? "#fff" : colors.ink} />
      ) : (
        <Text style={[styles.buttonText, primary ? styles.buttonTextPrimary : styles.buttonTextGhost]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeFiring: { backgroundColor: colors.accent },
  badgeIdle: { borderWidth: 1, borderColor: colors.hairline },
  badgeText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 10,
    letterSpacing: 0.9,
    color: colors.muted,
  },
  badgeTextFiring: { color: "#FFFFFF" },

  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: "hidden",
  },
  trackFill: { height: "100%", borderRadius: radius.pill },

  iconChip: { borderRadius: radius.chip, alignItems: "center", justifyContent: "center" },

  segmentTrack: {
    flexDirection: "row",
    backgroundColor: colors.sidebar,
    borderRadius: radius.control,
    padding: 3,
  },
  segment: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  segmentSelected: { backgroundColor: colors.surface, ...cardShadow },
  segmentText: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.muted },
  segmentTextSelected: { fontFamily: fonts.semibold, color: colors.ink },

  fieldLabel: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.muted },

  input: {
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: fonts.regular,
    fontSize: 14.5,
    color: colors.ink,
  },
  inputInvalid: { borderColor: "#F87171" },

  button: {
    borderRadius: radius.control,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonGhost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  buttonPrimaryDisabled: { backgroundColor: colors.neutralBar },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 14 },
  buttonTextPrimary: { color: "#FFFFFF" },
  buttonTextGhost: { color: colors.ink },
});
