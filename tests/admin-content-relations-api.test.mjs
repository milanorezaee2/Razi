import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const validationSource = fs.readFileSync("src/lib/admin-content-validation.ts", "utf8");
const validationModule = {};
new Function(
  "exports",
  "require",
  ts.transpileModule(validationSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
)(validationModule, (specifier) => {
  if (specifier === "@/lib/data/families") return { DEFAULT_PRODUCT_FAMILIES: [{ id: "fam-wallpaper", slug: "wallpaper", name: { fa: "کاغذ دیواری", en: "Wallpaper" }, order: 1 }] };
  throw new Error(`Unexpected runtime dependency: ${specifier}`);
});

const baseContent = () => ({
  productFamilies: [{ id: "fam-wallpaper", slug: "wallpaper", name: { fa: "کاغذ دیواری", en: "Wallpaper" }, order: 1 }],
  categories: [{ id: "category-1" }],
  spaces: [],
  artists: [
    {
      id: "artist-linked",
      services: [{ id: "service-linked" }],
      inquiries: [{ id: "inquiry-1", artistId: "artist-linked", serviceId: "service-linked" }],
    },
    { id: "artist-free", services: [], inquiries: [] },
  ],
  patterns: [{ id: "pattern-1", categoryId: "category-1", spaceIds: [], artistId: "artist-linked" }],
  products: [],
  collections: [],
  portfolios: [],
  education: [],
  stories: [],
  hero: { featuredPatternIds: [] },
});

function loadRoute(file, { content = baseContent(), users = [] } = {}) {
  const state = { content, users, contentWrites: 0, userWrites: 0 };
  const baseRequire = createRequire(import.meta.url);
  const MockNextResponse = { json: (body, init) => Response.json(body, init) };
  const mockRequire = (specifier) => {
    if (specifier === "next/server") return { NextResponse: MockNextResponse };
    if (specifier === "crypto") return baseRequire("node:crypto");
    if (specifier === "@/lib/auth") return { getAdminSession: async () => ({ role: "admin" }) };
    if (specifier === "@/lib/marketplace/guard") {
      return { requireArtistOrAdmin: async () => ({ user: { id: "user-linked", role: "artist", artistId: "artist-linked" } }) };
    }
    if (specifier === "@/lib/http") return { withNoStore: (init = {}) => init };
    if (specifier === "@/lib/admin-content-validation") return validationModule;
    if (specifier === "@/lib/data/store") {
      return {
        getContent: async () => state.content,
        getContentWithEtag: async () => [state.content, "etag-before"],
        mutateContent: async (mutator) => {
          const mutation = mutator(state.content);
          state.content = mutation.content;
          state.contentWrites += 1;
          return { result: mutation.result, etag: "etag-after" };
        },
        mutateCollection: async (key, mutator) => {
          const mutation = mutator(state.content[key], state.content);
          state.content = { ...state.content, [key]: mutation.items };
          state.contentWrites += 1;
          return { result: mutation.result, etag: "etag-after" };
        },
      };
    }
    if (specifier === "@/lib/data/users") {
      return {
        getAllUsers: async () => state.users,
        findUserById: async (id) => state.users.find((user) => user.id === id) ?? null,
        toPublicUser: (user) => user,
        updateUser: async () => null,
        saveAllUsers: async (users) => { state.users = users; state.userWrites += 1; },
        createUser: async () => null,
        upgradeUserToArtist: async () => null,
      };
    }
    throw new Error(`Unexpected import in API test: ${specifier}`);
  };
  const source = fs.readFileSync(file, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, mockRequire);
  return { route: exports, state };
}

async function responseBody(response) {
  return response.json();
}

test("admin artist deletion returns 422 and preserves content when the artist is referenced", async () => {
  const { route, state } = loadRoute("src/app/api/admin/artists/route.ts");
  const response = await route.DELETE(new Request("https://example.test/api/admin/artists?id=artist-linked"));
  const body = await responseBody(response);

  assert.equal(response.status, 422);
  assert.equal(body.error, "invalid_relationships");
  assert.deepEqual(body.issues.map((issue) => issue.path), ["patterns[0].artistId"]);
  assert.deepEqual(state.content.artists.map((artist) => artist.id), ["artist-linked", "artist-free"]);
  assert.equal(state.contentWrites, 0);
});

test("artist service deletion returns 422 and preserves the service when an inquiry references it", async () => {
  const { route, state } = loadRoute("src/app/api/artist/services/route.ts");
  const response = await route.DELETE(new Request("https://example.test/api/artist/services?id=service-linked", {
    method: "DELETE",
  }));
  const body = await responseBody(response);

  assert.equal(response.status, 422);
  assert.equal(body.error, "invalid_relationships");
  assert.deepEqual(body.issues.map((issue) => issue.path), ["artists[0].inquiries[0].serviceId"]);
  assert.deepEqual(state.content.artists[0].services.map((service) => service.id), ["service-linked"]);
  assert.equal(state.contentWrites, 0);
});

test("admin user deletion returns 422 without deleting the user or linked artist when referenced", async () => {
  const user = { id: "user-linked", role: "artist", artistId: "artist-linked" };
  const { route, state } = loadRoute("src/app/api/admin/users/route.ts", { users: [user] });
  const response = await route.DELETE(new Request("https://example.test/api/admin/users", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: user.id }),
  }));
  const body = await responseBody(response);

  assert.equal(response.status, 422);
  assert.equal(body.error, "invalid_relationships");
  assert.deepEqual(body.issues.map((issue) => issue.path), ["patterns[0].artistId"]);
  assert.deepEqual(state.content.artists.map((artist) => artist.id), ["artist-linked", "artist-free"]);
  assert.deepEqual(state.users, [user]);
  assert.equal(state.contentWrites, 0);
  assert.equal(state.userWrites, 0);
});

test("admin user deletion still succeeds for an unreferenced artist profile", async () => {
  const user = { id: "user-free", role: "artist", artistId: "artist-free" };
  const { route, state } = loadRoute("src/app/api/admin/users/route.ts", { users: [user] });
  const response = await route.DELETE(new Request("https://example.test/api/admin/users", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: user.id }),
  }));
  const body = await responseBody(response);

  assert.equal(response.status, 200);
  assert.deepEqual(body.removedArtistIds, ["artist-free"]);
  assert.deepEqual(state.content.artists.map((artist) => artist.id), ["artist-linked"]);
  assert.deepEqual(state.users, []);
  assert.equal(state.contentWrites, 1);
  assert.equal(state.userWrites, 1);
});
