import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/**
 * Watchtower mark — a lighthouse whose lantern room is a pair of binocular
 * lenses. Kept in step with the web version at apps/web/app/components/Logo.tsx;
 * the geometry is identical, only the element names differ.
 */
export function Logo({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="wtBeamL" x1="14" y1="0" x2="0" y2="0" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#60A5FA" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#60A5FA" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="wtBeamR" x1="50" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#60A5FA" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#60A5FA" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Path d="M14 17 L0 8 V26 Z" fill="url(#wtBeamL)" />
      <Path d="M50 17 L64 8 V26 Z" fill="url(#wtBeamR)" />

      <Path d="M24 31 H40 L47 57 H17 Z" fill="#E2E8F0" />
      <Path d="M22.65 36 H41.35 L42.69 41 H21.31 Z" fill="#2563EB" />
      <Path d="M19.69 47 H44.31 L45.65 52 H18.35 Z" fill="#2563EB" />
      <Rect x="12" y="56" width="40" height="6" rx="2.5" fill="#CBD5E1" />

      <Rect x="18" y="26" width="28" height="5.5" rx="2.5" fill="#CBD5E1" />

      <Rect x="27" y="12" width="10" height="9" rx="2" fill="#CBD5E1" />
      <Circle cx="23" cy="17" r="8.5" fill="#E2E8F0" />
      <Circle cx="41" cy="17" r="8.5" fill="#E2E8F0" />
      <Circle cx="23" cy="17" r="5" fill="#2563EB" />
      <Circle cx="41" cy="17" r="5" fill="#2563EB" />
      <Circle cx="23" cy="17" r="2" fill="#BFDBFE" />
      <Circle cx="41" cy="17" r="2" fill="#BFDBFE" />
    </Svg>
  );
}
