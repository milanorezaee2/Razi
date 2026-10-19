import "server-only";
import { KEYS, mutateCollection, readCollection } from "./store";
import { newId } from "./assets";
import { getSettings } from "./assets";
import { artistBalance } from "./royalty";
import { addPrice, clampPrice, subPrice, ZERO_PRICE } from "./money";
import { getLicensesForArtist } from "./orders";
import type { LedgerEntry, Payout, PayoutProfile, PayoutStatus, PricePair } from "./types";

/**
 * Artist payouts.
 *
 *   request → approved → paid (internal marker after manual off-app confirmation)
 *                └──────────→ rejected (releases the hold)
 *
 * `requestPayout()` refuses to overdraw: the artist's *available* balance is
 * derived from the append-only ledger minus payouts already requested/recorded,
 * and the request stores the balance snapshot it was validated against so the
 * decision is auditable later. No automatic bank-transfer provider is connected.
 */

export async function getPayoutProfiles(): Promise<PayoutProfile[]> {
  return readCollection<PayoutProfile>(KEYS.payoutProfiles);
}

export async function getPayoutProfile(artistId: string): Promise<PayoutProfile | null> {
  const profiles = await getPayoutProfiles();
  return profiles.find((profile) => profile.artistId === artistId) ?? null;
}

export async function savePayoutProfile(profile: Omit<PayoutProfile, "updatedAt">): Promise<PayoutProfile> {
  const record: PayoutProfile = { ...profile, updatedAt: new Date().toISOString() };
  await mutateCollection<PayoutProfile, void>(KEYS.payoutProfiles, (items) => {
    const index = items.findIndex((item) => item.artistId === profile.artistId);
    if (index === -1) return { next: [...items, record], result: undefined };
    const copy = items.slice();
    copy[index] = record;
    return { next: copy, result: undefined };
  });
  return record;
}

export async function getPayouts(): Promise<Payout[]> {
  return readCollection<Payout>(KEYS.payouts);
}

export async function listPayouts(filter: { artistId?: string; status?: PayoutStatus } = {}): Promise<Payout[]> {
  const payouts = await getPayouts();
  return payouts
    .filter((payout) => (!filter.artistId || payout.artistId === filter.artistId) && (!filter.status || payout.status === filter.status))
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

export async function savePayout(payout: Payout): Promise<Payout> {
  await mutateCollection<Payout, void>(KEYS.payouts, (items) => {
    const index = items.findIndex((item) => item.id === payout.id);
    if (index === -1) return { next: [...items, payout], result: undefined };
    const copy = items.slice();
    copy[index] = payout;
    return { next: copy, result: undefined };
  });
  return payout;
}

/* ------------------------------------------------------------------ */
/* Wallet                                                             */
/* ------------------------------------------------------------------ */

export interface ArtistWallet {
  artistId: string;
  balance: ReturnType<typeof artistBalance>;
  profile: PayoutProfile | null;
  payouts: Payout[];
  ledger: LedgerEntry[];
  minimum: PricePair;
  licenses: number;
  monthly: { month: string; amount: PricePair }[];
}

export async function artistWalletDetails(artistId: string): Promise<ArtistWallet> {
  const [ledger, payouts, profile, licenses, settings] = await Promise.all([
    readCollection<LedgerEntry>(KEYS.ledger),
    getPayouts(),
    getPayoutProfile(artistId),
    getLicensesForArtist(artistId),
    getSettings(),
  ]);

  const myLedger = ledger.filter((entry) => entry.artistId === artistId);
  const myPayouts = payouts.filter((payout) => payout.artistId === artistId);

  const months = new Map<string, PricePair>();
  for (const entry of myLedger) {
    if (entry.kind !== "sale") continue;
    const month = entry.createdAt.slice(0, 7);
    months.set(month, addPrice(months.get(month) ?? ZERO_PRICE, entry.amount));
  }

  return {
    artistId,
    balance: artistBalance({ ledger: myLedger, payouts: myPayouts }),
    profile,
    payouts: myPayouts.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()),
    ledger: myLedger.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 60),
    minimum: { fa: settings.payoutMinimumFa, en: settings.payoutMinimumEn },
    licenses: licenses.length,
    monthly: [...months.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 6).map(([month, amount]) => ({ month, amount })),
  };
}

/* ------------------------------------------------------------------ */
/* Requests                                                           */
/* ------------------------------------------------------------------ */

export interface PayoutRequestResult {
  ok: boolean;
  payout?: Payout;
  error?:
    | "no_profile"
    | "below_minimum"
    | "insufficient_balance"
    | "pending_request_exists"
    | "amount_invalid";
  available?: PricePair;
}

