#!/usr/bin/env bash
set -euo pipefail

DATA=${DATA:-dist/.next/standalone/data}
BASE=${BASE:-http://localhost:3000}
ADMIN_EMAIL=${ADMIN_EMAIL:-}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-}
if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
  echo "Set ADMIN_EMAIL and ADMIN_PASSWORD for the smoke admin session." >&2
  exit 1
fi
export ADMIN_EMAIL ADMIN_PASSWORD
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT
step() { echo; echo "──── $1"; }

step "1. admin session (same-origin browser signal)"
LOGIN=$(python3 -c 'import json,os; print(json.dumps({"email":os.environ["ADMIN_EMAIL"],"password":os.environ["ADMIN_PASSWORD"]}))')
LOGIN_RESULT=$(curl -sS -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/login" \
  -H "Origin: $BASE" -H 'content-type: application/json' -d "$LOGIN")
python3 -c 'import json,sys; d=json.loads(sys.argv[1]); assert d.get("ok"), d; print("admin login ok")' "$LOGIN_RESULT"

step "2. select a public non-exclusive sellable license"
ASSETS=$(curl -sS "$BASE/api/marketplace/assets?limit=100")
readarray -t ITEM < <(python3 -c '
import json,sys
rows=json.loads(sys.argv[1]).get("assets", [])
asset=next((a for a in rows if a.get("purchasable") and any(not t.get("exclusive") for t in a.get("tiers", []))), None)
if not asset:
    raise SystemExit("No public sellable marketplace asset found")
tier=next(t for t in asset["tiers"] if not t.get("exclusive"))
print(asset["id"])
print(tier["id"])
' "$ASSETS")
AID=${ITEM[0]}
TIER=${ITEM[1]}
echo "asset=$AID tier=$TIER"

step "3. create a guest sandbox order and simulate a sandbox payment (no real charge)"
CHECKOUT=$(curl -sS -X POST "$BASE/api/marketplace/checkout" -H "Origin: $BASE" -H 'content-type: application/json' \
  -d "{\"items\":[{\"assetId\":\"$AID\",\"tierId\":\"$TIER\"}],\"provider\":\"zarinpal\",\"locale\":\"fa\",\"buyer\":{\"name\":\"Refund smoke test\",\"email\":\"manual-refund-smoke@example.invalid\"}}")
OID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["order"]["id"])' "$CHECKOUT")
REDIRECT=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["payment"]["redirectUrl"])' "$CHECKOUT")
AUTHORITY=$(python3 -c 'import sys,urllib.parse as u; print(u.parse_qs(u.urlparse(sys.argv[1]).query)["authority"][0])' "$REDIRECT")
echo "order=$OID"
PAYMENT=$(curl -sS -X POST "$BASE/api/marketplace/payments/sandbox" -H "Origin: $BASE" -H 'content-type: application/json' \
  -d "{\"authority\":\"$AUTHORITY\",\"outcome\":\"paid\",\"locale\":\"fa\"}")
python3 -c 'import json,sys; d=json.loads(sys.argv[1]); assert d.get("ok") and d.get("status")=="paid", d; print("sandbox order paid; no real money moved")' "$PAYMENT"

step "4. reject the internal status change without an explicit operator attestation"
REFERENCE="SMOKE-MANUAL-REFUND-$OID"
EVIDENCE="SMOKE-RECEIPT-$OID"
NEGATIVE=$(curl -sS -w $'\n%{http_code}' -c "$JAR" -b "$JAR" -X POST "$BASE/api/marketplace/admin/orders" \
  -H "Origin: $BASE" -H 'content-type: application/json' \
  -d "{\"action\":\"record_manual_refund\",\"orderId\":\"$OID\",\"refundReference\":\"$REFERENCE\",\"refundEvidence\":\"$EVIDENCE\"}")
NEGATIVE_CODE=${NEGATIVE##*$'\n'}
NEGATIVE_BODY=${NEGATIVE%$'\n'*}
if [[ "$NEGATIVE_CODE" != "422" ]]; then
  echo "Expected missing operator confirmation to return 422; got $NEGATIVE_CODE: $NEGATIVE_BODY" >&2
  exit 1
fi
python3 -c 'import json,sys; d=json.loads(sys.argv[1]); assert d.get("error")=="manual_refund_confirmation_required", d; print("missing confirmation rejected")' "$NEGATIVE_BODY"

step "5. record synthetic off-app reference, evidence, and operator confirmation"
echo "Synthetic smoke values only: this action changes internal status/licenses/ledger; it does not refund or transfer money."
RESULT=$(curl -sS -c "$JAR" -b "$JAR" -X POST "$BASE/api/marketplace/admin/orders" \
  -H "Origin: $BASE" -H 'content-type: application/json' \
  -d "{\"action\":\"record_manual_refund\",\"orderId\":\"$OID\",\"refundReference\":\"$REFERENCE\",\"refundEvidence\":\"$EVIDENCE\",\"manualRefundConfirmed\":true}")
python3 -c 'import json,sys; d=json.loads(sys.argv[1]); assert d.get("ok") and d.get("refundMode")=="manual" and d.get("manualRefundConfirmed") is True, d; print("manual refund confirmation recorded; app did not transfer funds")' "$RESULT"

step "6. verify buyer receipt status and revoked license"
RECEIPT=$(curl -sS "$BASE/api/marketplace/orders/$OID")
python3 -c '
import json,sys
d=json.loads(sys.argv[1]); order=d["order"]
assert order["status"] == "refunded", order
assert order.get("refundMode") == "manual", order
assert order.get("manualRefundConfirmed") is True, order
assert order.get("refundReference") == sys.argv[2], order
assert d["licenses"] and all(item["status"] == "revoked" for item in d["licenses"]), d["licenses"]
print("receipt: manual/off-app confirmation; reference present; license revoked")
' "$RECEIPT" "$REFERENCE"
ADMIN_DETAIL=$(curl -sS -b "$JAR" "$BASE/api/marketplace/admin/orders?id=$OID")
python3 -c '
import json,sys
d=json.loads(sys.argv[1]); order=d["order"]
assert order.get("refundMode") == "manual", order
assert order.get("manualRefundConfirmed") is True, order
assert order.get("refundReference") == sys.argv[2], order
assert order.get("refundEvidence") == sys.argv[3], order
assert order.get("refundedBy") and order.get("refundedAt"), order
print("admin audit: reference, receipt evidence, operator, and timestamp persisted")
' "$ADMIN_DETAIL" "$REFERENCE" "$EVIDENCE"
python3 - "$DATA/mk-ledger.json" "$OID" <<'PY'
import json,sys
rows=json.load(open(sys.argv[1]))
reversals=[row for row in rows if row.get("orderId")==sys.argv[2] and row.get("kind")=="reversal"]
assert reversals, f"no ledger reversal found for {sys.argv[2]}"
print(f"ledger: {len(reversals)} reversal entries recorded")
PY
