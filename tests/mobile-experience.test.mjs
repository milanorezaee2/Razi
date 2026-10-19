import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("public mobile experience has app navigation, adaptive hero, and touch-friendly catalog cards", () => {
  const layout = read("src/app/[locale]/layout.tsx");
  const nav = read("src/components/layout/MobileBottomNav.tsx");
  const hero = read("src/components/home/Hero.tsx");
  const categories = read("src/components/home/sections.tsx");
  const grids = read("src/components/product/Grids.tsx");
  const styles = read("src/app/globals.css");

  assert.match(layout, /<MobileBottomNav\s*\/>/);
  assert.match(nav, /mobile-tabbar/);
  assert.match(nav, /openSearch/);
  assert.match(hero, /mobile-hero-scroll-wrapper/);
  assert.match(hero, /max-width: 767px/);
  assert.match(categories, /mobile-category-list/);
  assert.match(grids, /grid-cols-2/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /\.product-card__actions/);
});
