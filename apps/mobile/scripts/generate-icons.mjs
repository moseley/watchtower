/**
 * Rasterises the Watchtower mark into the PNGs Expo needs.
 *
 *   node scripts/generate-icons.mjs
 *
 * The mark is defined once here in 64-unit space, matching
 * components/Logo.tsx and apps/web/app/components/Logo.tsx. Edit the shapes in
 * all three if the logo changes.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets");

const NAVY = "#0F172A";

// Solid (non-beam) extent of the mark, used to optically centre it: the beams
// are faint and full-width, so centring on the whole 64x64 box sits it low.
const CORE_CX = 32;
const CORE_CY = 35.25;

const beams = `
  <defs>
    <linearGradient id="bl" x1="14" y1="0" x2="0" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#60A5FA" stop-opacity="0.55"/><stop offset="1" stop-color="#60A5FA" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="br" x1="50" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#60A5FA" stop-opacity="0.55"/><stop offset="1" stop-color="#60A5FA" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="M14 17 L0 8 V26 Z" fill="url(#bl)"/>
  <path d="M50 17 L64 8 V26 Z" fill="url(#br)"/>`;

// Lens highlights are concentric, not offset: an off-centre highlight sits
// where a pupil would and turns the pair into eyes. Two tower bands rather
// than one, which is what actually signals "lighthouse".
const structure = `
  <path d="M24 31 H40 L47 57 H17 Z" fill="#E2E8F0"/>
  <path d="M22.65 36 H41.35 L42.69 41 H21.31 Z" fill="#2563EB"/>
  <path d="M19.69 47 H44.31 L45.65 52 H18.35 Z" fill="#2563EB"/>
  <rect x="12" y="56" width="40" height="6" rx="2.5" fill="#CBD5E1"/>
  <rect x="18" y="26" width="28" height="5.5" rx="2.5" fill="#CBD5E1"/>
  <rect x="27" y="12" width="10" height="9" rx="2" fill="#CBD5E1"/>
  <circle cx="23" cy="17" r="8.5" fill="#E2E8F0"/>
  <circle cx="41" cy="17" r="8.5" fill="#E2E8F0"/>
  <circle cx="23" cy="17" r="5" fill="#2563EB"/>
  <circle cx="41" cy="17" r="5" fill="#2563EB"/>
  <circle cx="23" cy="17" r="2" fill="#BFDBFE"/>
  <circle cx="41" cy="17" r="2" fill="#BFDBFE"/>`;

/** Flat silhouette with the lenses punched out, for Android themed icons. */
function monochrome(size, scale, tx, ty) {
  return `
  <defs>
    <mask id="sil">
      <rect width="${size}" height="${size}" fill="black"/>
      <g transform="translate(${tx} ${ty}) scale(${scale})">
        <path d="M24 31 H40 L47 57 H17 Z" fill="white"/>
        <rect x="12" y="56" width="40" height="6" rx="2.5" fill="white"/>
        <rect x="18" y="26" width="28" height="5.5" rx="2.5" fill="white"/>
        <rect x="27" y="12" width="10" height="9" rx="2" fill="white"/>
        <circle cx="23" cy="17" r="8.5" fill="white"/>
        <circle cx="41" cy="17" r="8.5" fill="white"/>
        <circle cx="23" cy="17" r="5" fill="black"/>
        <circle cx="41" cy="17" r="5" fill="black"/>
      </g>
    </mask>
  </defs>
  <rect width="${size}" height="${size}" fill="white" mask="url(#sil)"/>`;
}

/**
 * @param coverage how much of the canvas the 64-unit mark box spans.
 *   Android adaptive foregrounds get clipped to a circle, so they need a
 *   smaller value to stay inside the safe zone.
 */
function compose({ size, coverage, background = null, radius = 0, mono = false, withBeams = true }) {
  const scale = (size * coverage) / 64;
  const tx = size / 2 - CORE_CX * scale;
  const ty = size / 2 - CORE_CY * scale;

  const bg = background
    ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${background}"/>`
    : "";

  const body = mono
    ? monochrome(size, scale, tx, ty)
    : `<g transform="translate(${tx} ${ty}) scale(${scale})">${withBeams ? beams : ""}${structure}</g>`;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${body}</svg>`,
  );
}

// The beams are dropped from every launcher icon: at icon scale they read as
// solid triangles either side of the lenses rather than as light, which makes
// the mark look like a face. The in-app logo keeps them, where there is room.
const targets = [
  // Full-bleed square; iOS and the launcher apply their own rounding.
  // App Store review rejects icons that carry an alpha channel, so flatten it.
  {
    file: "icon.png",
    opts: { size: 1024, coverage: 0.74, background: NAVY, withBeams: false },
    opaque: true,
  },
  // Adaptive icon: transparent foreground over a solid background layer.
  { file: "android-icon-foreground.png", opts: { size: 1024, coverage: 0.58, withBeams: false } },
  {
    file: "android-icon-background.png",
    opts: { size: 1024, coverage: 0, background: NAVY },
    opaque: true,
  },
  { file: "android-icon-monochrome.png", opts: { size: 1024, coverage: 0.62, mono: true } },
  // Not referenced by app.json today, kept on-brand in case a splash is added.
  { file: "splash-icon.png", opts: { size: 1024, coverage: 0.62, withBeams: false } },
  {
    file: "favicon.png",
    opts: { size: 48, coverage: 0.72, background: NAVY, radius: 10, withBeams: false },
  },
];

await mkdir(DIR, { recursive: true });
for (const { file, opts, opaque } of targets) {
  const out = path.join(DIR, file);
  const pipeline = sharp(compose(opts));
  if (opaque) pipeline.flatten({ background: NAVY });
  await pipeline.png().toFile(out);
  const meta = await sharp(out).metadata();
  console.log(
    `${file.padEnd(32)} ${meta.width}x${meta.height}  alpha=${meta.hasAlpha ? "yes" : "no"}`,
  );
}
console.log("done");
