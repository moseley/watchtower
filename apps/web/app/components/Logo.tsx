/**
 * Watchtower mark, Atlas treatment — a lighthouse whose lantern room is a pair
 * of binocular lenses, reversed out of an accent tile as shown in the mock.
 *
 * The mobile app and the generated launcher icons still carry the original
 * blue mark; recolouring those changes the icon on installed devices, so it is
 * deliberately left as a separate decision.
 */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Watchtower"
    >
      <rect width="64" height="64" rx="15" fill="#0F6B4F" />
      <g transform="translate(6.4 6.4) scale(0.8)">
        {/* tower — bands are cut in the tile colour so they read as stripes */}
        <path d="M24 31 H40 L47 57 H17 Z" fill="#FFFFFF" />
        <path d="M22.65 36 H41.35 L42.69 41 H21.31 Z" fill="#0F6B4F" />
        <path d="M19.69 47 H44.31 L45.65 52 H18.35 Z" fill="#0F6B4F" />
        <rect x="12" y="56" width="40" height="6" rx="2.5" fill="#FFFFFF" />

        {/* gallery deck the lantern sits on */}
        <rect x="18" y="26" width="28" height="5.5" rx="2.5" fill="#FFFFFF" />

        {/* lantern room as binoculars — highlights stay concentric so the
            lenses read as optics rather than as a pair of eyes */}
        <rect x="27" y="12" width="10" height="9" rx="2" fill="#FFFFFF" />
        <circle cx="23" cy="17" r="8.5" fill="#FFFFFF" />
        <circle cx="41" cy="17" r="8.5" fill="#FFFFFF" />
        <circle cx="23" cy="17" r="5" fill="#0F6B4F" />
        <circle cx="41" cy="17" r="5" fill="#0F6B4F" />
        <circle cx="23" cy="17" r="2" fill="#E6F0EA" />
        <circle cx="41" cy="17" r="2" fill="#E6F0EA" />
      </g>
    </svg>
  );
}
