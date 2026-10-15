import { NextResponse } from "next/server";
import { withNoStore } from "@/lib/http";
import { clientIp, recordAttempt, retryAfterSeconds, tooManyAttempts } from "@/lib/rate-limit";
import { createContactLead, newLeadId, type ContactLeadKind } from "@/lib/data/leads";

export const dynamic = "force-dynamic";

const KINDS: ContactLeadKind[] = ["b2b", "custom", "contact", "creator"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return normalized.length <= max ? normalized : null;
}

function isLocale(value: unknown): value is "fa" | "en" {
  return value === "fa" || value === "en";
}

/** POST /api/contact — persist a contact, custom-project, creator or B2B lead. */
export async function POST(req: Request) {
  const rateKey = `contact:${clientIp(req)}`;
  if (tooManyAttempts(rateKey)) {
    const wait = retryAfterSeconds(rateKey);
    const response = NextResponse.json(
      { ok: false, error: "rate_limited", retryAfter: wait },
      withNoStore({ status: 429 }),
    );
    if (wait > 0) response.headers.set("Retry-After", String(wait));
    return response;
  }
  recordAttempt(rateKey);

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 32 * 1024) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, withNoStore({ status: 413 }));
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = body?.kind;
  const name = cleanText(body?.name, 120);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = body?.phone === undefined || body.phone === "" ? "" : cleanText(body.phone, 40);
  const projectType = body?.type === undefined || body.type === "" ? "" : cleanText(body.type, 120);
  const message = cleanText(body?.message, 5_000);
  const consent = body?.consent === true || body?.consent === "yes" || body?.consent === "on";
  const phoneValid = phone !== null && /^[+0-9() .-]{0,40}$/.test(phone);

  if (
    !body || !KINDS.includes(kind as ContactLeadKind)
    || !name || name.length < 2
    || !email || email.length > 254 || !EMAIL_RE.test(email)
    || !phoneValid || projectType === null
    || !message || message.length < 5
    || !consent
  ) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, withNoStore({ status: 400 }));
  }

  const createdAt = new Date().toISOString();
  try {
    const result = await createContactLead({
      id: newLeadId(),
      kind: kind as ContactLeadKind,
      name,
      email,
      ...(phone ? { phone } : {}),
      ...(projectType ? { projectType } : {}),
      message,
      locale: isLocale(body.locale) ? body.locale : "fa",
      consentAt: createdAt,
      createdAt,
    });

    return NextResponse.json(
      { ok: true, id: result.lead.id, duplicate: !result.created },
      withNoStore({ status: result.created ? 201 : 200 }),
    );
  } catch (error) {
    console.error("[contact] unable to persist inquiry", error);
    return NextResponse.json({ ok: false, error: "storage_unavailable" }, withNoStore({ status: 503 }));
  }
}
