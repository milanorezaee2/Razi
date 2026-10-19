import type { Locale, Localized } from "../i18n/types";

/**
 * A product family is an admin-managed taxonomy record. The initial values live
 * here only as seed data; runtime consumers must use SiteContent.productFamilies.
 */
export interface ProductFamily {
  id: string;
  slug: string;
  name: Localized;
  order: number;
}

/** Initial taxonomy used to seed new/legacy SiteContent documents. */
export const DEFAULT_PRODUCT_FAMILIES: ProductFamily[] = [
  { id: "fam-wallpaper", slug: "wallpaper", name: { fa: "کاغذ دیواری", en: "Wallpaper" }, order: 1 },
  { id: "fam-home-fabric", slug: "home-fabric", name: { fa: "پارچه دکوراسیون داخلی", en: "Home Fabric" }, order: 2 },
  { id: "fam-curtain", slug: "curtain", name: { fa: "پرده", en: "Curtain" }, order: 3 },
  { id: "fam-cushion", slug: "cushion", name: { fa: "کوسن", en: "Cushion" }, order: 4 },
  { id: "fam-bedding", slug: "bedding", name: { fa: "روتختی", en: "Bedspread" }, order: 5 },
  { id: "fam-tablecloth", slug: "tablecloth", name: { fa: "رومیزی", en: "Tablecloth" }, order: 6 },
  { id: "fam-upholstery", slug: "upholstery-fabric", name: { fa: "پارچه مبلمان", en: "Upholstery Fabric" }, order: 7 },
  { id: "fam-wall-art", slug: "wall-art", name: { fa: "آثار هنری دیواری", en: "Wall Art" }, order: 8 },
];

/** The parent these families hang under — «پترن» (the pattern). */
export const FAMILY_PARENT: Localized = { fa: "پترن", en: "Pattern" };

/** Label for products that are not classified in any family yet. */
export const FAMILY_OTHER: Localized = { fa: "سایر محصولات", en: "Other products" };

export function orderedProductFamilies(families: readonly ProductFamily[]): ProductFamily[] {
  return [...families].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function familyById(
  families: readonly ProductFamily[],
  id: string | null | undefined,
): ProductFamily | null {
  if (!id) return null;
  return families.find((family) => family.id === id) ?? null;
}

export function familyBySlug(
  families: readonly ProductFamily[],
  slug: string | null | undefined,
): ProductFamily | null {
  if (!slug) return null;
  return families.find((family) => family.slug === slug) ?? null;
}

export function familyName(
  families: readonly ProductFamily[],
  id: string | null | undefined,
  locale: Locale,
): string {
  const family = familyById(families, id);
  return family ? family.name[locale] ?? family.name.fa : "";
}

/** Families in canonical order, optionally only those with a non-zero count. */
export function familiesWithCounts(
  families: readonly ProductFamily[],
  counts: Record<string, number>,
  onlyNonEmpty = false,
): ProductFamily[] {
  return orderedProductFamilies(families).filter(
    (family) => !onlyNonEmpty || (counts[family.id] ?? 0) > 0,
  );
}
