import { getPersonSnapshot } from "@watchtower/core";
import type { CreateWatchInput } from "@watchtower/types";
import { lookupLatestRelease } from "./latest-release";

type Parsed = Extract<CreateWatchInput, { source: string }>;

/** The stored config of the watch being edited, if this is an edit. */
export type PreviousConfig = Record<string, unknown> | undefined;

export class ConfigLookupError extends Error {}

/**
 * Turn validated form input into the config actually stored on the watch,
 * filling in the server-side snapshots each source needs.
 *
 * On edit, a snapshot is only retaken when the thing it describes changed.
 * That is a correctness rule, not an optimisation: re-snapshotting a film & TV
 * watch would absorb anything announced since it was created into the new
 * baseline, and those titles would then never alert.
 */
export async function buildStoredConfig(
  parsed: Parsed,
  previous?: PreviousConfig,
): Promise<unknown> {
  const { source, config } = parsed as { source: string; config: Record<string, any> };

  if (source === "music") {
    const prevArtist = previous?.artist as { mbid?: string } | undefined;
    const changed =
      !previous ||
      prevArtist?.mbid !== config.artist.mbid ||
      previous.includeSingles !== config.includeSingles;

    if (!changed && previous?.lastRelease) {
      return { ...config, lastRelease: previous.lastRelease };
    }
    try {
      const release = await lookupLatestRelease(
        config.artist.mbid,
        config.includeSingles,
        config.artist.name,
      );
      return release ? { ...config, lastRelease: release } : config;
    } catch {
      // Display-only, so a MusicBrainz hiccup must not block the save.
      return config;
    }
  }

  if (source === "screen") {
    const prevPerson = previous?.person as { tmdbId?: number } | undefined;
    const changed =
      !previous ||
      prevPerson?.tmdbId !== config.person.tmdbId ||
      previous.includeMinorCredits !== config.includeMinorCredits;

    if (!changed && Array.isArray(previous?.knownCredits)) {
      return {
        ...config,
        knownCredits: previous.knownCredits,
        ...(previous.lastRelease ? { lastRelease: previous.lastRelease } : {}),
      };
    }
    try {
      // A changed person, or a changed filter, invalidates the old baseline:
      // widening the filter would otherwise make every previously-excluded
      // credit look newly announced and fire all at once.
      const snapshot = await getPersonSnapshot(config.person.tmdbId, {
        includeMinorCredits: config.includeMinorCredits,
      });
      return { ...config, ...snapshot };
    } catch (err) {
      throw new ConfigLookupError(
        `Couldn't read that person's filmography: ${(err as Error).message}`,
      );
    }
  }

  return config;
}
