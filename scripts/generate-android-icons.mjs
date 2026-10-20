import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const normalIcon = path.join(root, "public/icons/icon-512.png");
const maskableIcon = path.join(root, "public/icons/icon-maskable-512.png");
const resRoot = path.join(root, "android/app/src/main/res");
const brandBackground = { r: 30, g: 34, b: 48, alpha: 1 };
const densities = [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
];

// Keep the recognizable Rosie Atelier mark, with a small shield/check badge to
// distinguish the private admin app from the public storefront app.
const badgeSize = 112;
const badgeInset = 80;
const adminBadge = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 144 144">
    <circle cx="72" cy="72" r="68" fill="#1e2230" stroke="#f7eadb" stroke-width="5"/>
    <path d="M72 25 111 40v31c0 25-15 43-39 57C48 114 33 96 33 71V40l39-15Z" fill="#b5713a" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
    <path d="m53 72 13 13 26-29" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`);

async function makeAdminIcon(source, size = 512) {
  const badgeLeft = 512 - badgeSize - badgeInset;
  const badgeTop = 512 - badgeSize - badgeInset;
  const base = await sharp(source).resize(512, 512, { fit: "cover" }).png().toBuffer();
  const branded = await sharp(base)
    .composite([{ input: adminBadge, left: badgeLeft, top: badgeTop }])
    .png()
    .toBuffer();
  return size === 512 ? branded : sharp(branded).resize(size, size, { fit: "cover" }).png().toBuffer();
}

for (const [density, launcherSize, foregroundSize] of densities) {
  const directory = path.join(resRoot, `mipmap-${density}`);
  const [launcher, foreground] = await Promise.all([
    makeAdminIcon(normalIcon, launcherSize),
    makeAdminIcon(maskableIcon, foregroundSize),
  ]);
  await Promise.all([
    fs.writeFile(path.join(directory, "ic_launcher.png"), launcher),
    fs.writeFile(path.join(directory, "ic_launcher_round.png"), launcher),
    fs.writeFile(path.join(directory, "ic_launcher_foreground.png"), foreground),
  ]);
}

const splashSizes = [
  ["drawable", 480, 320],
  ["drawable-port-mdpi", 320, 480],
  ["drawable-port-hdpi", 480, 800],
  ["drawable-port-xhdpi", 720, 1280],
  ["drawable-port-xxhdpi", 960, 1600],
  ["drawable-port-xxxhdpi", 1280, 1920],
  ["drawable-land-mdpi", 480, 320],
  ["drawable-land-hdpi", 800, 480],
  ["drawable-land-xhdpi", 1280, 720],
  ["drawable-land-xxhdpi", 1600, 960],
  ["drawable-land-xxxhdpi", 1920, 1280],
];
const splashMark = await makeAdminIcon(normalIcon);
for (const [directory, width, height] of splashSizes) {
  const markSize = Math.round(Math.min(width, height) * 0.42);
  const mark = await sharp(splashMark).resize(markSize, markSize, { fit: "contain" }).png().toBuffer();
  const output = await sharp({
    create: { width, height, channels: 4, background: brandBackground },
  })
    .composite([{ input: mark, left: Math.round((width - markSize) / 2), top: Math.round((height - markSize) / 2) }])
    .png()
    .toBuffer();
  await fs.writeFile(path.join(resRoot, directory, "splash.png"), output);
}

const backgroundFile = path.join(resRoot, "values/ic_launcher_background.xml");
const backgroundXml = await fs.readFile(backgroundFile, "utf8");
await fs.writeFile(backgroundFile, backgroundXml.replace(/#(?:FFFFFF|1E2230)/gi, "#1E2230"));

console.log("Rosie Admin launcher icons and branded splash screens generated.");
