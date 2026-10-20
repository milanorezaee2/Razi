import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("public mobile experience has navigation, a compact hero, and contained home sections", () => {
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
  const homePage = read("src/app/[locale]/page.tsx");

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
  assert.match(homePage, /className="home-page" lang={locale} dir={locale === "fa" \? "rtl" : "ltr"}/);
  const mobileOrder = homePage.match(/const MOBILE_HOME_SECTION_ORDER: Record<HomeSectionKey, number> = \{([\s\S]*?)\};/);
  assert.ok(mobileOrder);
  assert.deepEqual(
    Array.from(mobileOrder[1].matchAll(/^\s*([A-Za-z0-9]+): \d+,/gm), ([, key]) => key),
    ["hero", "discovery", "styles", "spaces", "trending", "newPatterns", "bestSellers", "exclusive", "artists", "portfolios", "projects", "education", "stories", "b2b", "custom", "newsletter"],
  );
  assert.ok(homePage.includes("style={{ order: MOBILE_HOME_SECTION_ORDER[section.key] }}"));
  assert.match(styles, /\.home-page\s*\{\s*display: flex;\s*flex-direction: column;/);
  assert.match(styles, /\.home-page__section\s*\{/);
  assert.match(styles, /\.home-page \.mobile-home-section\s*\{[^}]*overflow: hidden;[^}]*border-radius: 1\.2rem;/s);
  assert.match(styles, /\.home-page \.home-mobile-pattern-rail \.scroll-snap-x,[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /\.home-page \.home-portfolios__grid \.home-portfolio-card\s*\{[^}]*min-height: 0 !important;/s);
  assert.match(categories, /home-discovery__rail/);
  assert.match(categories, /className="home-portfolio-card"/);
  assert.match(styles, /clamp\(9\.5rem, 40vw, 14rem\)/);
  assert.match(styles, /\.mobile-hero__stats dd:first-of-type\s*\{\s*font-size: 1rem;/);
  assert.match(styles, /\.mobile-hero__stats dd:last-of-type\s*\{\s*overflow: hidden;\s*font-size: 0\.55rem;/);
  assert.match(styles, /\.mobile-hero__indicators\s*\{[^}]*margin-top: 0\.45rem;/s);
  assert.match(styles, /home-portfolios__grid/);
  assert.match(styles, /home-stories__grid/);
  assert.match(styles, /pattern-card__media--large/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /\.product-card__actions/);
});
