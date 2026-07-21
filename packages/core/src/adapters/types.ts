import type { z } from "zod";

/** A single alert-worthy event produced by an adapter. */
export interface WatcherMatch {
  /**
   * Event-scoped idempotency key (e.g. "temperature:below:32:2026-07-22").
   * The engine prefixes the watch id to form the globally-unique dedupe key.
   */
  dedupeKey: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface AdapterContext {
  now: Date;
  fetch: typeof fetch;
}

/**
 * A pluggable data source. Each domain (weather, recalls, flights…) implements
 * one. The engine is otherwise source-agnostic — this interface is the seam
 * that lets the "everything app" grow by adding adapters, not rewrites.
 */
export interface SourceAdapter<Config> {
  source: string;
  configSchema: z.ZodType<Config>;
  /** Fetch current source data and return matches for this config (empty if none). */
  evaluate(config: Config, ctx: AdapterContext): Promise<WatcherMatch[]>;
}
