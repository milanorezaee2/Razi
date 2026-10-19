import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const baseContent = () => ({
  productFamilies: [
    { id: "fam-wallpaper", slug: "wallpaper", name: { fa: "کاغذ دیواری", en: "Wallpaper" }, order: 1 },
    { id: "fam-custom", slug: "custom", name: { fa: "سطح سفارشی", en: "Custom Surface" }, order: 2 },
  ],
  categories: [],
  spaces: [],
  artists: [],
  patterns: [],
  products: [],
  portfolios: [],
  portfolioCategories: [],
  education: [],
  stories: [],
  collections: [],
  homeSections: [],
  banners: [],
  seo: [],
  hero: { featuredPatternIds: [] },
  announcementBars: [],
});

function compileModule(source, mockRequire) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, mockRequire);
  return exports;
}

function compileValidation(baseRequire) {
  const source = fs.readFileSync("src/lib/admin-content-validation.ts", "utf8");
  return compileModule(source, (specifier) => {
    if (specifier === "@/lib/data/families") {
      return { DEFAULT_PRODUCT_FAMILIES: baseContent().productFamilies };
    }
    return baseRequire(specifier);
  });
}

function loadContentRoute({ assets = [], uploads = [] } = {}) {
  const baseRequire = createRequire(import.meta.url);
  const state = { content: baseContent(), etag: "etag-before", writes: 0 };
  const validation = compileValidation(baseRequire);
  const familyReferences = compileModule(
    fs.readFileSync("src/lib/product-family-references.ts", "utf8"),
    (specifier) => {
      if (specifier === "@/lib/types" || specifier === "@/lib/marketplace/types") return {};
      return baseRequire(specifier);
    },
  );
  const mockRequire = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    if (specifier === "next/headers") return { cookies: async () => new Map() };
    if (specifier === "@/lib/auth") return { getAdminSession: async () => ({ role: "admin" }) };
    if (specifier === "@/lib/http") return { withNoStore: (init = {}) => init };
    if (specifier === "@/lib/data/seed") return { seedContent: baseContent() };
    if (specifier === "@/lib/data/store") return {
      getContentWithEtag: async () => [state.content, state.etag],
      saveContent: async (next, etag) => {
        if (etag !== state.etag) throw new Error("etag_conflict");
        state.content = next;
        state.etag = "etag-after";
        state.writes += 1;
        return state.etag;
      },
      resetContent: async (etag) => {
        if (etag !== state.etag) throw new Error("etag_conflict");
        state.content = baseContent();
        state.etag = "etag-after-reset";
        return state.etag;
      },
    };
    if (specifier === "@/lib/marketplace/assets") return {
      getAssets: async () => assets,
      getUploadSessions: async () => uploads,
    };
    if (specifier === "@/lib/product-family-references") return familyReferences;
    if (specifier === "@/lib/product-family-lock") return { withProductFamilyLock: (operation) => operation() };
    if (specifier === "@/lib/admin-content-validation") return validation;
    if (specifier === "@/lib/security/sanitize") return { sanitizeDeep: (value) => value };
    if (specifier === "@/lib/security/csrf") return { verifyCsrf: () => ({ ok: true }) };
    if (specifier === "@/lib/security/headers") return { applySecurityHeaders: (_request, response) => response };
    return baseRequire(specifier);
  };
  const route = compileModule(fs.readFileSync("src/app/api/admin/content/route.ts", "utf8"), mockRequire);
  return { route, state };
}

function requestFor(content) {
  return new Request("https://example.test/api/admin/content", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "If-Match": '"etag-before"',
    },
    body: JSON.stringify(content),
  });
}

test("admin content deletion is blocked when marketplace assets still use the family", async () => {
  const { route, state } = loadContentRoute({ assets: [{ id: "asset-1", familyId: "fam-custom" }] });
  const next = baseContent();
  next.productFamilies = [next.productFamilies[0]];

  const response = await route.PUT(requestFor(next));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error, "product_family_in_use");
  assert.equal(body.familyId, "fam-custom");
  assert.equal(body.references.marketplaceAssets, 1);
  assert.equal(state.writes, 0);
  assert.equal(state.content.productFamilies.length, 2);
});

test("admin content deletion is blocked when an open upload references the family", async () => {
  const { route, state } = loadContentRoute({ uploads: [{
    id: "upload-1",
    status: "open",
    meta: { familyId: "fam-custom" },
  }] });
  const next = baseContent();
  next.productFamilies = [next.productFamilies[0]];

  const response = await route.PUT(requestFor(next));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error, "product_family_in_use");
  assert.equal(body.references.openUploads, 1);
  assert.equal(state.writes, 0);
});

test("unused managed families can be removed and persisted with the current ETag", async () => {
  const { route, state } = loadContentRoute();
  const next = baseContent();
  next.productFamilies = [next.productFamilies[0]];

  const response = await route.PUT(requestFor(next));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("ETag"), '"etag-after"');
  assert.equal(state.writes, 1);
  assert.deepEqual(state.content.productFamilies.map((family) => family.id), ["fam-wallpaper"]);
});
