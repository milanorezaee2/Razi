import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const normalIcon = path.join(root, "public/icons/icon-512.png");
const maskableIcon = path.join(root, "public/icons/icon-maskable-512.png");
const resRoot = path.join(root, "android/app/src/main/res");
const densities = [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
];

for (const [density, launcherSize, foregroundSize] of densities) {
  const directory = path.join(resRoot, `mipmap-${density}`);
  await sharp(normalIcon).resize(launcherSize, launcherSize, { fit: "cover" }).png().toFile(path.join(directory, "ic_launcher.png"));
  await sharp(normalIcon).resize(launcherSize, launcherSize, { fit: "cover" }).png().toFile(path.join(directory, "ic_launcher_round.png"));
  await sharp(maskableIcon).resize(foregroundSize, foregroundSize, { fit: "cover" }).png().toFile(path.join(directory, "ic_launcher_foreground.png"));
}

const backgroundFile = path.join(resRoot, "values/ic_launcher_background.xml");
const backgroundXml = await fs.readFile(backgroundFile, "utf8");
await fs.writeFile(backgroundFile, backgroundXml.replace(/#FFFFFF/gi, "#1E2230"));

console.log("Android launcher assets generated from public/icons.");
