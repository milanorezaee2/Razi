import type { SiteContent } from "@/lib/types";
import type { Asset, UploadSession } from "@/lib/marketplace/types";

export interface ProductFamilyReferenceCounts {
  products: number;
  artistSignups: number;
  marketplaceAssets: number;
  openUploads: number;
}

export function hasProductFamilyReferences(references: ProductFamilyReferenceCounts): boolean {
  return references.products > 0
    || references.artistSignups > 0
    || references.marketplaceAssets > 0
    || references.openUploads > 0;
}

/**
 * Count every persisted reference that could be orphaned by removing taxonomy.
 * This helper is pure so the API guard and its tests use the same rules.
 */
export function getProductFamilyReferenceCounts(
  content: Pick<SiteContent, "productFamilies" | "products" | "artists">,
  assets: readonly Asset[],
  uploads: readonly UploadSession[],
  trackedFamilyIds: readonly string[] = (content.productFamilies ?? []).map((family) => family.id),
): Record<string, ProductFamilyReferenceCounts> {
  const counts: Record<string, ProductFamilyReferenceCounts> = Object.fromEntries(
    trackedFamilyIds.map((familyId) => [familyId, {
      products: 0,
      artistSignups: 0,
      marketplaceAssets: 0,
      openUploads: 0,
    } satisfies ProductFamilyReferenceCounts]),
  );
  const knownFamilies = new Set(Object.keys(counts));
  const assetFamilyById = new Map(assets.map((asset) => [asset.id, asset.familyId ?? null]));

  for (const product of content.products ?? []) {
    if (product.familyId && knownFamilies.has(product.familyId)) counts[product.familyId].products += 1;
  }
  for (const artist of content.artists ?? []) {
    for (const familyId of artist.signupFamilies ?? []) {
      if (knownFamilies.has(familyId)) counts[familyId].artistSignups += 1;
    }
  }
  for (const asset of assets) {
    if (asset.familyId && knownFamilies.has(asset.familyId)) counts[asset.familyId].marketplaceAssets += 1;
  }
  for (const upload of uploads) {
    if (upload.status !== "open") continue;
    const familyId = upload.meta.familyId ?? assetFamilyById.get(upload.attachToAssetId ?? "") ?? null;
    if (familyId && knownFamilies.has(familyId)) counts[familyId].openUploads += 1;
  }

  return counts;
}
