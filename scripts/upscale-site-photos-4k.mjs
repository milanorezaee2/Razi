import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const IMAGE_ROOT = fileURLToPath(new URL("../public/images/", import.meta.url));
const TARGET_EDGE = 3840;
const JPEG_QUALITY = 85;
const WEBP_QUALITY = 85;
const RASTER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// This is an explicit pixel-dimension upscale, not a recovery of detail absent
// from the original. Keep it opt-in: it is run once for the current photo set.
async function listImages(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listImages(file)));
    else if (RASTER_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(file);
  }
  return files.sort();
}

const files = await listImages(IMAGE_ROOT);
let converted = 0;
let skipped = 0;
let inputBytes = 0;
let outputBytes = 0;

for (const file of files) {
  const sourceStat = await fs.stat(file);
  inputBytes += sourceStat.size;
  const metadata = await sharp(file).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  // Preserve sources that already meet or exceed the 4K long-edge target.
  if (Math.max(width, height) >= TARGET_EDGE) {
    skipped += 1;
    outputBytes += sourceStat.size;
    continue;
  }

  const format = metadata.format;
  let pipeline = sharp(file)
    .rotate()
    .resize({
      width: TARGET_EDGE,
      height: TARGET_EDGE,
      fit: "inside",
      withoutEnlargement: false,
      kernel: "lanczos3",
    });

  if (format === "jpeg") {
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: true });
  } else if (format === "webp") {
    pipeline = pipeline.webp({ quality: WEBP_QUALITY, effort: 4 });
  } else if (format === "png") {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  } else {
    throw new Error(`Unsupported raster format for ${file}: ${format ?? "unknown"}`);
  }

  const output = await pipeline.toBuffer();
  const temporaryFile = `${file}.4k-tmp`;
  await fs.rm(temporaryFile, { force: true });
  await fs.writeFile(temporaryFile, output);
  await fs.rename(temporaryFile, file);

  converted += 1;
  outputBytes += output.byteLength;
  const outputMetadata = await sharp(output).metadata();
  console.log(
    `${path.relative(IMAGE_ROOT, file)}: ${width}x${height} → ${outputMetadata.width}x${outputMetadata.height}`,
  );
}

console.log(
  `Finished ${files.length} site photos: ${converted} upscaled, ${skipped} already 4K. ` +
    `Files: ${(inputBytes / 1048576).toFixed(1)} MiB → ${(outputBytes / 1048576).toFixed(1)} MiB.`,
);
