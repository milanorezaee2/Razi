import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("manual refund is an operator-confirmed off-app record, not a gateway operation", () => {
  const ui = read("src/components/marketplace/AdminConsole.tsx");
  const route = read("src/app/api/marketplace/admin/orders/route.ts");
  const orders = read("src/lib/marketplace/orders.ts");
  const types = read("src/lib/marketplace/types.ts");
  const returnsPage = read("src/app/[locale]/returns/page.tsx");
  const assetDetail = read("src/components/marketplace/AssetDetail.tsx");
  const receiptRoute = read("src/app/api/marketplace/orders/[id]/route.ts");
  const receiptView = read("src/components/marketplace/ReceiptView.tsx");
  const certificate = read("src/lib/marketplace/pdf/certificate.ts");

  assert.match(ui, /This panel does not transfer or return funds[\s\S]*?window\.confirm\(message\)/);
  assert.match(ui, /manualRefundConfirmed: true/);
  assert.match(ui, /refundReference[\s\S]*?refundEvidence/);
  assert.match(ui, /Confirm and record manual refund/);
  assert.match(ui, /Manual off-app refund confirmed/);
  assert.match(ui, /refundMode === "manual"[\s\S]*?refundEvidence[\s\S]*?refundedBy/);
  assert.match(ui, /revoked licenses/);

  assert.match(route, /case "record_manual_refund"/);
  assert.match(route, /manual_refund_evidence_required/);
  assert.match(route, /body\.manualRefundConfirmed !== true/);
  assert.match(route, /adminOps\.recordManualRefund\(body\.orderId, auth\.user\.email, \{/);
  assert.match(route, /use_record_manual_refund_action/);
  assert.doesNotMatch(route, /case "refund"/);

  assert.match(orders, /export async function recordManualRefund/);
  assert.match(orders, /manualRefundConfirmed: true/);
  assert.match(orders, /refundMode: "manual"/);
  assert.match(orders, /refundReference: reference/);
  assert.match(types, /refundMode\?: "manual"/);
  assert.doesNotMatch(types, /refundMode\?: "manual" \| "automatic"/);

  assert.match(returnsPage, /processed manually outside this website[\s\S]*?does not transfer refund funds automatically/);
  assert.match(assetDetail, /handled manually outside this app[\s\S]*?does not transfer funds/);
  assert.match(receiptRoute, /refundMode: order\.refundMode[\s\S]*?manualRefundConfirmed: order\.manualRefundConfirmed/);
  assert.match(receiptView, /Off-app manual refund confirmation recorded/);
  assert.match(receiptView, /status === "revoked"[\s\S]*?Unavailable: license revoked/);
  assert.match(receiptView, /Original payment provider/);
  assert.match(certificate, /processed manually outside the app[\s\S]*?does not transfer funds/);
});

test("manual payout confirmation is explicit, evidence-backed, and never presented as automatic", () => {
  const ui = read("src/components/marketplace/AdminConsole.tsx");
  const artistStudio = read("src/components/marketplace/ArtistStudio.tsx");
  const route = read("src/app/api/marketplace/admin/payouts/route.ts");
  const decisions = read("src/lib/marketplace/payouts.ts");
  const types = read("src/lib/marketplace/types.ts");
  const email = read("src/lib/marketplace/email.ts");

  assert.match(ui, /reference:\s*reference/);
  assert.match(ui, /note:\s*payoutNote\[payoutId\]/);
  assert.match(ui, /paymentEvidence:\s*action === "confirm_manual_transfer" \? evidence/);
  assert.match(ui, /manualTransferConfirmed:\s*action === "confirm_manual_transfer" \? true/);
  assert.match(ui, /value=\{payoutReference\[payout\.id\]/);
  assert.match(ui, /value=\{payoutNote\[payout\.id\]/);
  assert.match(ui, /value=\{payoutEvidence\[payout\.id\]/);
  assert.match(ui, /payout\.status === "approved"[\s\S]*?payoutAction\("confirm_manual_transfer"/);
  assert.match(ui, /No automatic bank-transfer provider is connected/);
  assert.match(ui, /Manual off-app bank transfer confirmed/);
  assert.match(ui, /Manual confirmation reconciliation required/);

  assert.match(route, /action\?: "approve" \| "reject" \| "confirm_manual_transfer"/);
  assert.match(route, /includes\(body\.action\)/);
  assert.match(route, /body\.manualTransferConfirmed !== true/);
  assert.match(route, /reference:\s*body\.reference/);
  assert.match(route, /paymentEvidence:\s*body\.paymentEvidence/);
  assert.match(route, /manualTransferConfirmed:\s*body\.manualTransferConfirmed/);

  assert.match(decisions, /payout\.status === "requested"[\s\S]*?input\.status === "approved"/);
  assert.match(decisions, /transfer_evidence_required/);
  assert.match(decisions, /manual_transfer_confirmation_required/);
  assert.match(decisions, /input\.manualTransferConfirmed !== true/);
  assert.match(decisions, /const settlementMode = input\.status === "paid" \? "manual"/);
  assert.match(decisions, /if \(hasRecordedManualTransferConfirmation\(decision\.payout\)\)/);
  assert.match(decisions, /entry\.kind === "payout" && entry\.payoutId === decision\.payout\.id/);
  assert.doesNotMatch(decisions, /settlementMode.*automatic/);

  assert.match(types, /manualTransferConfirmed\?: boolean/);
  assert.match(types, /settlementMode\?: "manual"/);
  assert.doesNotMatch(types, /settlementMode\?: "manual" \| "automatic"/);
  assert.match(artistStudio, /walletPayoutStatusLabel\(payout, fa\)/);
  assert.match(artistStudio, /Manual off-app bank transfer confirmed/);
  assert.match(email, /This app does not transfer funds/);
  assert.doesNotMatch(email, /automatic transfer completed/);
});

test("moderation queue can edit tier prices safely before approval", () => {
  const ui = read("src/components/marketplace/AdminConsole.tsx");
  const route = read("src/app/api/marketplace/admin/review/route.ts");
  const pricing = read("src/lib/marketplace/tier-pricing.ts");

  assert.match(ui, /Moderate license tier pricing/);
  assert.match(ui, /type="number"[\s\S]*?aria-label=.*Toman price/);
  assert.match(ui, /Save pricing/);
  assert.match(ui, /review\("save_tiers", item\.asset\.id\)/);
  assert.match(ui, /review\("approve", item\.asset\.id\)/);
  assert.match(route, /case "save_tiers"/);
  assert.match(route, /applyTierPricingPatches\(current\.tiers, body\.tiers\)/);
  assert.match(route, /updateAssetTiers\(body\.assetId, result\.tiers\)/);
  assert.match(route, /fail\(result\.error, 422\)/);
  assert.match(pricing, /Only these seller-facing fields may be adjusted/);
  assert.match(pricing, /allowedKeys = new Set\(\["id", "priceFa", "priceEn", "enabled"\]\)/);
  assert.match(pricing, /price: \{/);
});

test("marketplace admin exposes asset lifecycle controls and blocks destructive purge when referenced", () => {
  const ui = read("src/components/marketplace/AdminConsole.tsx");
  const route = read("src/app/api/marketplace/admin/review/route.ts");
  const admin = read("src/lib/marketplace/admin.ts");
  const assets = read("src/lib/marketplace/assets.ts");
  const orders = read("src/lib/marketplace/orders.ts");

  assert.match(ui, /id: "assets"/);
  assert.match(ui, /assetAction\("delist"/);
  assert.match(ui, /assetAction\("relist"/);
  assert.match(ui, /assetAction\("purge"/);
  assert.match(route, /view"\) === "assets"[\s\S]*?getManagedAssets\(\)/);
  assert.match(admin, /orders\.filter\(\(order\) => order\.lines\.some\(\(line\) => line\.assetId === assetId\)\)/);
  assert.match(admin, /licenses\.filter\(\(license\) => license\.assetId === assetId\)/);
  assert.match(admin, /session\.status === "open" && session\.attachToAssetId === assetId/);
  assert.match(orders, /asset\.visibility !== "public"[\s\S]*?not_for_sale/);
  assert.match(route, /fail\("asset_referenced", 409, \{ references: result\.references \}\)/);
  assert.match(route, /fail\("purge_cleanup_failed", 502\)/);
  assert.match(assets, /\.\.\.\(asset\.colourways \?\? \[\]\)\.flatMap/);
  assert.match(assets, /colourway\.files\.map\(\(file\) => file\.key\)/);
  assert.match(assets, /Do not remove the catalog record if storage cleanup fails/);
  assert.match(read("src/lib/marketplace/storage.ts"), /s3_delete_\$\{response\.status\}/);
});

test("site reset confirmation describes the content-only scope", () => {
  const app = read("src/components/admin/AdminApp.tsx");
  const route = read("src/app/api/admin/content/route.ts");
  const store = read("src/lib/data/store.ts");
  assert.match(app, /فقط سند محتوای سایت/);
  assert.match(app, /حساب‌های کاربری، سفارش‌ها، گفتگوها، رزروها/);
  assert.match(route, /resetContent\(match\)/);
  assert.match(store, /export async function resetContent/);
  assert.match(store, /await file\.remove\(\)/);
});
