import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import test from "node:test";

const imageRoot = path.join(process.cwd(), "public/images");
const rasterExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function listPhotos(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return listPhotos(file);
    return rasterExtensions.has(path.extname(entry.name).toLowerCase()) ? [file] : [];
  });
}

test("every current site photo has a 4K-or-higher long edge", async () => {
  const photos = listPhotos(imageRoot);
  assert.ok(photos.length > 0, "expected the site photo library to be present");

  const undersized = [];
  for (const file of photos) {
    const { width = 0, height = 0 } = await sharp(file).metadata();
    if (Math.max(width, height) < 3840) {
      undersized.push(`${path.relative(process.cwd(), file)} (${width}x${height})`);
    }
  }

  assert.deepEqual(undersized, [], "all current raster photos should be 4K sources");
});