export async function requestPayout(input: {
  artistId: string;
  userId: string | null;
  /** Optional partial amount; defaults to the full available balance. */
  amount?: PricePair;
  note?: string;
}): Promise<PayoutRequestResult> {
  const wallet = await artistWalletDetails(input.artistId);
  const profile = wallet.profile;

  if (!profile) return { ok: false, error: "no_profile", available: wallet.balance.available };
  if (wallet.payouts.some((payout) => payout.status === "requested" || payout.status === "approved")) {
    return { ok: false, error: "pending_request_exists", available: wallet.balance.available };
  }

  const available = wallet.balance.available;
  const requested = input.amount
    ? { fa: Math.max(0, Math.round(input.amount.fa)), en: Math.max(0, Math.round(input.amount.en * 100) / 100) }
    : available;

  if (requested.fa <= 0 && requested.en <= 0) return { ok: false, error: "amount_invalid", available };
  if (requested.fa > available.fa + 1 || requested.en > available.en + 0.01) {
    return { ok: false, error: "insufficient_balance", available };
  }

  const meetsFa = requested.fa >= wallet.minimum.fa;
  const meetsEn = requested.en >= wallet.minimum.en;
  if (!meetsFa && !meetsEn) return { ok: false, error: "below_minimum", available };

  const destination =
    profile.method === "iban" ? profile.iban ?? "" : profile.method === "card" ? profile.cardNumber ?? "" : profile.paypalEmail ?? "";

  const payout: Payout = {
    id: newId("po"),
    artistId: input.artistId,
    userId: input.userId,
    amount: requested,
    method: profile.method,
    destination,
    status: "requested",
    requestedAt: new Date().toISOString(),
    note: input.note,
    balanceAtRequest: available,
  };

  return { ok: true, payout: await savePayout(payout) };
}

export type PayoutDecisionResult =
  | { ok: true; payout: Payout; statusChanged: boolean; manualConfirmationRecorded: boolean }
  | {
      ok: false;
      error: "not_found" | "invalid_transition" | "transfer_evidence_required" | "manual_transfer_confirmation_required";
    };

/** A paid payout is only ledger-eligible when an operator explicitly confirmed the off-app transfer and its evidence is stored. */
function hasRecordedManualTransferConfirmation(payout: Payout): boolean {
  return payout.status === "paid"
    && payout.settlementMode === "manual"
    && payout.manualTransferConfirmed === true
    && Boolean(payout.manualTransferConfirmedAt)
    && Boolean(payout.manualTransferConfirmedBy?.trim())
    && Boolean(payout.reference?.trim())
    && Boolean(payout.paymentEvidence?.trim());
}

