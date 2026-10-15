import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function loadTierPricing() {
  const source = fs.readFileSync("src/lib/marketplace/tier-pricing.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", compiled)(exports);
  return exports;
}

const { applyTierPricingPatches } = loadTierPricing();

function tiers() {
  return [
    {
      id: "tier-personal",
      kind: "personal",
      title: { fa: "شخصی", en: "Personal" },
      terms: { fa: "شرایط شخصی", en: "Personal terms" },
      price: { fa: 100_000, en: 9.99 },
      maxDownloads: 5,
      maxUnits: 2,
      exclusive: false,
      enabled: true,
    },
    {
      id: "tier-exclusive",
      kind: "exclusive",
      title: { fa: "انحصاری", en: "Exclusive" },
      terms: { fa: "شرایط انحصاری", en: "Exclusive terms" },
      price: { fa: 2_500_000, en: 250 },
      maxDownloads: 5,
      maxUnits: 0,
      exclusive: true,
      enabled: false,
    },
  ];
}

test("moderation merges normalized prices and availability without changing the license definition", () => {
  const original = tiers();
  const result = applyTierPricingPatches(original, [
    { id: "tier-personal", priceFa: 125_000.4, priceEn: 12.345, enabled: false },
    { id: "tier-exclusive", enabled: true },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.tiers[0].price, { fa: 125_000, en: 12.35 });
  assert.equal(result.tiers[0].enabled, false);
  assert.deepEqual(result.tiers[0].title, original[0].title);
  assert.deepEqual(result.tiers[0].terms, original[0].terms);
  assert.equal(result.tiers[0].maxDownloads, original[0].maxDownloads);
  assert.equal(result.tiers[0].maxUnits, original[0].maxUnits);
  assert.equal(result.tiers[0].exclusive, original[0].exclusive);
  assert.deepEqual(result.tiers[1].price, original[1].price);
  assert.equal(result.tiers[1].enabled, true);
  assert.deepEqual(original, tiers(), "input tiers are not mutated");
});

test("moderation rejects malformed, unknown, repeated, or out-of-range tier patches", () => {
  const original = tiers();
  const cases = [
    [null, "invalid_tiers"],
    [[null], "invalid_tier_patch"],
    [[{ priceFa: 1 }], "invalid_tier_patch"],
    [[{ id: "missing", priceFa: 1 }], "unknown_tier"],
    [[{ id: "tier-personal", enabled: true }, { id: "tier-personal", enabled: false }], "duplicate_tier"],
    [[{ id: "tier-personal", priceFa: -1 }], "invalid_tier_price"],
    [[{ id: "tier-personal", priceEn: "12.00" }], "invalid_tier_price"],
    [[{ id: "tier-personal", priceEn: Number.NaN }], "invalid_tier_price"],
    [[{ id: "tier-personal", priceFa: Number.MAX_SAFE_INTEGER + 1 }], "invalid_tier_price"],
    [[{ id: "tier-personal", enabled: "yes" }], "invalid_tier_patch"],
    [[{ id: "tier-personal", maxUnits: 99 }], "invalid_tier_patch"],
    [[{ id: "tier-personal" }], "invalid_tier_patch"],
  ];

  for (const [input, error] of cases) {
    const result = applyTierPricingPatches(original, input);
    assert.deepEqual(result, { ok: false, error });
  }
  assert.deepEqual(original, tiers(), "failed patches never mutate stored tiers");
});
