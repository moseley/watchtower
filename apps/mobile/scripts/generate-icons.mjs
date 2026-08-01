/**
 * Rasterises the Watchtower mark into the PNGs Expo needs.
 *
 *   node scripts/generate-icons.mjs
 *
 * The mark is Lucide's RadioTower on an accent tile, matching the Atlas mock.
 * The same geometry lives in components/Logo.tsx and in the web app's
 * Logo.tsx / icon.svg — edit all of them together if the logo changes.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets");

const ACCENT = "#0F6B4F";

/** Lucide RadioTower, drawn in a 24-unit box. */
const GLYPH = `
  <path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/>
  <path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/>
  <circle cx="12" cy="9" r="2"/>
  <path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/>
  <path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/>
  <path d="M9.5 18h5"/>
  <path d="m8 22 4-11 4 11"/>`;

/**
 * @param coverage how much of the canvas the glyph spans. Android adaptive
 *   layers are clipped to a circle, so they need a smaller value to stay
 *   inside the safe zone.
 */
function compose({ size, coverage, background = null, radius = 0, stroke = "#FFFFFF" }) {
  const scale = (size * coverage) / 24;
  const offset = size / 2 - 12 * scale;

  const bg = background
    ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${background}"/>`
    : "";

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
       ${bg}
       <g transform="translate(${offset} ${offset}) scale(${scale})"
          fill="none" stroke="${stroke}" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">${GLYPH}</g>
     </svg>`,
  );
}

const targets = [
  // Full-bleed square; iOS and the launcher apply their own rounding.
  // App Store review rejects icons that carry an alpha channel, so flatten it.
  {
    file: "icon.png",
    opts: { size: 1024, coverage: 0.56, background: ACCENT },
    opaque: true,
  },
  // Adaptive icon: transparent glyph layer over a solid accent background.
  { file: "android-icon-foreground.png", opts: { size: 1024, coverage: 0.42 } },
  {
    file: "android-icon-background.png",
    opts: { size: 1024, coverage: 0, background: ACCENT },
    opaque: true,
  },
  // Themed icons use only the alpha channel, so the glyph alone is enough.
  { file: "android-icon-monochrome.png", opts: { size: 1024, coverage: 0.42 } },
  { file: "splash-icon.png", opts: { size: 1024, coverage: 0.5, background: ACCENT, radius: 256 } },
  {
    file: "favicon.png",
    opts: { size: 48, coverage: 0.56, background: ACCENT, radius: 12 },
  },
];

await mkdir(DIR, { recursive: true });
for (const { file, opts, opaque } of targets) {
  const out = path.join(DIR, file);
  const pipeline = sharp(compose(opts));
  if (opaque) pipeline.flatten({ background: ACCENT });
  await pipeline.png().toFile(out);
  const meta = await sharp(out).metadata();
  console.log(
    `${file.padEnd(32)} ${meta.width}x${meta.height}  alpha=${meta.hasAlpha ? "yes" : "no"}`,
  );
}
console.log("done");
