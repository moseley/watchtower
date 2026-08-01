import Svg, { Circle, G, Path, Rect } from "react-native-svg";

/**
 * Watchtower mark — the broadcast tower from the Atlas mock, reversed out of
 * an accent tile. Geometry is Lucide's RadioTower, kept in step with the web
 * version at apps/web/app/components/Logo.tsx and with
 * scripts/generate-icons.mjs.
 */
export function Logo({ size = 34 }: { size?: number }) {
  // The glyph is drawn in a 24-unit box, centred and scaled into the tile.
  const scale = (size * 0.58) / 24;
  const offset = size / 2 - 12 * scale;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect width={size} height={size} rx={size * 0.26} fill="#0F6B4F" />
      <G
        transform={`translate(${offset} ${offset}) scale(${scale})`}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9" />
        <Path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5" />
        <Circle cx="12" cy="9" r="2" />
        <Path d="M16.2 4.8c2 2 2.26 5.11.8 7.47" />
        <Path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1" />
        <Path d="M9.5 18h5" />
        <Path d="m8 22 4-11 4 11" />
      </G>
    </Svg>
  );
}
