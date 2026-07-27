import { z } from "zod";

/** An artist as identified in MusicBrainz. */
export const ArtistRefSchema = z.object({
  /** MusicBrainz artist id (stable, canonical). */
  mbid: z.string().min(1),
  name: z.string().min(1),
  /** MusicBrainz's short qualifier, e.g. "US rapper" — helps tell namesakes apart. */
  disambiguation: z.string().optional(),
});
export type ArtistRef = z.infer<typeof ArtistRefSchema>;

/**
 * What counts as a release worth alerting on. Singles are opt-in because
 * prolific artists drop them often — the fastest way to make alerts feel noisy.
 */
export const MusicWatchConfigSchema = z.object({
  artist: ArtistRefSchema,
  includeSingles: z.boolean().default(false),
});
export type MusicWatchConfig = z.infer<typeof MusicWatchConfigSchema>;

/** A search hit returned by /api/music/search. */
export const ArtistSearchResultSchema = z.object({
  mbid: z.string(),
  name: z.string(),
  disambiguation: z.string().optional(),
  country: z.string().optional(),
  type: z.string().optional(),
});
export type ArtistSearchResult = z.infer<typeof ArtistSearchResultSchema>;
