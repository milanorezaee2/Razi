import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

// Load a pure module with the project's own compiler (same trick as
// tests/statistics.test.mjs) so the assertions run against real behaviour
// instead of matching the source text.
function load(file, dependencies = {}) {
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", js)(exports, (name) => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected runtime dependency: ${name}`);
  });
  return exports;
}

const { isPublicPattern, publicSiteContent, isPublicArtist } = load(
  "src/lib/artist/public-profile.ts",
);
const { backfillLegacyPatternStatuses } = load("src/lib/pattern-status.ts");

const pattern = (overrides = {}) => ({
  id: "pat-1",
  sku: "PAT-1",
  slug: "pat-1",
  title: { fa: "پترن", en: "Pattern" },
  description: { fa: "", en: "" },
  image: "/images/p.jpg",
  gallery: [],
  categoryId: "cat-1",
  spaceIds: [],
  artistId: null,
  price: { fa: 0, en: 0 },
  specs: { repeat: { fa: "", en: "" }, dpi: "300", formats: "PNG", colors: 1, scale: { fa: "", en: "" } },
  palette: [],
  tags: [],
  featured: false,
  trending: false,
  bestSeller: false,
  isNew: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  likes: 0,
  ...overrides,
});

const site = (overrides = {}) => ({
  categories: [],
  spaces: [],
  artists: [],
  patterns: [],
  products: [],
  portfolios: [],
  education: [],
  stories: [],
  collections: [],
  homeSections: [],
  banners: [],
  seo: [],
  hero: {},
  announcementBars: [],
  ...overrides,
});

test("only a published pattern is public", () => {
  assert.equal(isPublicPattern(pattern({ status: "published" })), true);
  assert.equal(isPublicPattern(pattern({ status: "pending_review" })), false);
  assert.equal(isPublicPattern(pattern({ status: "draft" })), false);
  assert.equal(isPublicPattern(pattern({ status: "rejected" })), false);
});

test("a pattern without a status stays public so the legacy catalogue survives", () => {
  // Records written before the review workflow existed carry no status field.
  assert.equal(isPublicPattern(pattern()), true);
  assert.equal(isPublicPattern({ ...pattern(), status: undefined }), true);
});

test("the legacy-status migration publishes old patterns without overwriting decisions", () => {
  const old = pattern({ id: "old" });
  const pending = pattern({ id: "pending", status: "pending_review" });
  const rejected = pattern({ id: "rejected", status: "rejected" });
  const migrated = backfillLegacyPatternStatuses([old, pending, rejected]);

  assert.equal(migrated[0].status, "published");
  assert.equal(migrated[1], pending);
  assert.equal(migrated[2], rejected);
  assert.equal(old.status, undefined, "the migration must not mutate the seed/source object");
  assert.deepEqual(backfillLegacyPatternStatuses(migrated), migrated, "the migration is idempotent");
});

test("the public site drops every pattern that is not published", () => {
  const content = site({
    patterns: [
      pattern({ id: "a", status: "published" }),
      pattern({ id: "b", status: "pending_review" }),
      pattern({ id: "c", status: "draft" }),
      pattern({ id: "d", status: "rejected" }),
      pattern({ id: "e" }),
    ],
  });

  const ids = publicSiteContent(content).patterns.map((item) => item.id);
  assert.deepEqual(ids, ["a", "e"]);
});

test("a pending pattern of an approved artist is still hidden", () => {
  const content = site({
    artists: [
      { id: "artist-1", slug: "a", name: { fa: "الف", en: "A" }, profession: { fa: "", en: "" }, bio: { fa: "", en: "" }, avatar: "", cover: "", location: { fa: "", en: "" }, social: {}, featured: false, followers: 0, rating: 0, reviewsCount: 0, status: "approved" },
    ],
    patterns: [
      pattern({ id: "pub", artistId: "artist-1", status: "published" }),
      pattern({ id: "wait", artistId: "artist-1", status: "pending_review" }),
    ],
  });

  const ids = publicSiteContent(content).patterns.map((item) => item.id);
  assert.deepEqual(ids, ["pub"]);
});

test("a pattern of an artist who is not approved stays hidden whatever its status", () => {
  const content = site({
    artists: [
      { id: "artist-2", slug: "b", name: { fa: "ب", en: "B" }, profession: { fa: "", en: "" }, bio: { fa: "", en: "" }, avatar: "", cover: "", location: { fa: "", en: "" }, social: {}, featured: false, followers: 0, rating: 0, reviewsCount: 0, status: "pending", userId: "u-1" },
    ],
    patterns: [pattern({ id: "x", artistId: "artist-2", status: "published" })],
  });

  assert.deepEqual(publicSiteContent(content).patterns, []);
});

test("artist approval rules are unchanged by the pattern workflow", () => {
  assert.equal(isPublicArtist({ status: "approved" }), true);
  assert.equal(isPublicArtist({ status: "pending" }), false);
  assert.equal(isPublicArtist({ status: "rejected" }), false);
  // A site-owned artist (no account, no status) remains public.
  assert.equal(isPublicArtist({}), true);
});
