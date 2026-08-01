import { RadioTower } from "lucide-react";

/**
 * Watchtower mark — the broadcast tower from the Atlas mock, reversed out of
 * an accent tile. Sizing comes from `className`; the glyph scales with it.
 */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Watchtower"
      className={`grid shrink-0 place-items-center rounded-[26%] bg-accent text-white ${className}`}
    >
      <RadioTower className="h-[58%] w-[58%]" strokeWidth={2} aria-hidden />
    </span>
  );
}
