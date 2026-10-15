import { DEFAULT_PRODUCT_FAMILIES } from "@/lib/data/families";
import type { ProductFamily } from "@/lib/data/families";
import type { SiteContent } from "@/lib/types";

export interface ContentRelationIssue {
  /** Dot/bracket path into the submitted SiteContent document. */
  path: string;
  /** The ID supplied by the caller (empty string when a required ID is missing). */
  id: string;
  /** The collection or relationship the ID was expected to belong to. */
  relation: string;
}

export class InvalidContentRelationsError extends Error {
  constructor(public readonly issues: ContentRelationIssue[]) {
    super("invalid_relationships");
    this.name = "InvalidContentRelationsError";
  }
}

export function assertSiteContentRelations(site: SiteContent): void {
  const issues = validateSiteContentRelations(site);
  if (issues.length) throw new InvalidContentRelationsError(issues);
}

/**
 * Guard a destructive incremental mutation without blocking it on unrelated
 * legacy issues that were already present in the stored document.
 */
export function assertNoNewContentRelationIssues(previous: SiteContent, next: SiteContent): void {
  const identity = (issue: ContentRelationIssue) => JSON.stringify([issue.path, issue.id, issue.relation]);
  const existing = new Set(validateSiteContentRelations(previous).map(identity));
  const introduced = validateSiteContentRelations(next).filter((issue) => !existing.has(identity(issue)));
  if (introduced.length) throw new InvalidContentRelationsError(introduced);
}

function ids(items: Array<{ id?: unknown }> | undefined): Set<string> {
  return new Set((Array.isArray(items) ? items : [])
    .map((item) => item?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0));
}

/**
 * Validate every cross-collection content ID at the server boundary.
 *
 * The validator uses the complete document being saved (including any new
 * categories/items in that same document). Admin/content writes are ETag
 * guarded, so the submitted snapshot must still be the current version.
 */
