import { z } from "zod";

/** A person as identified in TMDB. */
export const PersonRefSchema = z.object({
  tmdbId: z.number().int(),
  name: z.string().min(1),
  /** TMDB's primary department, e.g. "Acting" or "Directing". */
  knownFor: z.string().optional(),
});
export type PersonRef = z.infer<typeof PersonRefSchema>;

export const ScreenWatchConfigSchema = z.object({
  person: PersonRefSchema,
  /**
   * Off by default. Documentaries, talk shows, news, reality and courtesy
   * crew credits are where the noise lives — a famous name accumulates
   * "making of" featurettes and chat-show appearances that nobody wants
   * pushed to their phone.
   */
  includeMinorCredits: z.boolean().default(false),
  /**
   * Credits the person already had when the watch was created. Anything not
   * in here is treated as newly announced.
   *
   * A date window can't do this job: an announced project often has no
   * release date at all, so the only reliable signal is "this wasn't in their
   * filmography before".
   */
  knownCredits: z.array(z.string()).default([]),
  /**
   * Their most recent released title when the watch was created, so the card
   * can show how long it has been rather than counting from the watch itself.
   */
  lastRelease: z
    .object({ date: z.string(), title: z.string(), type: z.string() })
    .optional(),
});
export type ScreenWatchConfig = z.infer<typeof ScreenWatchConfigSchema>;

/** A search hit returned by /api/screen/search. */
export const PersonSearchResultSchema = z.object({
  tmdbId: z.number().int(),
  name: z.string(),
  knownFor: z.string().optional(),
  /** A few titles they're known for, to tell namesakes apart. */
  knownForTitles: z.array(z.string()).default([]),
});
export type PersonSearchResult = z.infer<typeof PersonSearchResultSchema>;
