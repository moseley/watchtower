/**
 * Watchtower mark — a lighthouse whose lantern room is a pair of binocular
 * lenses. Shapes are kept few and bold so the silhouette survives at favicon
 * size; the beams are the only fine detail and they drop out gracefully.
 */
export function Logo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Watchtower"
    >
      <defs>
        <linearGradient id="wt-beam-l" x1="14" y1="0" x2="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" stopOpacity="0.55" />
          <stop offset="1" stopColor="#60A5FA" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="wt-beam-r" x1="50" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" stopOpacity="0.55" />
          <stop offset="1" stopColor="#60A5FA" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* light thrown left and right from the lenses */}
      <path d="M14 17 L0 8 V26 Z" fill="url(#wt-beam-l)" />
      <path d="M50 17 L64 8 V26 Z" fill="url(#wt-beam-r)" />

      {/* tower */}
      <path d="M24 31 H40 L47 57 H17 Z" fill="#E2E8F0" />
      <path d="M21.6 40 H42.4 L44 46 H20 Z" fill="#2563EB" />
      <rect x="12" y="56" width="40" height="6" rx="2.5" fill="#CBD5E1" />

      {/* gallery deck the lantern sits on */}
      <rect x="18" y="26" width="28" height="5.5" rx="2.5" fill="#CBD5E1" />

      {/* lantern room as binoculars */}
      <rect x="27" y="12" width="10" height="9" rx="2" fill="#CBD5E1" />
      <circle cx="23" cy="17" r="8.5" fill="#E2E8F0" />
      <circle cx="41" cy="17" r="8.5" fill="#E2E8F0" />
      <circle cx="23" cy="17" r="4.2" fill="#2563EB" />
      <circle cx="41" cy="17" r="4.2" fill="#2563EB" />
      <circle cx="21.6" cy="15.6" r="1.5" fill="#BFDBFE" />
      <circle cx="39.6" cy="15.6" r="1.5" fill="#BFDBFE" />
    </svg>
  );
}
