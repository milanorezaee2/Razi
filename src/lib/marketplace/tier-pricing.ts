import type { LicenseTier } from "./types";

/** Only these seller-facing fields may be adjusted during admin moderation. */
export interface TierPricingPatch {
  id: string;
  priceFa?: number;
  priceEn?: number;
  enabled?: boolean;
}

export type TierPricingError =
  | "invalid_tiers"
  | "invalid_tier_patch"
  | "unknown_tier"
  | "duplicate_tier"
  | "invalid_tier_price";

export type TierPricingResult =
  | { ok: true; tiers: LicenseTier[] }
  | { ok: false; error: TierPricingError };

/**
 * Merge an untrusted price/availability patch into a catalog's existing tiers.
 *
 * The tier definition itself (title, terms, limits, exclusivity and kind) always
 * comes from the stored asset; a moderator can only change the two prices and
 * whether the tier is offered. Unknown and duplicate IDs are rejected rather
 * than silently ignored.
 */
export function applyTierPricingPatches(tiers: LicenseTier[], input: unknown): TierPricingResult {
  if (!Array.isArray(tiers) || !Array.isArray(input)) return { ok: false, error: "invalid_tiers" };

  const validIds = new Set(tiers.map((tier) => tier.id));
  const seen = new Set<string>();
  const patches = new Map<string, TierPricingPatch>();
  const allowedKeys = new Set(["id", "priceFa", "priceEn", "enabled"]);

  for (const value of input) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "invalid_tier_patch" };
    }

    const patch = value as Record<string, unknown>;
    if (Object.keys(patch).some((key) => !allowedKeys.has(key))) {
      return { ok: false, error: "invalid_tier_patch" };
    }

    const id = typeof patch.id === "string" ? patch.id.trim() : "";
    if (!id) return { ok: false, error: "invalid_tier_patch" };
    if (!validIds.has(id)) return { ok: false, error: "unknown_tier" };
    if (seen.has(id)) return { ok: false, error: "duplicate_tier" };
    seen.add(id);

    const hasFa = Object.prototype.hasOwnProperty.call(patch, "priceFa");
    const hasEn = Object.prototype.hasOwnProperty.call(patch, "priceEn");
    const hasEnabled = Object.prototype.hasOwnProperty.call(patch, "enabled");
    if (!hasFa && !hasEn && !hasEnabled) return { ok: false, error: "invalid_tier_patch" };

    if (hasFa && !isValidPrice(patch.priceFa, 0)) return { ok: false, error: "invalid_tier_price" };
    if (hasEn && !isValidPrice(patch.priceEn, 2)) return { ok: false, error: "invalid_tier_price" };
    if (hasEnabled && typeof patch.enabled !== "boolean") return { ok: false, error: "invalid_tier_patch" };

    patches.set(id, {
      id,
      ...(hasFa ? { priceFa: Math.round(patch.priceFa as number) } : {}),
      ...(hasEn ? { priceEn: Math.round((patch.priceEn as number) * 100) / 100 } : {}),
      ...(hasEnabled ? { enabled: patch.enabled as boolean } : {}),
    });
  }

  return {
    ok: true,
    tiers: tiers.map((tier) => {
      const patch = patches.get(tier.id);
      if (!patch) return tier;
      return {
        ...tier,
        price: {
          fa: patch.priceFa ?? tier.price.fa,
          en: patch.priceEn ?? tier.price.en,
        },
        enabled: patch.enabled ?? tier.enabled,
      };
    }),
  };
}

function isValidPrice(value: unknown, decimals: 0 | 2): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return false;
  const scaled = decimals === 0 ? Math.round(value) : Math.round(value * 100);
  return Number.isSafeInteger(scaled);
}
