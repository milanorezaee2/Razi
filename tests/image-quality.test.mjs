import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function sourceFiles(directory) {
  return fs
    .readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(file)
        : /\.(?:ts|tsx)$/.test(file)
          ? [file]
          : [];
    });
}

test("site images use the full-quality responsive image pipeline up to 4K", () => {
  const wrapperPath = "src/components/ui/SiteImage.tsx";
  const wrapper = read(wrapperPath);
  const config = read("next.config.ts");

  assert.match(wrapper, /quality\s*=\s*100/);
  assert.match(config, /deviceSizes:\s*\[[^\]]*3840/);
  assert.match(config, /qualities:\s*\[[^\]]*100/);

  const directNextImageImports = sourceFiles("src").filter(
    (file) =>
      file !== wrapperPath && /from\s+["']next\/image["']/.test(read(file)),
  );
  assert.deepEqual(
    directNextImageImports,
    [],
    "use SiteImage so the 100-quality default applies everywhere",
  );
});
