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
/** The artist's most recent release at the time the watch was created. */
export const LatestReleaseSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  title: z.string(),
  type: z.string(),
  /**
   * Cover art for this release, from iTunes. MusicBrainz holds no images and
   * iTunes has no artist photo either, so the sleeve of what they last put out
   * stands in — matched on artist *and* title, which is far less likely to
   * pick the wrong act than a bare name lookup.
   */
  artworkUrl: z.string().optional(),
});
export type LatestRelease = z.infer<typeof LatestReleaseSchema>;

export const MusicWatchConfigSchema = z.object({
  artist: ArtistRefSchema,
  includeSingles: z.boolean().default(false),
  /**
   * Looked up when the watch is created, so the card can show time since the
   * artist last released something rather than since you started watching.
   * Optional: watches made before this existed simply don't carry it.
   */
  lastRelease: LatestReleaseSchema.optional(),
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
