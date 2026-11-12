// Generates the staff job app (PWA) icons in public/icons from one SVG.
// Run: node scripts/generate-staff-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const BURGUNDY = "#7B1E3A";
const IVORY = "#FBF7F0";
const GOLD = "#C9A44C";

// pad = safe-zone inset as a fraction of the size (maskable icons need ~10%+).
const svg = (pad) => {
  const s = 512;
  const inner = s * (1 - pad * 2);
  const o = s * pad;
  const k = inner / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${pad ? 0 : 96}" fill="${BURGUNDY}"/>
  <g transform="translate(${o} ${o}) scale(${k})">
    <path d="M160 128h200v52H222v52h118v50H222v54h140v52H160z" fill="${IVORY}"/>
    <rect x="160" y="404" width="192" height="18" rx="9" fill="${GOLD}"/>
  </g>
</svg>`;
};

await mkdir("public/icons", { recursive: true });
await writeFile("public/icons/staff.svg", svg(0));
const targets = [
  ["staff-192.png", 192, 0],
  ["staff-512.png", 512, 0],
  ["staff-maskable-512.png", 512, 0.12],
  ["staff-180.png", 180, 0.06],
];
for (const [name, size, pad] of targets) {
  await sharp(Buffer.from(svg(pad)))
    .resize(size, size)
    .png()
    .toFile(`public/icons/${name}`);
}
console.log("icons written to public/icons");
