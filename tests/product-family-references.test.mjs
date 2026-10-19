import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync("src/lib/product-family-references.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", "require", compiled)(exports, () => {
  throw new Error("product-family-reference helper should have no runtime imports");
});
const { getProductFamilyReferenceCounts, hasProductFamilyReferences } = exports;

const content = {
  productFamilies: [
    { id: "fam-wallpaper", slug: "wallpaper", name: { fa: "کاغذ", en: "Wallpaper" }, order: 1 },
    { id: "fam-custom", slug: "custom", name: { fa: "سفارشی", en: "Custom" }, order: 2 },
  ],
  products: [
    { id: "product-1", familyId: "fam-wallpaper" },
    { id: "product-2", familyId: "fam-custom" },
  ],
  artists: [{ id: "artist-1", signupFamilies: ["fam-wallpaper", "fam-custom"] }],
};

test("family dependencies count products, artist signups, marketplace assets and open uploads", () => {
  const assets = [
    { id: "asset-1", familyId: "fam-wallpaper" },
    { id: "asset-2", familyId: "fam-custom" },
  ];
  const uploads = [
    { id: "upload-1", status: "open", meta: { familyId: "fam-wallpaper" } },
    { id: "upload-2", status: "open", meta: { familyId: null }, attachToAssetId: "asset-2" },
    { id: "upload-done", status: "completed", meta: { familyId: "fam-custom" } },
  ];

  const counts = getProductFamilyReferenceCounts(content, assets, uploads);
  assert.deepEqual(counts["fam-wallpaper"], {
    products: 1,
    artistSignups: 1,
    marketplaceAssets: 1,
    openUploads: 1,
  });
  assert.deepEqual(counts["fam-custom"], {
    products: 1,
    artistSignups: 1,
    marketplaceAssets: 1,
    openUploads: 1,
  });
  assert.equal(hasProductFamilyReferences(counts["fam-wallpaper"]), true);
});

test("completed uploads do not block deletion, but an unused family remains deletable", () => {
  const next = {
    ...content,
    products: [],
    artists: [],
  };
  const counts = getProductFamilyReferenceCounts(next, [], [
    { id: "upload-done", status: "completed", meta: { familyId: "fam-wallpaper" } },
  ]);
  assert.equal(hasProductFamilyReferences(counts["fam-wallpaper"]), false);
});

test("removed families can be included explicitly when counting submitted references", () => {
  const next = { ...content, productFamilies: [] };
  const counts = getProductFamilyReferenceCounts(next, [{ id: "asset-1", familyId: "fam-wallpaper" }], [], ["fam-wallpaper"]);
  assert.deepEqual(counts["fam-wallpaper"], {
    products: 1,
    artistSignups: 1,
    marketplaceAssets: 1,
    openUploads: 0,
  });
});
