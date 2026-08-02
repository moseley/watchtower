"use client";

import { AudioLines, Clapperboard, CloudSun, Crosshair, Info, Search } from "./icons";
import { Button, FieldLabel, SegmentedControl, TextField } from "./primitives";
import { tmdbImageUrl } from "@watchtower/types";
import type { ArtistHit, PersonHit, Place } from "./types";

type Source = "weather" | "music" | "screen";
type Metric = "temperature" | "precipitation_probability" | "wind_speed";
type Comparator = "below" | "above";
type TempUnit = "F" | "C";

const SOURCES: { value: Source; label: string; icon: typeof CloudSun }[] = [
  { value: "weather", label: "Weather", icon: CloudSun },
  { value: "music", label: "Music", icon: AudioLines },
  { value: "screen", label: "Film & TV", icon: Clapperboard },
];

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "temperature", label: "Temperature" },
  { value: "precipitation_probability", label: "Rain %" },
  { value: "wind_speed", label: "Wind" },
];

export interface WatchFormProps {
  source: Source;
  onSourceChange: (next: Source) => void;
  disabled: boolean;

  // weather
  locationText: string;
  onLocationChange: (next: string) => void;
  locationEdited: boolean;
  coords: { latitude: number; longitude: number } | null;
  locating: boolean;
  locationHits: Place[];
  searchingLocation: boolean;
  onUseCurrentLocation: () => void;
  onPickPlace: (place: Place) => void;
  metric: Metric;
  onMetricChange: (next: Metric) => void;
  comparator: Comparator;
  onComparatorChange: (next: Comparator) => void;
  tempUnit: TempUnit;
  onTempUnitChange: (next: TempUnit) => void;
  threshold: string;
  onThresholdChange: (next: string) => void;
  thresholdProblem: string | null;

  // music
  artistQuery: string;
  onArtistQueryChange: (next: string) => void;
  artistHits: ArtistHit[];
  searching: boolean;
  noResults: boolean;
  artist: ArtistHit | null;
  onPickArtist: (hit: ArtistHit | null) => void;
  includeSingles: boolean;
  onIncludeSinglesChange: (next: boolean) => void;
  musicCount: number;
  musicLimit: number;
  musicFull: boolean;
  lastRelease: { date: string; title: string; type: string } | null;
  loadingRelease: boolean;

  // film & tv
  personQuery: string;
  onPersonQueryChange: (next: string) => void;
  personHits: PersonHit[];
  searchingPerson: boolean;
  noPersonResults: boolean;
  person: PersonHit | null;
  onPickPerson: (hit: PersonHit | null) => void;
  includeMinorCredits: boolean;
  onIncludeMinorCreditsChange: (next: boolean) => void;
  screenCount: number;
  screenFull: boolean;

  canCreate: boolean;
  busy: boolean;
  onCreate: () => void;
  onCancel: () => void;
}

