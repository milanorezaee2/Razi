import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminSession } from "@/lib/auth";
import { withNoStore } from "@/lib/http";
import { getContentWithEtag, resetContent, saveContent } from "@/lib/data/store";
import { seedContent } from "@/lib/data/seed";
import { getAssets, getUploadSessions } from "@/lib/marketplace/assets";
import { getProductFamilyReferenceCounts, hasProductFamilyReferences } from "@/lib/product-family-references";
import { withProductFamilyLock } from "@/lib/product-family-lock";
import { InvalidContentRelationsError, validateSiteContentRelations } from "@/lib/admin-content-validation";
import { sanitizeDeep } from "@/lib/security/sanitize";
import { verifyCsrf } from "@/lib/security/csrf";
import { applySecurityHeaders } from "@/lib/security/headers";
import type { SiteContent } from "@/lib/types";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** Maximum payload size for admin content writes — 5 MB is plenty for a JSON content tree. */
const MAX_BYTES = 5 * 1024 * 1024;

async function requireAdmin() {
  const user = await getAdminSession();
  return user?.role === "admin" ? user : null;
}

function unauthorized() {
  // No access to a real NextRequest here; use a minimal placeholder just to
  // look up hostname. The CSP/headers are not sensitive to which host emitted 401.
  const placeholder = {
    nextUrl: new URL("http://localhost/"),
    headers: new Headers(),
  } as unknown as NextRequest;
  return applySecurityHeaders(
    placeholder,
    NextResponse.json({ ok: false, error: "unauthorized" }, withNoStore({ status: 401 })),
  );
}