export async function decidePayout(input: {
  id: string;
  status: Extract<PayoutStatus, "approved" | "rejected" | "paid">;
  decidedBy: string;
  reference?: string;
  note?: string;
  paymentEvidence?: string;
  /** Must be true when an admin records or corrects a manual, off-app transfer. */
  manualTransferConfirmed?: boolean;
}): Promise<PayoutDecisionResult> {
  const decision = await mutateCollection<Payout, PayoutDecisionResult>(KEYS.payouts, (items) => {
    const index = items.findIndex((item) => item.id === input.id);
    if (index < 0) return { result: { ok: false, error: "not_found" } };
    const payout = items[index];
    const statusChanged = payout.status !== input.status;
    const allowed = payout.status === "requested"
      ? input.status === "approved" || input.status === "rejected"
      : payout.status === "approved"
        ? input.status === "paid" || input.status === "rejected"
        : false;
    if (statusChanged && !allowed) return { result: { ok: false, error: "invalid_transition" } };

    const reference = input.reference?.replace(/[\r\n\u0000]/g, " ").trim().slice(0, 200) || payout.reference;
    const paymentEvidence = input.paymentEvidence?.replace(/[\r\n\u0000]/g, " ").trim().slice(0, 1_000) || payout.paymentEvidence;
    if (input.status === "paid" && (!reference || !paymentEvidence)) {
      return { result: { ok: false, error: "transfer_evidence_required" } };
    }

    const alreadyConfirmed = hasRecordedManualTransferConfirmation(payout);
    const transferDetailsChanged = reference !== payout.reference || paymentEvidence !== payout.paymentEvidence;
    const manualConfirmationRecorded = input.status === "paid" && (!alreadyConfirmed || transferDetailsChanged);
    if (manualConfirmationRecorded && input.manualTransferConfirmed !== true) {
      return { result: { ok: false, error: "manual_transfer_confirmation_required" } };
    }

    const note = input.note ?? payout.note;
    const settlementMode = input.status === "paid" ? "manual" : payout.settlementMode;
    const manualTransferConfirmed = input.status === "paid" ? true : payout.manualTransferConfirmed;
    const auditAt = statusChanged || manualConfirmationRecorded ? new Date().toISOString() : undefined;
    const manualTransferConfirmedAt = manualConfirmationRecorded ? auditAt : payout.manualTransferConfirmedAt;
    const manualTransferConfirmedBy = manualConfirmationRecorded ? input.decidedBy : payout.manualTransferConfirmedBy;
    const metadataChanged = reference !== payout.reference
      || paymentEvidence !== payout.paymentEvidence
      || note !== payout.note
      || settlementMode !== payout.settlementMode
      || manualTransferConfirmed !== payout.manualTransferConfirmed
      || manualTransferConfirmedAt !== payout.manualTransferConfirmedAt
      || manualTransferConfirmedBy !== payout.manualTransferConfirmedBy;
    if (!statusChanged && !metadataChanged) {
      return { result: { ok: true, payout, statusChanged: false, manualConfirmationRecorded: false } };
    }

    const updated: Payout = {
      ...payout,
      status: input.status,
      decidedAt: auditAt ?? payout.decidedAt,
      decidedBy: auditAt ? input.decidedBy : payout.decidedBy,
      reference,
      note,
      paymentEvidence,
      settlementMode,
      manualTransferConfirmed,
      manualTransferConfirmedAt,
      manualTransferConfirmedBy,
      ...(input.status === "paid" && !payout.paidAt ? { paidAt: auditAt ?? new Date().toISOString() } : {}),
    };
    const next = items.slice();
    next[index] = updated;
    return { next, result: { ok: true, payout: updated, statusChanged, manualConfirmationRecorded } };
  });

  if (!decision.ok) return decision;

  /*
   * Keep the payout ledger entry idempotent. It is created/repaired only after
   * the manual off-app transfer, operator attestation, reference and evidence
   * are all present on the payout record.
   */
  if (hasRecordedManualTransferConfirmation(decision.payout)) {
    await mutateCollection<LedgerEntry, void>(KEYS.ledger, (items) => {
      if (items.some((entry) => entry.kind === "payout" && entry.payoutId === decision.payout.id)) {
        return { result: undefined };
      }
      return {
        next: [
          ...items,
          {
            id: newId("led"),
            artistId: decision.payout.artistId,
            userId: decision.payout.userId,
            kind: "payout",
            amount: { fa: -decision.payout.amount.fa, en: -decision.payout.amount.en },
            payoutId: decision.payout.id,
            note: {
              fa: `تأیید دستی انتقال بانکی خارج از برنامه${decision.payout.reference ? ` · ${decision.payout.reference}` : ""}`,
              en: `Operator-confirmed off-app bank transfer${decision.payout.reference ? ` · ${decision.payout.reference}` : ""}`,
            },
            createdAt: new Date().toISOString(),
          } satisfies LedgerEntry,
        ],
        result: undefined,
      };
    });
  }

  return decision;
}

export function payoutSummary(payouts: Payout[]) {
  const sum = (predicate: (payout: Payout) => boolean) =>
    payouts
      .filter(predicate)
      .reduce((acc, payout) => addPrice(acc, payout.amount), ZERO_PRICE);
  return {
    requested: sum((payout) => payout.status === "requested"),
    approved: sum((payout) => payout.status === "approved"),
    manualTransferConfirmed: sum(hasRecordedManualTransferConfirmation),
    needsReconciliation: sum((payout) => payout.status === "paid" && !hasRecordedManualTransferConfirmation(payout)),
    rejected: sum((payout) => payout.status === "rejected"),
    count: payouts.length,
  };
}

/** Platform-wide payout overview for the admin panel. */
export async function payoutOverview() {
  const payouts = await getPayouts();
  return {
    summary: payoutSummary(payouts),
    pending: payouts.filter((payout) => payout.status === "requested" || payout.status === "approved"),
    recent: payouts.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()).slice(0, 40),
  };
}

/** Advisory: what is still owed across every artist (for the admin dashboard). */
export async function outstandingBalances(artistIds: string[]) {
  const [ledger, payouts] = await Promise.all([readCollection<LedgerEntry>(KEYS.ledger), getPayouts()]);
  return artistIds
    .map((artistId) => {
      const balance = artistBalance({
        ledger: ledger.filter((entry) => entry.artistId === artistId),
        payouts: payouts.filter((payout) => payout.artistId === artistId),
      });
      return { artistId, available: clampPrice(subPrice(balance.total, addPrice(balance.paidOut, balance.pending))) };
    })
    .filter((row) => row.available.fa > 0 || row.available.en > 0);
}
