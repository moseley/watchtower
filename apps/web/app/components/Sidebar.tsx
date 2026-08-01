"use client";

import { Logo } from "./Logo";
import { AudioLines, Bell, Clapperboard, CloudSun, Layers, Plus, Settings, User } from "./icons";
import type { LucideIcon } from "./icons";
import type { ListView, SourceFilter } from "./types";

function NavRow({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-[14px] transition-colors ${
        active
          ? "bg-sidebar-active font-semibold text-ink"
          : "text-muted hover:bg-sidebar-active/60 hover:text-ink"
      }`}
    >
      <Icon size={16} className="shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="font-mono text-[11px] text-faint tabular-nums">{count}</span>
      )}
    </button>
  );
}

export function Sidebar({
  view,
  sourceFilter,
  counts,
  onNewWatch,
  onSelectSource,
  onSelectView,
}: {
  view: ListView;
  sourceFilter: SourceFilter;
  counts: { all: number; weather: number; music: number; screen: number };
  onNewWatch: () => void;
  onSelectSource: (next: SourceFilter) => void;
  onSelectView: (next: ListView) => void;
}) {
  const onWatches = view === "watches";

  return (
    <aside className="hidden w-[226px] shrink-0 flex-col border-r border-hairline bg-sidebar p-4 lg:flex">
      <div className="flex items-center gap-2.5 px-1">
        <Logo className="h-8 w-8" />
        <span className="text-[16px] font-bold tracking-[-.02em] text-ink">Watchtower</span>
      </div>

      <button
        type="button"
        onClick={onNewWatch}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-control bg-accent px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#0c5740]"
      >
        <Plus size={16} />
        New watch
      </button>

      <p className="mt-6 px-3 font-mono text-[10px] font-semibold uppercase tracking-[.09em] text-faint">
        Sources
      </p>
      <nav className="mt-2 flex flex-col gap-0.5">
        <NavRow
          icon={Layers}
          label="All"
          count={counts.all}
          active={onWatches && sourceFilter === "all"}
          onClick={() => onSelectSource("all")}
        />
        <NavRow
          icon={CloudSun}
          label="Weather"
          count={counts.weather}
          active={onWatches && sourceFilter === "weather"}
          onClick={() => onSelectSource("weather")}
        />
        <NavRow
          icon={AudioLines}
          label="Music"
          count={counts.music}
          active={onWatches && sourceFilter === "music"}
          onClick={() => onSelectSource("music")}
        />
        <NavRow
          icon={Clapperboard}
          label="Film & TV"
          count={counts.screen}
          active={onWatches && sourceFilter === "screen"}
          onClick={() => onSelectSource("screen")}
        />
      </nav>

      <hr className="my-4 border-hairline" />

      <nav className="flex flex-col gap-0.5">
        <NavRow
          icon={Bell}
          label="History"
          active={view === "history"}
          onClick={() => onSelectView("history")}
        />
        <NavRow
          icon={Settings}
          label="Settings"
          active={view === "settings"}
          onClick={() => onSelectView("settings")}
        />
      </nav>

      <button
        type="button"
        onClick={() => onSelectView("settings")}
        className="mt-auto flex items-center gap-2.5 rounded-control border border-hairline bg-surface px-3 py-2.5 text-left transition-colors hover:border-hairline-strong"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-tint text-accent">
          <User size={15} />
        </span>
        {/* There are no accounts yet, so this states what the identity actually
            is rather than inventing a person. */}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          This device
        </span>
      </button>
    </aside>
  );
}
