import {
  AudioLines,
  Bell,
  Clapperboard,
  CloudRain,
  CloudSun,
  Crosshair,
  Eye,
  Film,
  Info,
  Layers,
  Plus,
  Search,
  Settings,
  ThermometerSun,
  Trash2,
  User,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react";

export {
  AudioLines,
  Bell,
  Clapperboard,
  CloudRain,
  CloudSun,
  Crosshair,
  Eye,
  Film,
  Info,
  Layers,
  Plus,
  Search,
  Settings,
  ThermometerSun,
  Trash2,
  User,
  Wind,
  X,
};
export type { LucideIcon };

/** The icon that represents a source in nav and filters. */
export function sourceIcon(source: string): LucideIcon {
  if (source === "music") return AudioLines;
  if (source === "screen") return Clapperboard;
  return CloudSun;
}

/**
 * The icon for a specific watch — the metric it tracks, not just its source,
 * so a temperature watch and a rain watch are distinguishable at a glance.
 */
export function watchIcon(source: string, metric: string | undefined): LucideIcon {
  if (source === "music") return AudioLines;
  if (source === "screen") return Film;
  if (metric === "precipitation_probability") return CloudRain;
  if (metric === "wind_speed") return Wind;
  if (metric === "temperature") return ThermometerSun;
  return CloudSun;
}
