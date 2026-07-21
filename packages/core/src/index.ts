/**
 * Watchtower core — the source-agnostic watcher engine.
 *
 *   watch a source → match my criteria → push me a notification
 *
 * The engine (`runWatches`) knows only the SourceAdapter interface. Each domain
 * is an adapter; weather is the first.
 */
export * from "./adapters/types";
export * from "./adapters/weather";
export * from "./push/expo";
export * from "./engine";

import { weatherAdapter } from "./adapters/weather";
import type { SourceAdapter } from "./adapters/types";

/** Default adapter registry. Add new domains here as they ship. */
export const defaultAdapters: Record<string, SourceAdapter<any>> = {
  weather: weatherAdapter,
};
