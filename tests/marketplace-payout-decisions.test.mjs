import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

function loadPayoutDecisions(initialPayouts = []) {
  const collections = new Map([
    ["payouts", initialPayouts],
    ["ledger", []],
  ]);
  let sequence = 0;
  const moduleExports = {};
  const baseRequire = createRequire(import.meta.url);
  const mocks = {
    "server-only": {},
    "./store": {
      KEYS: { payouts: "payouts", ledger: "ledger" },
      async mutateCollection(key, mutate) {
        const state = collections.get(key) ?? [];
        const result = await mutate(state);
        if (result.next) collections.set(key, result.next);
        return result.result;
      },
      async readCollection(key) {
        return collections.get(key) ?? [];
      },
    },
    "./assets": { newId: (prefix) => `${prefix}_${++sequence}`, getSettings: async () => ({}) },
    "./royalty": { artistBalance: () => ({}) },
    "./money": {
      addPrice: (a, b) => ({ fa: a.fa + b.fa, en: a.en + b.en }),
      clampPrice: (value) => value,
      subPrice: (a, b) => ({ fa: a.fa - b.fa, en: a.en - b.en }),
      ZERO_PRICE: { fa: 0, en: 0 },
    },
    "./orders": { getLicensesForArtist: async () => [] },
  };
  const mockRequire = (specifier) => mocks[specifier] ?? baseRequire(specifier);
  const source = fs.readFileSync("src/lib/marketplace/payouts.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("exports", "require", compiled)(moduleExports, mockRequire);
  return { decisions: moduleExports, collections };
}

function payout(status = "requested") {
  return {
    id: "payout-1",
    artistId: "artist-1",
    userId: "user-1",
    amount: { fa: 250000, en: 8 },
    method: "iban",
    destination: "IR000000000000000000000000",
    status,
    requestedAt: "2026-10-11T10:00:00.000Z",
  };
}

const manualConfirmation = {
  reference: "bank-transfer-123",
  paymentEvidence: "receipt-id-2026-0001",
  manualTransferConfirmed: true,
};

test("payout cannot be marked as manually transferred before approval", async () => {
  const { decisions, collections } = loadPayoutDecisions([payout("requested")]);
  const result = await decisions.decidePayout({
    id: "payout-1",
    status: "paid",
    decidedBy: "admin@example.test",
    ...manualConfirmation,
  });
  assert.deepEqual(result, { ok: false, error: "invalid_transition" });
  assert.deepEqual(collections.get("ledger"), []);
  assert.equal(collections.get("payouts")[0].status, "requested");
});

test("manual payout confirmation requires a transfer reference and evidence", async () => {
  const { decisions, collections } = loadPayoutDecisions([payout("approved")]);
  const result = await decisions.decidePayout({
    id: "payout-1",
    status: "paid",
    decidedBy: "admin@example.test",
    reference: "bank-transfer-123",
    manualTransferConfirmed: true,
  });
  assert.deepEqual(result, { ok: false, error: "transfer_evidence_required" });
  assert.equal(collections.get("payouts")[0].status, "approved");
  assert.deepEqual(collections.get("ledger"), []);
});

test("transfer evidence alone cannot substitute for explicit operator confirmation", async () => {
  const { decisions, collections } = loadPayoutDecisions([payout("approved")]);
  const result = await decisions.decidePayout({
    id: "payout-1",
    status: "paid",
    decidedBy: "admin@example.test",
    reference: "bank-transfer-123",
    paymentEvidence: "receipt-id-2026-0001",
  });
  assert.deepEqual(result, { ok: false, error: "manual_transfer_confirmation_required" });
  assert.equal(collections.get("payouts")[0].status, "approved");
  assert.deepEqual(collections.get("ledger"), []);
});

test("operator-confirmed off-app payout records evidence and writes one idempotent ledger debit", async () => {
  const { decisions, collections } = loadPayoutDecisions([payout("requested")]);
  const approved = await decisions.decidePayout({
    id: "payout-1",
    status: "approved",
    decidedBy: "admin@example.test",
    reference: "approval-ref",
    note: "checked",
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.payout.status, "approved");

  const paid = await decisions.decidePayout({
    id: "payout-1",
    status: "paid",
    decidedBy: "admin@example.test",
    ...manualConfirmation,
    note: "sent outside the app",
  });
  assert.equal(paid.ok, true);
  assert.equal(paid.payout.status, "paid");
  assert.equal(paid.payout.settlementMode, "manual");
  assert.equal(paid.payout.manualTransferConfirmed, true);
  assert.equal(paid.payout.manualTransferConfirmedBy, "admin@example.test");
  assert.ok(paid.payout.manualTransferConfirmedAt);
  assert.equal(paid.payout.reference, "bank-transfer-123");
  assert.equal(paid.payout.paymentEvidence, "receipt-id-2026-0001");
  assert.equal(paid.manualConfirmationRecorded, true);
  assert.equal(collections.get("ledger").length, 1);
  assert.deepEqual(collections.get("ledger")[0].amount, { fa: -250000, en: -8 });
  assert.match(collections.get("ledger")[0].note.en, /off-app bank transfer/);

  const repeated = await decisions.decidePayout({
    id: "payout-1",
    status: "paid",
    decidedBy: "admin@example.test",
    note: "reconciled",
  });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.statusChanged, false);
  assert.equal(repeated.manualConfirmationRecorded, false);
  assert.equal(collections.get("payouts")[0].note, "reconciled");
  assert.equal(collections.get("ledger").length, 1);
});

test("a retry repairs a missing ledger row only for a fully confirmed manual payout", async () => {
  const confirmed = {
    ...payout("paid"),
    settlementMode: "manual",
    manualTransferConfirmed: true,
    manualTransferConfirmedAt: "2026-10-12T12:00:00.000Z",
    manualTransferConfirmedBy: "admin@example.test",
    reference: "bank-transfer-123",
    paymentEvidence: "receipt-id-2026-0001",
  };
  const { decisions, collections } = loadPayoutDecisions([confirmed]);
  const retry = await decisions.decidePayout({ id: "payout-1", status: "paid", decidedBy: "admin@example.test" });
  assert.equal(retry.ok, true);
  assert.equal(retry.statusChanged, false);
  assert.equal(retry.manualConfirmationRecorded, false);
  assert.equal(collections.get("ledger").length, 1);
});

test("a legacy paid status cannot repair the ledger until an operator reconfirms it", async () => {
  const legacy = {
    ...payout("paid"),
    settlementMode: "manual",
    reference: "old-bank-reference",
    paymentEvidence: "old-receipt-id",
    decidedAt: "2026-10-12T12:00:00.000Z",
    decidedBy: "legacy-admin@example.test",
    paidAt: "2026-10-12T12:00:00.000Z",
  };
  const { decisions, collections } = loadPayoutDecisions([legacy]);

  const retryWithoutConfirmation = await decisions.decidePayout({
    id: "payout-1",
    status: "paid",
    decidedBy: "admin@example.test",
  });
  assert.deepEqual(retryWithoutConfirmation, { ok: false, error: "manual_transfer_confirmation_required" });
  assert.deepEqual(collections.get("ledger"), []);

  const reconfirmed = await decisions.decidePayout({
    id: "payout-1",
    status: "paid",
    decidedBy: "admin@example.test",
    manualTransferConfirmed: true,
  });
  assert.equal(reconfirmed.ok, true);
  assert.equal(reconfirmed.statusChanged, false);
  assert.equal(reconfirmed.manualConfirmationRecorded, true);
  assert.equal(reconfirmed.payout.manualTransferConfirmedBy, "admin@example.test");
  assert.equal(collections.get("ledger").length, 1);
});

test("payout summary separates confirmed manual transfers from records needing reconciliation", () => {
  const confirmed = {
    ...payout("paid"),
    settlementMode: "manual",
    manualTransferConfirmed: true,
    manualTransferConfirmedAt: "2026-10-12T12:00:00.000Z",
    manualTransferConfirmedBy: "admin@example.test",
    reference: "bank-transfer-123",
    paymentEvidence: "receipt-id-2026-0001",
  };
  const legacy = {
    ...payout("paid"),
    id: "payout-legacy",
    amount: { fa: 100000, en: 3 },
  };
  const { decisions } = loadPayoutDecisions([confirmed, legacy, payout("requested")]);

  const summary = decisions.payoutSummary([confirmed, legacy, payout("requested")]);
  assert.deepEqual(summary.manualTransferConfirmed, { fa: 250000, en: 8 });
  assert.deepEqual(summary.needsReconciliation, { fa: 100000, en: 3 });
  assert.deepEqual(summary.requested, { fa: 250000, en: 8 });
});
