import { NextResponse } from "next/server";
import { withNoStore } from "@/lib/http";
import { clientIp, recordAttempt, retryAfterSeconds, tooManyAttempts } from "@/lib/rate-limit";
import { subscribeNewsletter } from "@/lib/data/leads";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/newsletter — record an explicit e-mail opt-in before reporting success. */
export async function POST(req: Request) {
  const rateKey = `newsletter:${clientIp(req)}`;
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
  if (contentLength > 4 * 1024) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, withNoStore({ status: 413 }));
  }

  const body = (await req.json().catch(() => null)) as { email?: unknown; consent?: unknown; locale?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const consent = body?.consent === true || body?.consent === "yes" || body?.consent === "on";
  if (!email || email.length > 254 || !EMAIL_RE.test(email) || !consent) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, withNoStore({ status: 400 }));
  }

  const now = new Date().toISOString();
  try {
    const result = await subscribeNewsletter({
      email,
      locale: body?.locale === "en" ? "en" : "fa",
      consentAt: now,
      updatedAt: now,
    });
    return NextResponse.json(
      { ok: true, alreadySubscribed: result.alreadyActive, created: result.created },
      withNoStore({ status: result.created ? 201 : 200 }),
    );
  } catch (error) {
    console.error("[newsletter] unable to persist opt-in", error);
    return NextResponse.json({ ok: false, error: "storage_unavailable" }, withNoStore({ status: 503 }));
  }
}
