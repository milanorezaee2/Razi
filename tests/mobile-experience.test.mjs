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
  const gallery = read("src/components/product/Gallery.tsx");
  const productCard = read("src/components/cards/ProductCard.tsx");
  const patternCard = read("src/components/cards/PatternCard.tsx");
  const shopHero = read("src/components/shop/ShopHero.tsx");
  const styles = read("src/app/globals.css");

  assert.match(layout, /<MobileBottomNav\s*\/>/);
  assert.match(nav, /mobile-tabbar/);
  assert.match(nav, /openSearch/);
  assert.match(hero, /mobile-hero-scroll-wrapper/);
  assert.match(hero, /max-width: 767px/);
  assert.match(hero, /mobileViewport && !bgImages/);
  assert.match(hero, /slideImages && count > 1/);
  assert.match(hero, /priority=\{i === 0\}/);
  assert.match(hero, /280vw/);
  assert.match(hero, /185vw/);
  assert.match(categories, /mobile-category-list/);
  assert.match(grids, /grid-cols-2/);
  assert.match(gallery, /mobile-gallery-stage/);
  assert.match(gallery, /sizes="160px"/);
  assert.match(gallery, /\(max-width:767px\) 640px/);
  assert.match(shopHero, /min-h-\[260px\]/);
  assert.match(shopHero, /150vw/);
  assert.match(shopHero, /shop-hero__stats/);
  assert.match(patternCard, /115vw/);
  assert.match(productCard, /230vw/);
  assert.match(styles, /clamp\(31rem, 68svh, 38rem\)/);
  assert.match(styles, /pattern-card__media--large/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /\.product-card__actions/);
});
