import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync("src/lib/admin-content-validation.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", "require", compiled)(exports, (specifier) => {
  if (specifier === "@/lib/data/families") return { DEFAULT_PRODUCT_FAMILIES: [{ id: "fam-wallpaper", slug: "wallpaper", name: { fa: "کاغذ دیواری", en: "Wallpaper" }, order: 1 }] };
  throw new Error(`Unexpected runtime dependency: ${specifier}`);
});
const { assertNoNewContentRelationIssues, InvalidContentRelationsError, validateSiteContentRelations } = exports;

const base = () => ({
  productFamilies: [{ id: "fam-wallpaper", slug: "wallpaper", name: { fa: "کاغذ دیواری", en: "Wallpaper" }, order: 1 }],
  categories: [{ id: "cat-1" }],
  portfolioCategories: [{ id: "pcat-1" }],
  spaces: [{ id: "space-1" }],
  artists: [{
    id: "artist-1",
    services: [{ id: "service-1" }],
    inquiries: [{ id: "inquiry-1", artistId: "artist-1", serviceId: "service-1" }],
  }],
  patterns: [{ id: "pattern-1", categoryId: "cat-1", spaceIds: ["space-1"], artistId: "artist-1" }],
  products: [{ id: "product-1", categoryId: "cat-1", familyId: "fam-wallpaper", patternId: "pattern-1", artistId: "artist-1" }],
  collections: [{ id: "collection-1", patternIds: ["pattern-1"], productIds: ["product-1"] }],
  portfolios: [{ id: "portfolio-1", categoryId: "pcat-1", artistId: "artist-1", patternIds: ["pattern-1"], productIds: ["product-1"] }],
  education: [{
    id: "course-1",
    categoryId: "cat-1",
    authorId: "artist-1",
    patternIds: ["pattern-1"],
    productIds: ["product-1"],
    lessonList: [{ id: "lesson-1" }],
    videoFiles: [{ id: "video-1", lessonId: "lesson-1" }],
    liveEvent: { instructorId: "artist-1" },
  }],
  stories: [{ id: "story-1", artistId: "artist-1" }],
  hero: { featuredPatternIds: ["pattern-1"] },
});

test("valid category, pattern, product, collection, academy and portfolio relations are accepted", () => {
  assert.deepEqual(validateSiteContentRelations(base()), []);
});

test("every invalid relationship reports its exact field path and expected collection", () => {
  const site = base();
  site.patterns[0].categoryId = "missing-category";
  site.patterns[0].spaceIds = ["missing-space"];
  site.products[0].patternId = "missing-pattern";
  site.products[0].familyId = "missing-family";
  site.collections[0].productIds = ["missing-product"];
  site.portfolios[0].categoryId = "missing-portfolio-category";
  site.education[0].authorId = "missing-artist";
  site.education[0].videoFiles[0].lessonId = "missing-lesson";
  site.artists[0].inquiries[0].artistId = "wrong-owner";
  site.artists[0].inquiries[0].serviceId = "missing-service";
  site.education[0].liveEvent.instructorId = "missing-instructor";
  site.stories[0].artistId = "missing-story-artist";
  site.hero.featuredPatternIds = ["missing-featured-pattern"];

  const issues = validateSiteContentRelations(site);
  const paths = new Set(issues.map((issue) => issue.path));
  for (const expected of [
    "patterns[0].categoryId",
    "patterns[0].spaceIds[0]",
    "products[0].familyId",
    "products[0].patternId",
    "collections[0].productIds[0]",
    "portfolios[0].categoryId",
    "education[0].authorId",
    "education[0].videoFiles[0].lessonId",
    "artists[0].inquiries[0].artistId",
    "artists[0].inquiries[0].serviceId",
    "education[0].liveEvent.instructorId",
    "stories[0].artistId",
    "hero.featuredPatternIds[0]",
  ]) assert.ok(paths.has(expected), `missing issue for ${expected}`);
  assert.ok(issues.every((issue) => issue.id && issue.relation));
});