function daysSince(date: string): number {
  // Date-only, so anchor at midday UTC to avoid a timezone off-by-one.
  const then = new Date(`${date}T12:00:00Z`).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/** Plain restatement of the rule being built. */
function rulePreview(p: WatchFormProps): string | null {
  if (p.source === "music") {
    if (!p.artist) return null;
    return `You'll be alerted when ${p.artist.name} releases ${
      p.includeSingles ? "an album, EP or single" : "an album or EP"
    }.`;
  }
  if (p.source === "screen") {
    if (!p.person) return null;
    return p.includeMinorCredits
      ? `You'll be alerted whenever ${p.person.name} is credited on anything new.`
      : `You'll be alerted when ${p.person.name} is attached to a new film or series.`;
  }
  const place = p.locationText.trim();
  if (!place || p.thresholdProblem) return null;
  if (p.metric === "temperature") {
    return `You'll be alerted when the temperature in ${place} goes ${p.comparator} ${p.threshold}°${p.tempUnit}.`;
  }
  if (p.metric === "precipitation_probability") {
    return `You'll be alerted when the chance of rain in ${place} goes above ${p.threshold}%.`;
  }
  return `You'll be alerted when wind in ${place} goes above ${p.threshold} mph.`;
}

export function WatchForm(props: WatchFormProps) {
  const {
    source,
    onSourceChange,
    disabled,
    locationText,
    onLocationChange,
    locationEdited,
    coords,
    locating,
    locationHits,
    searchingLocation,
    onUseCurrentLocation,
    onPickPlace,
    metric,
    onMetricChange,
    comparator,
    onComparatorChange,
    tempUnit,
    onTempUnitChange,
    threshold,
    onThresholdChange,
    thresholdProblem,
    artistQuery,
    onArtistQueryChange,
    artistHits,
    searching,
    noResults,
    artist,
    onPickArtist,
    includeSingles,
    onIncludeSinglesChange,
    musicCount,
    musicLimit,
    musicFull,
    lastRelease,
    loadingRelease,
    personQuery,
    onPersonQueryChange,
    personHits,
    searchingPerson,
    noPersonResults,
    person,
    onPickPerson,
    includeMinorCredits,
    onIncludeMinorCreditsChange,
    screenCount,
    screenFull,
    canCreate,
    busy,
    onCreate,
    onCancel,
  } = props;

  const preview = rulePreview(props);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        {/* Source picker */}
        <div className="grid grid-cols-2 gap-2.5">
          {SOURCES.map(({ value, label, icon: Icon }) => {
            const selected = source === value;
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => onSourceChange(value)}
                className={`flex items-center gap-2.5 rounded-control px-3.5 py-3 text-[14px] transition-colors disabled:opacity-50 ${
                  selected
                    ? "border-[1.5px] border-accent bg-accent-tint font-semibold text-accent"
                    : "border border-hairline bg-surface text-ink hover:border-hairline-strong"
                }`}
              >
                <Icon size={17} />
                {label}
              </button>
            );
          })}
        </div>

        {source === "weather" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="location">Location</FieldLabel>
              <div className="flex gap-2">
                <TextField
                  id="location"
                  icon={Search}
                  value={locationText}
                  onChange={(e) => onLocationChange(e.target.value)}
                  placeholder="City or zip code"
                  autoComplete="off"
                  disabled={disabled}
                />
                <button
                  type="button"
                  onClick={onUseCurrentLocation}
                  disabled={disabled || locating}
                  title="Use my location"
                  aria-label="Use my location"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-control border border-hairline bg-surface text-muted transition-colors hover:border-hairline-strong hover:text-ink disabled:opacity-50"
                >
                  <Crosshair size={17} className={locating ? "animate-spin" : ""} />
                </button>
              </div>

              {coords && !locationEdited && (
                <p className="text-[12px] text-faint">
                  Using {coords.latitude.toFixed(3)}, {coords.longitude.toFixed(3)}
                </p>
              )}

              {locationEdited && locationHits.length > 0 && (
                <ul className="flex flex-col gap-1 pt-0.5">
                  {locationHits.map((place) => (
                    <li key={`${place.latitude},${place.longitude}`}>
                      <button
                        type="button"
                        onClick={() => onPickPlace(place)}
                        className="w-full rounded-[8px] px-3 py-2 text-left text-[13.5px] text-ink transition-colors hover:bg-sidebar"
                      >
                        {place.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {locationEdited && locationHits.length === 0 && (
                <p className="text-[12px] text-faint">
                  {searchingLocation
                    ? "Looking up…"
                    : locationText.trim().length < 2
                      ? "Type a city or zip code"
                      : "No match yet — the closest one is used when you create the watch"}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel>Metric</FieldLabel>
              <SegmentedControl
                ariaLabel="Metric"
                options={METRIC_OPTIONS}
                value={metric}
                onChange={onMetricChange}
                disabled={disabled}
              />
            </div>

            {metric === "temperature" && (
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Alert me when it goes</FieldLabel>
                <div className="grid grid-cols-2 gap-2.5">
                  {(["below", "above"] as Comparator[]).map((option) => {
                    const selected = comparator === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={disabled}
                        onClick={() => onComparatorChange(option)}
                        className={`rounded-control py-2.5 text-[14px] capitalize transition-colors disabled:opacity-50 ${
                          selected
                            ? "border-[1.5px] border-accent bg-accent-tint font-semibold text-accent"
                            : "border border-hairline bg-surface text-ink hover:border-hairline-strong"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="threshold">Threshold</FieldLabel>
              <div className="flex gap-2">
                <TextField
                  id="threshold"
                  value={threshold}
                  onChange={(e) => onThresholdChange(e.target.value)}
                  inputMode="numeric"
                  placeholder={metric === "temperature" ? "85" : "60"}
                  invalid={Boolean(thresholdProblem)}
                  disabled={disabled}
                />
                {metric === "temperature" && (
                  <div className="w-[104px] shrink-0">
                    <SegmentedControl
                      ariaLabel="Units"
                      options={[
                        { value: "F" as TempUnit, label: "°F" },
                        { value: "C" as TempUnit, label: "°C" },
                      ]}
                      value={tempUnit}
                      onChange={onTempUnitChange}
                      disabled={disabled}
                    />
                  </div>
                )}
              </div>
              {thresholdProblem && (
                <p className="text-[12px] text-red-600">{thresholdProblem}</p>
              )}
            </div>
          </>
        ) : source === "screen" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <FieldLabel htmlFor="person">Actor or director</FieldLabel>
                <span className="font-mono text-[11px] text-faint tabular-nums">
                  {screenCount} / {musicLimit}
                </span>
              </div>

              {person ? (
                <div className="flex items-center gap-2.5 rounded-control border-[1.5px] border-accent bg-accent-tint px-3 py-2.5">
                  <Clapperboard size={17} className="shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-accent">{person.name}</p>
                    {person.knownForTitles.length > 0 && (
                      <p className="truncate text-[12px] text-muted">
                        {person.knownForTitles.join(" · ")}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onPickPerson(null)}
                    className="shrink-0 text-[12.5px] font-medium text-muted underline hover:text-ink"
                  >
                    change
                  </button>
                </div>
              ) : (
                <>
                  <TextField
                    id="person"
                    icon={Search}
                    value={personQuery}
                    onChange={(e) => onPersonQueryChange(e.target.value)}
                    placeholder="Start typing a name…"
                    autoComplete="off"
                    disabled={disabled}
                  />
                  {personHits.length > 0 && (
                    <ul className="flex flex-col gap-1 pt-0.5">
                      {personHits.map((hit) => (
                        <li key={hit.tmdbId}>
                          <button
                            type="button"
                            onClick={() => onPickPerson(hit)}
                            className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left transition-colors hover:bg-sidebar"
                          >
                            {hit.profilePath ? (
                              // Decorative — the name sits right beside it.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={tmdbImageUrl(hit.profilePath, "w92")}
                                alt=""
                                width={28}
                                height={28}
                                loading="lazy"
                                className="h-7 w-7 shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-chip-idle text-faint">
                                <Clapperboard size={14} />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13.5px] font-medium text-ink">
                                {hit.name}
                              </span>
                              <span className="block truncate text-[12px] text-faint">
                                {[hit.knownFor, ...hit.knownForTitles].filter(Boolean).join(" · ") ||
                                  "person"}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[12px] text-faint" role="status" aria-live="polite">
                    {searchingPerson
                      ? "Searching…"
                      : noPersonResults
                        ? `No people found for "${personQuery.trim()}"`
                        : ""}
                  </p>
                </>
              )}
            </div>

            <label className="flex items-center gap-2.5 text-[14px] text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#0F6B4F]"
                checked={includeMinorCredits}
                onChange={(e) => onIncludeMinorCreditsChange(e.target.checked)}
                disabled={disabled}
              />
              Include documentaries &amp; minor credits
            </label>
            <p className="-mt-3 text-[12px] text-faint">
              Off by default: talk shows, behind-the-scenes featurettes and courtesy credits are
              where most of the noise comes from.
            </p>

            {screenFull && (
              <p className="text-[12.5px] text-amber-700">
                You&apos;re watching {musicLimit} people — delete one to add another.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <FieldLabel htmlFor="artist">Artist or band</FieldLabel>
                <span className="font-mono text-[11px] text-faint tabular-nums">
                  {musicCount} / {musicLimit}
                </span>
              </div>

              {artist ? (
                <div className="flex items-center gap-2.5 rounded-control border-[1.5px] border-accent bg-accent-tint px-3 py-2.5">
                  <AudioLines size={17} className="shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-accent">{artist.name}</p>
                    {artist.disambiguation && (
                      <p className="truncate text-[12px] text-muted">{artist.disambiguation}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onPickArtist(null)}
                    className="shrink-0 text-[12.5px] font-medium text-muted underline hover:text-ink"
                  >
                    change
                  </button>
                </div>
              ) : null}

              {artist && (
                <p className="text-[12.5px] text-faint">
                  {loadingRelease
                    ? "Checking their last release…"
                    : lastRelease
                      ? `Last release: ${lastRelease.title} — ${daysSince(lastRelease.date)} days ago`
                      : "No dated release found for them yet"}
                </p>
              )}

              {!artist && (
                <>
                  <TextField
                    id="artist"
                    icon={Search}
                    value={artistQuery}
                    onChange={(e) => onArtistQueryChange(e.target.value)}
                    placeholder="Start typing a name…"
                    autoComplete="off"
                    disabled={disabled}
                  />
                  {artistHits.length > 0 && (
                    <ul className="flex flex-col gap-1 pt-0.5">
                      {artistHits.map((hit) => (
                        <li key={hit.mbid}>
                          <button
                            type="button"
                            onClick={() => onPickArtist(hit)}
                            className="w-full rounded-[8px] px-3 py-2 text-left transition-colors hover:bg-sidebar"
                          >
                            <span className="block text-[13.5px] font-medium text-ink">
                              {hit.name}
                            </span>
                            <span className="block text-[12px] text-faint">
                              {[hit.disambiguation, hit.type, hit.country]
                                .filter(Boolean)
                                .join(" · ") || "artist"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[12px] text-faint" role="status" aria-live="polite">
                    {searching
                      ? "Searching…"
                      : noResults
                        ? `No artists found for "${artistQuery.trim()}"`
                        : ""}
                  </p>
                </>
              )}
            </div>

            <label className="flex items-center gap-2.5 text-[14px] text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#0F6B4F]"
                checked={includeSingles}
                onChange={(e) => onIncludeSinglesChange(e.target.checked)}
                disabled={disabled}
              />
              Include singles
            </label>
            <p className="-mt-3 text-[12px] text-faint">
              Albums and EPs are always included. Singles can be frequent for busy artists.
            </p>

            {musicFull && (
              <p className="text-[12.5px] text-amber-700">
                You&apos;re watching {musicLimit} artists — delete one to add another.
              </p>
            )}
          </>
        )}

        {preview && (
          <div className="flex gap-2.5 rounded-control bg-sidebar p-3 text-[13px] text-muted">
            <Info size={16} className="mt-px shrink-0 text-faint" />
            <p>{preview}</p>
          </div>
        )}
      </div>

      <div className="mt-auto flex gap-2.5 border-t border-hairline pt-4">
        <Button variant="ghost" onClick={onCancel} type="button">
          Cancel
        </Button>
        <Button className="flex-1" onClick={onCreate} disabled={!canCreate} type="button">
          {busy ? "Working…" : "Create watch"}
        </Button>
      </div>
    </div>
  );
}
