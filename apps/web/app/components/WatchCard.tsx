"use client";

import { Trash2, watchIcon } from "./icons";
import { IconChip, StatusBadge, ThresholdBar } from "./primitives";
import type { WatchRow } from "./types";
import { describeRule, describeWatch, watchImageUrl, watchTitle } from "./watch-display";

/**
 * Leads with the current value against the threshold, per the Atlas spec.
 * `current` is optional: when no reading is available the card keeps its shape
 * and shows an honest blank rather than a stand-in number.
 */
export function WatchCard({
  watch,
  current,
  onDelete,
  onEdit,
}: {
  watch: WatchRow;
  current?: number;
  onDelete: (id: string) => void;
  onEdit: (watch: WatchRow) => void;
}) {
  const { firing, value, delta, fill } = describeWatch(watch, current);
  const Icon = watchIcon(watch.source, watch.config.rule?.metric);
  const image = watchImageUrl(watch);

  return (
    <article className="relative flex flex-col gap-3.5 rounded-card border border-hairline bg-surface p-[18px] shadow-card transition-colors hover:border-hairline-strong focus-within:border-accent">
      {/* The whole card opens the editor. A stretched transparent button keeps
          that a real, keyboard-reachable control without nesting the delete
          button inside it, which would be invalid and swallow its clicks. */}
      <button
        type="button"
        onClick={() => onEdit(watch)}
        aria-label={`Edit watch for ${watchTitle(watch)}`}
        className="absolute inset-0 z-0 rounded-card outline-none"
      />
      <header className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {image ? (
            // Decorative: the title beside it already names the watch.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              width={32}
              height={32}
              loading="lazy"
              className="h-8 w-8 shrink-0 rounded-[9px] object-cover"
            />
          ) : (
            <IconChip icon={Icon} active={firing} />
          )}
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold text-ink">
              {watchTitle(watch)}
            </span>
            <span className="truncate text-[12.5px] text-muted">{describeRule(watch)}</span>
          </div>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
          <StatusBadge firing={firing} />
          <button
            type="button"
            onClick={() => onDelete(watch.id)}
            aria-label={`Delete watch for ${watchTitle(watch)}`}
            title="Delete watch"
            className="rounded-[8px] p-1.5 text-faint transition-colors hover:bg-sidebar hover:text-ink"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      <div className="pointer-events-none relative z-10 flex items-end justify-between gap-3">
        {/* 36px on mobile, 40px from md up, per the type scale. */}
        <span className="text-[36px] font-bold leading-none tracking-[-.04em] tabular-nums text-ink md:text-[40px]">
          {value ?? <span className="text-neutral-bar">—</span>}
        </span>
        <span className="pb-1 text-right text-[12.5px] text-muted">{delta}</span>
      </div>

      <div className="pointer-events-none relative z-10">
        <ThresholdBar fill={fill} firing={firing} />
      </div>
    </article>
  );
}
