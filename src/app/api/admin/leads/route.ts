import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getAdminSession } from "@/lib/auth";
import { withNoStore } from "@/lib/http";
import { verifyCsrf } from "@/lib/security/csrf";
import { applySecurityHeaders } from "@/lib/security/headers";
import {
  getContactLeads,
  getNewsletterSubscribers,
  setContactLeadStatus,
  setNewsletterStatus,
  type ContactLead,
  type ContactLeadStatus,
  type NewsletterStatus,
} from "@/lib/data/leads";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getAdminSession();
  return session?.role === "admin" ? session : null;
}

function json(req: NextRequest, body: unknown, init: ResponseInit = {}) {
  return applySecurityHeaders(req, NextResponse.json(body, withNoStore(init)));
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  // Prevent Excel/LibreOffice from interpreting user-entered values as formulas.
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvResponse(req: NextRequest, rows: Record<string, unknown>[], columns: string[], filename: string) {
  const lines = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))];
  const headers = new Headers(withNoStore().headers);
  headers.set("content-type", "text/csv; charset=utf-8");
  headers.set("content-disposition", `attachment; filename="${filename}"`);
  const response = new NextResponse(`\uFEFF${lines.join("\r\n")}`, {
    status: 200,
    headers,
  });
  return applySecurityHeaders(req, response);
}

/** GET /api/admin/leads?kind=contact|newsletter&format=csv — private inbox and export. */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return json(req, { ok: false, error: "unauthorized" }, { status: 401 });

  const kind = req.nextUrl.searchParams.get("kind") ?? "contact";
  const csv = req.nextUrl.searchParams.get("format") === "csv";
  const limitValue = Number(req.nextUrl.searchParams.get("limit") ?? 500);
  const limit = Number.isFinite(limitValue) ? Math.min(5000, Math.max(1, Math.floor(limitValue))) : 500;

  try {
    if (kind === "contact") {
      const leads = (await getContactLeads())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map(withoutDedupeKey);
      if (csv) {
        const columns = ["id", "createdAt", "status", "kind", "name", "email", "phone", "projectType", "message", "consentAt", "locale"];
        return csvResponse(req, leads as unknown as Record<string, unknown>[], columns, "rosie-contact-leads.csv");
      }
      return json(req, { ok: true, kind, leads });
    }

    if (kind === "newsletter") {
      const subscribers = (await getNewsletterSubscribers())
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit);
      if (csv) {
        const columns = ["email", "status", "locale", "createdAt", "updatedAt", "consentAt"];
        return csvResponse(req, subscribers as unknown as Record<string, unknown>[], columns, "rosie-newsletter-subscribers.csv");
      }
      return json(req, { ok: true, kind, subscribers });
    }

    return json(req, { ok: false, error: "invalid_kind" }, { status: 400 });
  } catch (error) {
    console.error("[admin/leads] unable to read inbox", error);
    return json(req, { ok: false, error: "storage_unavailable" }, { status: 503 });
  }
}

/** PATCH /api/admin/leads — mark a contact read/archived or opt a subscriber out. */
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return json(req, { ok: false, error: "unauthorized" }, { status: 401 });

  const csrf = verifyCsrf(req, await cookies());
  if (!csrf.ok) return json(req, { ok: false, error: csrf.error }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    kind?: string;
    id?: string;
    email?: string;
    status?: string;
  } | null;
  if (!body) return json(req, { ok: false, error: "invalid_payload" }, { status: 400 });

  try {
    if (body.kind === "contact") {
      if (!body.id || !["new", "read", "archived"].includes(body.status ?? "")) {
        return json(req, { ok: false, error: "invalid_payload" }, { status: 400 });
      }
      const lead = await setContactLeadStatus(body.id, body.status as ContactLeadStatus);
      return lead
        ? json(req, { ok: true, lead: withoutDedupeKey(lead) })
        : json(req, { ok: false, error: "not_found" }, { status: 404 });
    }

    if (body.kind === "newsletter") {
      const email = body.email?.trim().toLowerCase();
      if (!email || body.status !== "unsubscribed") {
        return json(req, { ok: false, error: "invalid_payload" }, { status: 400 });
      }
      const subscriber = await setNewsletterStatus(email, body.status as NewsletterStatus);
      return subscriber
        ? json(req, { ok: true, subscriber })
        : json(req, { ok: false, error: "not_found" }, { status: 404 });
    }

    return json(req, { ok: false, error: "invalid_kind" }, { status: 400 });
  } catch (error) {
    console.error("[admin/leads] unable to update inbox record", error);
    return json(req, { ok: false, error: "storage_unavailable" }, { status: 503 });
  }
}

function withoutDedupeKey(lead: ContactLead): Omit<ContactLead, "dedupeKey"> {
  return Object.fromEntries(Object.entries(lead).filter(([key]) => key !== "dedupeKey")) as Omit<ContactLead, "dedupeKey">;
}