test("required education authors cannot be omitted", () => {
  const site = base();
  delete site.education[0].authorId;
  const issue = validateSiteContentRelations(site).find((item) => item.path === "education[0].authorId");
  assert.deepEqual(issue, { path: "education[0].authorId", id: "", relation: "artists" });
});

test("deleting a pattern while a collection still references it is rejected", () => {
  const site = base();
  site.patterns = [];
  const issues = validateSiteContentRelations(site);
  assert.deepEqual(issues.map((issue) => issue.path), [
    "products[0].patternId",
    "collections[0].patternIds[0]",
    "portfolios[0].patternIds[0]",
    "education[0].patternIds[0]",
    "hero.featuredPatternIds[0]",
  ]);
});

test("deleting a referenced artist service or course lesson is rejected", () => {
  const current = base();
  const withoutService = {
    ...current,
    artists: current.artists.map((artist) => ({ ...artist, services: [] })),
  };
  const withoutLesson = {
    ...current,
    education: current.education.map((item) => ({ ...item, lessonList: [] })),
  };

  assert.throws(
    () => assertNoNewContentRelationIssues(current, withoutService),
    (error) => error instanceof InvalidContentRelationsError
      && error.issues.some((issue) => issue.path === "artists[0].inquiries[0].serviceId"),
  );
  assert.throws(
    () => assertNoNewContentRelationIssues(current, withoutLesson),
    (error) => error instanceof InvalidContentRelationsError
      && error.issues.some((issue) => issue.path === "education[0].videoFiles[0].lessonId"),
  );
});

test("removing a referenced artist is rejected with every orphaning field path", () => {
  const current = base();
  const next = { ...current, artists: [] };

  assert.throws(
    () => assertNoNewContentRelationIssues(current, next),
    (error) => {
      assert.ok(error instanceof InvalidContentRelationsError);
      assert.deepEqual(error.issues.map((issue) => issue.path), [
        "patterns[0].artistId",
        "products[0].artistId",
        "portfolios[0].artistId",
        "education[0].authorId",
        "education[0].liveEvent.instructorId",
        "stories[0].artistId",
      ]);
      assert.ok(error.issues.every((issue) => issue.id === "artist-1" && issue.relation === "artists"));
      return true;
    },
  );
});

test("artist removal does not fail on unrelated relationship issues already in legacy content", () => {
  const current = base();
  current.stories[0].artistId = "legacy-missing-artist";
  const next = { ...current, artists: [] };

  assert.throws(
    () => assertNoNewContentRelationIssues(current, next),
    (error) => {
      assert.ok(error instanceof InvalidContentRelationsError);
      assert.ok(error.issues.some((issue) => issue.path === "patterns[0].artistId"));
      assert.ok(!error.issues.some((issue) => issue.path === "stories[0].artistId"));
      return true;
    },
  );
});


test("the current SiteContent taxonomy accepts newly managed product families", () => {
  const site = base();
  site.productFamilies.push({ id: "fam-custom", slug: "custom-surface", name: { fa: "سطح سفارشی", en: "Custom Surface" }, order: 2 });
  site.products[0].familyId = "fam-custom";
  assert.deepEqual(validateSiteContentRelations(site), []);
});

test("removing a family still referenced by a product or artist signup is rejected", () => {
  const site = base();
  site.artists[0].signupFamilies = ["fam-wallpaper"];
  site.productFamilies = [];
  const paths = validateSiteContentRelations(site).map((issue) => issue.path);
  assert.ok(paths.includes("products[0].familyId"));
  assert.ok(paths.includes("artists[0].signupFamilies[0]"));
});

test("managed family IDs, slugs, bilingual names and order are validated", () => {
  const site = base();
  site.productFamilies.push({ id: "fam-wallpaper", slug: "Wallpaper", name: { fa: "", en: "" }, order: 1 });
  const paths = new Set(validateSiteContentRelations(site).map((issue) => issue.path));
  for (const path of ["productFamilies[1].id", "productFamilies[1].slug", "productFamilies[1].name.fa", "productFamilies[1].name.en", "productFamilies[1].order"]) {
    assert.ok(paths.has(path), `expected taxonomy issue at ${path}`);
  }
});
