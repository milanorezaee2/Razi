import { decidePayout, listPayouts, payoutOverview, getPayoutProfile } from "@/lib/marketplace/payouts";
import { sendPayoutNotice } from "@/lib/marketplace/email";
import { fail, json, readJson, requireAdmin } from "@/lib/marketplace/guard";

export const dynamic = "force-dynamic";

/** GET /api/marketplace/admin/payouts — overview + requests (optionally ?artistId=). */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const artistId = url.searchParams.get("artistId") ?? undefined;

  if (artistId) {
    const [payouts, profile] = await Promise.all([listPayouts({ artistId }), getPayoutProfile(artistId)]);
    return json({ ok: true, payouts, profile });
  }

  const overview = await payoutOverview();
  return json({ ok: true, ...overview });
}

/**
 * POST /api/marketplace/admin/payouts
 *
 * Actions are approve | reject | confirm_manual_transfer. The last action is
 * only an operator attestation of a bank transfer completed outside this app;
 * no automatic payout provider is connected.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await readJson<{
    action?: "approve" | "reject" | "confirm_manual_transfer";
    payoutId?: string;
    reference?: string;
    note?: string;
    paymentEvidence?: string;
    manualTransferConfirmed?: boolean;
  }>(request);

  if (!body?.payoutId || !body.action) return fail("invalid_payload");
  if (!["approve", "reject", "confirm_manual_transfer"].includes(body.action)) return fail("invalid_action", 400);
  if (body.action === "confirm_manual_transfer" && body.manualTransferConfirmed !== true) {
    return fail("manual_transfer_confirmation_required", 422);
  }

  const status = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : "paid";
  const payout = await decidePayout({
    id: body.payoutId,
    status,
    decidedBy: auth.user.email,
    reference: body.reference,
    note: body.note,
    paymentEvidence: body.paymentEvidence,
    manualTransferConfirmed: body.manualTransferConfirmed,
  });
  if (!payout.ok) {
    if (payout.error === "not_found") return fail("not_found", 404);
    if (payout.error === "transfer_evidence_required" || payout.error === "manual_transfer_confirmation_required") {
      return fail(payout.error, 422);
    }
    return fail("invalid_payout_transition", 409);
  }
  const savedPayout = payout.payout;

  const profile = await getPayoutProfile(savedPayout.artistId);
  if (profile && (payout.statusChanged || payout.manualConfirmationRecorded)) {
    const { findUserById } = await import("@/lib/data/users");
    const { getAssets } = await import("@/lib/marketplace/assets");
    const assets = await getAssets();
    const owner = assets.find((asset) => asset.artistId === savedPayout.artistId)?.ownerUserId ?? null;
    const user = owner ? await findUserById(owner).catch(() => null) : null;
    if (user?.email) {
      await sendPayoutNotice({
        payout: savedPayout,
        to: user.email,
        artistName: user.name,
        locale: "fa",
      }).catch(() => undefined);
    }
  }

  return json({ ok: true, payout: savedPayout });
}
