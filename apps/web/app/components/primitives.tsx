"use client";

import type { LucideIcon } from "./icons";

/** FIRING / WATCHING pill. Mono, uppercase, tracked out. */
export function StatusBadge({ firing }: { firing: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-1 font-mono text-[10px] font-bold tracking-[.09em] ${
        firing ? "bg-accent text-white" : "border border-hairline text-muted"
      }`}
    >
      {firing ? "FIRING" : "WATCHING"}
    </span>
  );
}

/**
 * Position of the current value between a metric's bounds. `fill` is already
 * clamped to 0–1 by the caller, which owns the metric's min/max.
 */
export function ThresholdBar({ fill, firing }: { fill: number; firing: boolean }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-track">
      <div
        className={`h-full rounded-full ${firing ? "bg-accent" : "bg-neutral-bar"}`}
        style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }}
      />
    </div>
  );
}

/** Square tinted icon holder used on cards and in the sidebar. */
export function IconChip({
  icon: Icon,
  active,
  size = 32,
  iconSize = 17,
}: {
  icon: LucideIcon;
  active?: boolean;
  size?: number;
  iconSize?: number;
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-[9px] ${
        active ? "bg-accent-tint text-accent" : "bg-chip-idle text-muted"
      }`}
      style={{ width: size, height: size }}
    >
      <Icon size={iconSize} />
    </span>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Replaces the old pill row: a track with the selected segment raised out of it. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex rounded-control bg-sidebar p-[3px]"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-[8px] px-3 py-2 text-[13.5px] transition-colors disabled:opacity-50 ${
              selected
                ? "bg-surface font-semibold text-ink shadow-card"
                : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Sentence-case form label — deliberately not uppercase. */
export function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-[12.5px] font-semibold text-muted">
      {children}
    </label>
  );
}

/** Text input with an optional leading icon. */
export function TextField({
  icon: Icon,
  invalid,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon; invalid?: boolean }) {
  return (
    <div className="relative flex-1">
      {Icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
          <Icon size={16} />
        </span>
      )}
      <input
        {...props}
        className={`w-full rounded-control border bg-field py-2.5 text-[14.5px] text-ink outline-none placeholder:text-faint focus:border-accent disabled:opacity-50 ${
          Icon ? "pl-9 pr-3" : "px-3"
        } ${invalid ? "border-red-400" : "border-hairline-strong"} ${className}`}
      />
    </div>
  );
}

/** Primary (accent) and ghost buttons share these shapes. */
export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const base =
    "rounded-control px-4 py-2.5 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-accent text-white hover:bg-[#0c5740] disabled:bg-neutral-bar"
      : "border border-hairline bg-surface text-ink hover:border-hairline-strong disabled:opacity-50";
  return <button {...props} className={`${base} ${styles} ${className}`} />;
}