function expectedEtag(req: NextRequest): string | undefined {
  const value = req.headers.get("If-Match");
  if (value === null) return undefined;
  const tag = value.trim();
  return tag.startsWith('"') && tag.endsWith('"') ? tag.slice(1, -1) : tag;
}

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  const [content, etag] = await getContentWithEtag();
  const res = NextResponse.json(content, withNoStore());
  res.headers.set("ETag", `"${etag}"`);
  return res;
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) return unauthorized();

  // CSRF check on state change
  const csrf = verifyCsrf(req, await cookies());
  if (!csrf.ok) {
    return applySecurityHeaders(
      req,
      NextResponse.json({ ok: false, error: csrf.error }, withNoStore({ status: 403 })),
    );
  }

  // Reject overly large bodies before parsing
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) {
    return applySecurityHeaders(
      req,
      NextResponse.json({ ok: false, error: "payload_too_large" }, withNoStore({ status: 413 })),
    );
  }

  const body = (await req.json().catch(() => null)) as SiteContent | null;
  const requiredCollections: (keyof SiteContent)[] = [
    "productFamilies", "categories", "spaces", "artists", "patterns", "products", "portfolios",
    "education", "stories", "collections", "homeSections", "banners", "seo", "announcementBars",
  ];
  if (
    !body
    || requiredCollections.some((key) => !Array.isArray(body[key]))
    || (body.portfolioCategories !== undefined && !Array.isArray(body.portfolioCategories))
    || !body.hero || typeof body.hero !== "object"
  ) {
    return applySecurityHeaders(
      req,
      NextResponse.json({ ok: false, error: "invalid_payload" }, withNoStore({ status: 400 })),
    );
  }

  // Defense-in-depth sanitization — strip scripts/event handlers/JS URLs from every string field.
  const safeBody = sanitizeDeep(body) as SiteContent;
  const relationIssues = validateSiteContentRelations(safeBody);
  if (relationIssues.length > 0) {
    return applySecurityHeaders(
      req,
      NextResponse.json(
        { ok: false, error: "invalid_relationships", issues: relationIssues },
        withNoStore({ status: 422 }),
      ),
    );
  }

  const match = expectedEtag(req);
  if (match === undefined) {
    return applySecurityHeaders(
      req,
      NextResponse.json({ ok: false, error: "precondition_required" }, withNoStore({ status: 428 })),
    );
  }

  let savedEtag: string;
  try {
    savedEtag = await withProductFamilyLock(async () => {
      const [current, currentEtag] = await getContentWithEtag();
      if (currentEtag !== match) throw new Error("etag_conflict");

      const incomingFamilyIds = new Set(safeBody.productFamilies.map((family) => family.id));
      const removedFamilies = current.productFamilies.filter((family) => !incomingFamilyIds.has(family.id));
      if (removedFamilies.length) {
        const [assets, uploads] = await Promise.all([getAssets(), getUploadSessions()]);
        const references = getProductFamilyReferenceCounts(
          safeBody,
          assets,
          uploads,
          removedFamilies.map((family) => family.id),
        );
        const blocked = removedFamilies.find((family) => hasProductFamilyReferences(references[family.id]));
        if (blocked) {
          throw Object.assign(new Error("product_family_in_use"), {
            familyId: blocked.id,
            references: references[blocked.id],
          });
        }
      }

      return saveContent(safeBody, match);
    });
  } catch (e) {
    if (e instanceof Error && e.message === "etag_conflict") {
      return applySecurityHeaders(
        req,
        NextResponse.json({ ok: false, error: "etag_conflict" }, withNoStore({ status: 409 })),
      );
    }
    if (e instanceof Error && e.message === "product_family_in_use") {
      const dependency = e as Error & {
        familyId?: string;
        references?: ReturnType<typeof getProductFamilyReferenceCounts>[string];
      };
      return applySecurityHeaders(
        req,
        NextResponse.json(
          {
            ok: false,
            error: "product_family_in_use",
            familyId: dependency.familyId,
            references: dependency.references,
          },
          withNoStore({ status: 409 }),
        ),
      );
    }
    console.error("[admin/content] storage write failed:", e);
    return applySecurityHeaders(
      req,
      NextResponse.json({ ok: false, error: "storage_write_failed" }, withNoStore({ status: 502 })),
    );
  }
  const res = NextResponse.json({ ok: true }, withNoStore());
  res.headers.set("ETag", `"${savedEtag}"`);
  return applySecurityHeaders(req, res);
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return unauthorized();
  const csrf = verifyCsrf(req, await cookies());
  if (!csrf.ok) {
    return applySecurityHeaders(
      req,
      NextResponse.json({ ok: false, error: csrf.error }, withNoStore({ status: 403 })),
    );
  }
  const match = expectedEtag(req);
  if (match === undefined) {
    return applySecurityHeaders(
      req,
      NextResponse.json({ ok: false, error: "precondition_required" }, withNoStore({ status: 428 })),
    );
  }

  let resetEtag: string;
  try {
    resetEtag = await withProductFamilyLock(async () => {
      const [current, currentEtag] = await getContentWithEtag();
      if (currentEtag !== match) throw new Error("etag_conflict");

      const resetFamilyIds = new Set(seedContent.productFamilies.map((family) => family.id));
      const removedFamilies = current.productFamilies.filter((family) => !resetFamilyIds.has(family.id));
      if (removedFamilies.length) {
        const [assets, uploads] = await Promise.all([getAssets(), getUploadSessions()]);
        const references = getProductFamilyReferenceCounts(
          seedContent,
          assets,
          uploads,
          removedFamilies.map((family) => family.id),
        );
        const blocked = removedFamilies.find((family) => {
          const counts = references[family.id];
          return Boolean(counts && hasProductFamilyReferences(counts));
        });
        if (blocked) {
          throw Object.assign(new Error("product_family_in_use"), {
            familyId: blocked.id,
            references: references[blocked.id],
          });
        }
      }
      return resetContent(match);
    });
  } catch (e) {
    if (e instanceof Error && e.message === "product_family_in_use") {
      const dependency = e as Error & {
        familyId?: string;
        references?: ReturnType<typeof getProductFamilyReferenceCounts>[string];
      };
      return applySecurityHeaders(
        req,
        NextResponse.json(
          { ok: false, error: "product_family_in_use", familyId: dependency.familyId, references: dependency.references },
          withNoStore({ status: 409 }),
        ),
      );
    }
    if (e instanceof Error && e.message === "etag_conflict") {
      return applySecurityHeaders(
        req,
        NextResponse.json({ ok: false, error: "etag_conflict" }, withNoStore({ status: 409 })),
      );
    }
    if (e instanceof InvalidContentRelationsError) {
      return applySecurityHeaders(
        req,
        NextResponse.json({ ok: false, error: e.message, issues: e.issues }, withNoStore({ status: 422 })),
      );
    }
    console.error("[admin/content] storage reset failed:", e);
    return applySecurityHeaders(
      req,
      NextResponse.json({ ok: false, error: "storage_reset_failed" }, withNoStore({ status: 502 })),
    );
  }
  const res = NextResponse.json({ ok: true }, withNoStore());
  res.headers.set("ETag", `"${resetEtag}"`);
  return applySecurityHeaders(req, res);
}
