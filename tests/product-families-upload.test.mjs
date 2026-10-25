import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

function compileRoute({ activeFamilies }) {
  const baseRequire = createRequire(import.meta.url);
  const state = { creates: 0, contentReads: 0 };
  const mockRequire = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    if (specifier === "@/lib/marketplace/config") return {
      MAX_MASTER_BYTES: 100_000_000,
      MULTIPART_PART_SIZE: 10_000_000,
      MULTIPART_THRESHOLD_BYTES: 20_000_000,
      ACCEPTED_MASTER_MIME: { "image/png": true },
      storageProvider: () => "local",
    };
    if (specifier === "@/lib/marketplace/assets") return {
      createUploadSession: async (input) => {
        state.creates += 1;
        return { id: "upload-new", mode: "single", sizeBytes: input.sizeBytes };
      },
      getAssets: async () => [],
      getUploadSession: async () => null,
      abortUploadSession: async () => undefined,
    };
    if (specifier === "@/lib/marketplace/storage") return {
      presignUpload: () => "https://upload.example.test",
      stagingPartKey: () => "staging-part",
    };
    if (specifier === "@/lib/marketplace/upload-rules") return {
      formatAcceptError: () => null,
      normaliseColourwayId: (value) => value ?? "colour-original",
    };
    if (specifier === "@/lib/marketplace/guard") return {
      fail: (error, status = 400, details = {}) => Response.json({ ok: false, error, ...details }, { status }),
      json: (body, init) => Response.json(body, init),
      readJson: async (request) => request.json(),
      requireArtistOrAdmin: async () => ({ user: { id: "artist-user", role: "artist", artistId: "artist-1" } }),
    };
    if (specifier === "@/lib/rate-limit") return {
      clientIp: () => "127.0.0.1",
      recordAttempt: () => undefined,
      tooManyAttempts: () => false,
    };
    if (specifier === "@/lib/data/store") return {
      getContent: async () => {
        state.contentReads += 1;
        return { productFamilies: activeFamilies };
      },
    };
    if (specifier === "@/lib/product-family-lock") return { withProductFamilyLock: (operation) => operation() };
    if (specifier === "@/lib/marketplace/formats") return {
      EXPORT_FORMAT_IDS: ["png"],
      detectFormat: () => ({ id: "png" }),
      isExportFormatId: (value) => value === "png",
      minUploadBytes: () => 1,
    };
    return baseRequire(specifier);
  };
  const source = fs.readFileSync("src/app/api/marketplace/upload/session/route.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, mockRequire);
  return { route: exports, state };
}

function uploadRequest(familyId) {
  return new Request("https://example.test/api/marketplace/upload/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: "pattern.png",
      mime: "image/png",
      sizeBytes: 1024,
      familyId,
      formatId: "png",
      title: { fa: "پترن", en: "Pattern" },
    }),
  });
}

test("upload validation accepts a newly managed family from current SiteContent", async () => {
  const { route, state } = compileRoute({
    activeFamilies: [{ id: "fam-custom", slug: "custom", name: { fa: "سطح سفارشی", en: "Custom" }, order: 1 }],
  });
  const response = await route.POST(uploadRequest("fam-custom"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(state.creates, 1);
  assert.equal(state.contentReads, 1);
});

test("upload validation rejects IDs that are not in the current managed taxonomy", async () => {
  const { route, state } = compileRoute({
    activeFamilies: [{ id: "fam-custom", slug: "custom", name: { fa: "سطح سفارشی", en: "Custom" }, order: 1 }],
  });
  const response = await route.POST(uploadRequest("fam-wallpaper"));
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_family");
  assert.equal(state.creates, 0);
  assert.equal(state.contentReads, 1);
});
