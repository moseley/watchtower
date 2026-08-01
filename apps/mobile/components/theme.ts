/**
 * Atlas design tokens for the native app.
 *
 * The spec ships these as Tailwind theme keys; React Native has no Tailwind, so
 * they are plain constants consumed by StyleSheet objects. Values are identical
 * to apps/web/app/globals.css — change both together.
 */
export const colors = {
  canvas: "#F4F5F3",
  surface: "#FFFFFF",
  sidebar: "#EFF1EC",
  hairline: "#DCDFD9",
  hairlineStrong: "#CFD4CD",
  field: "#FAFBF9",
  ink: "#14181A",
  muted: "#6B7472",
  faint: "#8B948F",
  accent: "#0F6B4F",
  accentPressed: "#0C5740",
  accentTint: "#E6F0EA",
  neutralBar: "#AAB3AE",
  track: "#EAECE7",
  chipIdle: "#EEF0EC",
  danger: "#B91C1C",
  warning: "#B45309",
} as const;

export const radius = {
  card: 14,
  control: 10,
  chip: 9,
  pill: 999,
} as const;

/**
 * Space Grotesk everywhere; IBM Plex Mono only for badges, counts and
 * timestamps, per the type rules.
 */
export const fonts = {
  regular: "SpaceGrotesk_400Regular",
  medium: "SpaceGrotesk_500Medium",
  semibold: "SpaceGrotesk_600SemiBold",
  bold: "SpaceGrotesk_700Bold",
  mono: "IBMPlexMono_400Regular",
  monoSemibold: "IBMPlexMono_600SemiBold",
} as const;

/** Matches the web card shadow, expressed for both platforms. */
export const cardShadow = {
  shadowColor: "#141914",
  shadowOpacity: 0.04,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;
