"use client";

import { Bell, Eye, User } from "./icons";
import type { LucideIcon } from "./icons";
import type { ListView } from "./types";

const TABS: { view: ListView; label: string; icon: LucideIcon }[] = [
  { view: "watches", label: "Watches", icon: Eye },
  { view: "history", label: "History", icon: Bell },
  { view: "settings", label: "You", icon: User },
];

export function MobileTabBar({
  view,
  onSelect,
}: {
  view: ListView;
  onSelect: (next: ListView) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-hairline bg-surface pb-[18px] lg:hidden">
      {TABS.map(({ view: value, label, icon: Icon }) => {
        const active = view === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(value)}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 pt-2.5 ${
              active ? "text-accent" : "text-faint"
            }`}
          >
            <Icon size={19} />
            <span className={`text-[10px] ${active ? "font-semibold" : ""}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