export function validateSiteContentRelations(site: SiteContent): ContentRelationIssue[] {
  const issues: ContentRelationIssue[] = [];
  const categories = ids(site.categories);
  const portfolioCategories = new Set([...categories, ...ids(site.portfolioCategories)]);
  const spaces = ids(site.spaces);
  const artists = ids(site.artists);
  const patterns = ids(site.patterns);
  const products = ids(site.products);
  // Missing taxonomy is tolerated only for older in-memory/test documents; persisted
  // admin writes require the collection and prepareContent backfills legacy data.
  const familyRecords = Array.isArray(site.productFamilies)
    ? site.productFamilies
    : DEFAULT_PRODUCT_FAMILIES;
  const productFamilies = ids(familyRecords as ProductFamily[]);
  const familySlugs = new Set<string>();
  const familyOrders = new Set<number>();
  const familyIdsSeen = new Set<string>();

  (familyRecords as unknown[]).forEach((rawFamily, index) => {
    const family = rawFamily && typeof rawFamily === "object"
      ? rawFamily as Partial<ProductFamily>
      : {};
    const id = typeof family.id === "string" ? family.id.trim() : "";
    if (!id || familyIdsSeen.has(id)) {
      issues.push({ path: `productFamilies[${index}].id`, id, relation: "unique product family id" });
    } else {
      familyIdsSeen.add(id);
    }

    const slug = typeof family.slug === "string" ? family.slug : "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80 || slug === "other" || familySlugs.has(slug)) {
      issues.push({ path: `productFamilies[${index}].slug`, id: slug, relation: "unique lowercase product family slug" });
    } else {
      familySlugs.add(slug);
    }

    for (const locale of ["fa", "en"] as const) {
      const name = family.name?.[locale];
      if (typeof name !== "string" || !name.trim() || name.length > 120) {
        issues.push({ path: `productFamilies[${index}].name.${locale}`, id: "", relation: "product family name" });
      }
    }

    const order = family.order;
    if (!Number.isInteger(order) || Number(order) < 1 || familyOrders.has(Number(order))) {
      issues.push({ path: `productFamilies[${index}].order`, id: String(order ?? ""), relation: "unique positive product family order" });
    } else {
      familyOrders.add(Number(order));
    }
  });

  const reference = (
    path: string,
    value: unknown,
    collection: string,
    available: Set<string>,
    required = false,
  ) => {
    if (value === undefined || value === null || value === "") {
      if (required) issues.push({ path, id: "", relation: collection });
      return;
    }
    if (typeof value !== "string" || !available.has(value)) {
      issues.push({ path, id: typeof value === "string" ? value : String(value), relation: collection });
    }
  };

  const references = (path: string, value: unknown, collection: string, available: Set<string>) => {
    if (!Array.isArray(value)) {
      issues.push({ path, id: "", relation: `${collection}[]` });
      return;
    }
    value.forEach((id, index) => reference(`${path}[${index}]`, id, collection, available, true));
  };

  (Array.isArray(site.patterns) ? site.patterns : []).forEach((pattern, index) => {
    reference(`patterns[${index}].categoryId`, pattern.categoryId, "categories", categories, true);
    references(`patterns[${index}].spaceIds`, pattern.spaceIds, "spaces", spaces);
    reference(`patterns[${index}].artistId`, pattern.artistId, "artists", artists);
  });

  (Array.isArray(site.products) ? site.products : []).forEach((product, index) => {
    reference(`products[${index}].categoryId`, product.categoryId, "categories", categories, true);
    reference(`products[${index}].familyId`, product.familyId, "product families", productFamilies);
    reference(`products[${index}].patternId`, product.patternId, "patterns", patterns);
    reference(`products[${index}].artistId`, product.artistId, "artists", artists);
  });

  (Array.isArray(site.collections) ? site.collections : []).forEach((collection, index) => {
    references(`collections[${index}].patternIds`, collection.patternIds, "patterns", patterns);
    references(`collections[${index}].productIds`, collection.productIds, "products", products);
  });

  (Array.isArray(site.portfolios) ? site.portfolios : []).forEach((portfolio, index) => {
    reference(`portfolios[${index}].categoryId`, portfolio.categoryId, "portfolioCategories/categories", portfolioCategories, true);
    reference(`portfolios[${index}].artistId`, portfolio.artistId, "artists", artists);
    references(`portfolios[${index}].patternIds`, portfolio.patternIds, "patterns", patterns);
    references(`portfolios[${index}].productIds`, portfolio.productIds, "products", products);
  });

  (Array.isArray(site.artists) ? site.artists : []).forEach((artist, artistIndex) => {
    const artistServiceIds = ids(artist.services);
    if (artist.signupFamilies !== undefined) {
      references(`artists[${artistIndex}].signupFamilies`, artist.signupFamilies, "product families", productFamilies);
    }
    (Array.isArray(artist.inquiries) ? artist.inquiries : []).forEach((inquiry, inquiryIndex) => {
      reference(
        `artists[${artistIndex}].inquiries[${inquiryIndex}].artistId`,
        inquiry.artistId,
        "owning artist",
        new Set([artist.id]),
        true,
      );
      reference(
        `artists[${artistIndex}].inquiries[${inquiryIndex}].serviceId`,
        inquiry.serviceId,
        "artist.services",
        artistServiceIds,
      );
    });
  });

  (Array.isArray(site.education) ? site.education : []).forEach((item, index) => {
    reference(`education[${index}].categoryId`, item.categoryId, "categories", categories, true);
    reference(`education[${index}].authorId`, item.authorId, "artists", artists, true);
    references(`education[${index}].patternIds`, item.patternIds, "patterns", patterns);
    references(`education[${index}].productIds`, item.productIds, "products", products);

    const lessonIds = ids(item.lessonList);
    (Array.isArray(item.videoFiles) ? item.videoFiles : []).forEach((video, videoIndex) => {
      reference(`education[${index}].videoFiles[${videoIndex}].lessonId`, video.lessonId, "education.lessonList", lessonIds);
    });

    if (item.liveEvent) {
      if (item.liveEvent.instructorId && !item.liveEvent.instructorNameCustom) {
        reference(`education[${index}].liveEvent.instructorId`, item.liveEvent.instructorId, "artists", artists);
      }
      if (item.liveEvent.hostId && !item.liveEvent.hostCustom) {
        reference(`education[${index}].liveEvent.hostId`, item.liveEvent.hostId, "artists", artists);
      }
    }
  });

  (Array.isArray(site.stories) ? site.stories : []).forEach((story, index) => {
    reference(`stories[${index}].artistId`, story.artistId, "artists", artists, true);
  });

  references("hero.featuredPatternIds", site.hero?.featuredPatternIds, "patterns", patterns);

  return issues;
}
