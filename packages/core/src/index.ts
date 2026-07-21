/**
 * Watchtower core — the source-agnostic watcher engine.
 *
 * Phase 1 fills this in: the source-adapter interface (watch a source → match a
 * rule → emit a match), the weather adapter (NWS + Open-Meteo), and the
 * matching logic the cron route calls. Kept empty on purpose for the Phase 0
 * scaffold.
 */
import { APP_NAME } from "@watchtower/types";

export const CORE_READY = true;
export const ENGINE_FOR = APP_NAME;
