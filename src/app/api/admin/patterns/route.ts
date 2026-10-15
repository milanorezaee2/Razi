import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminSession } from "@/lib/auth";
import { getContent, mutateCollection } from "@/lib/data/store";
import { withNoStore } from "@/lib/http";
import { verifyCsrf } from "@/lib/security/csrf";
import { applySecurityHeaders } from "@/lib/security/headers";
import type { Pattern, PatternStatus } from "@/lib/types";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const STATUSES: PatternStatus[] = ["draft", "pending_review", "published", "rejected"];

async function requireAdmin() {
  const session = await getAdminSession();
  return session?.role === "admin" ? session : null;
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, withNoStore({ status: 401 }));
}

function withContentEtag(response: NextResponse, etag: string) {
  response.headers.set("ETag", `"${etag}"`);
  return response;
}

/**
 * GET /api/admin/patterns — every pattern with its review state.
 *
 * The admin panel needs the pending queue as well as the published catalogue,
 * so this deliberately returns the unfiltered collection.
 */
export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  const content = await getContent();
  return NextResponse.json(
    {
      ok: true,
      patterns: content.patterns,
      pendingCount: content.patterns.filter((pattern) => pattern.status === "pending_review").length,
    },
    withNoStore(),
  );
}

/**
 * PATCH /api/admin/patterns — publish, reject or move a pattern.
 *
 * Body: { id: string; status: PatternStatus; rejectionNote?: string }
 *
 * The write is atomic against the current document, so a review decision never
 * overwrites a concurrent catalogue edit.
 */
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return unauthorized();

  const csrf = verifyCsrf(req, await cookies());
  if (!csrf.ok) {
    return applySecurityHeaders(
      req,
      NextResponse.json({ ok: false, error: csrf.error }, withNoStore({ status: 403 })),
    );
  }

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    status?: PatternStatus;
    rejectionNote?: string;
  } | null;

  if (!body?.id || !body.status || !STATUSES.includes(body.status)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, withNoStore({ status: 400 }));
  }

  try {
    const { result: pattern, etag } = await mutateCollection<"patterns", Pattern>(
      "patterns",
      (patterns) => {
        const index = patterns.findIndex((item) => item.id === body.id);
        if (index < 0) throw new Error("not_found");

        const current = patterns[index];
        const updated: Pattern = {
          ...current,
          status: body.status,
          // A rejection note belongs to the rejection; publishing clears it.
          rejectionNote: body.status === "rejected" ? body.rejectionNote?.trim() || undefined : undefined,
          submittedAt: body.status === "pending_review" ? new Date().toISOString() : current.submittedAt,
        };

        const next = [...patterns];
        next[index] = updated;
        return { items: next, result: updated };
      },
    );

    return withContentEtag(NextResponse.json({ ok: true, pattern }, withNoStore()), etag);
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") {
      return NextResponse.json({ ok: false, error: "not_found" }, withNoStore({ status: 404 }));
    }
    console.error("[admin/patterns] review mutation failed:", error);
    return NextResponse.json({ ok: false, error: "content_update_failed" }, withNoStore({ status: 502 }));
  }
}
