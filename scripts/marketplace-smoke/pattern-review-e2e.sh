#!/usr/bin/env bash
# End-to-end check of the pattern review workflow, over the HTTP API only —
# the same calls the browser makes.
#
#   bash scripts/marketplace-smoke/pattern-review-e2e.sh
#
# Needs a running server (npm run dev, or the standalone build) and an admin
# account. The artist account is seeded by this script.
set -euo pipefail

DIR=$(cd "$(dirname "$0")" && pwd)
BASE=${BASE:-http://localhost:3000}
DATA=${DATA:-data}
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@rosie-atelier.local}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-rosie-dev-admin-2026}
ARTIST_EMAIL=${ARTIST_EMAIL:-pattern-review-${BASHPID}@example.com}
ARTIST_PASSWORD=${ARTIST_PASSWORD:-artist-dev-pass}

AJ=/tmp/pr-admin-cookies.txt
RJ=/tmp/pr-artist-cookies.txt
PAT_ID=""
ARTIST_SEEDED=0
TEST_DATA_DIR=$(node -e "console.log(require('node:path').resolve(process.env.TEST_DATA_DIR || process.env.DATA || 'data'))")
rm -f "$AJ" "$RJ"

cleanup() {
  set +e
  if [ -n "$PAT_ID" ] && [ -s "$RJ" ]; then
    curl -s -c "$RJ" -b "$RJ" -X DELETE "$BASE/api/artist/patterns?id=$PAT_ID&type=pattern" -H "origin: $BASE" > /dev/null
  fi
  if [ "$ARTIST_SEEDED" = "1" ]; then
    TEST_DATA_DIR="$TEST_DATA_DIR" TEST_ARTIST_EMAIL="$ARTIST_EMAIL" node --input-type=module - <<'NODE'
import fs from "node:fs";
import path from "node:path";
const file = path.join(process.env.TEST_DATA_DIR, "users.json");
if (fs.existsSync(file)) {
  try {
    const users = JSON.parse(fs.readFileSync(file, "utf8"));
    const next = users.filter((user) => user.email !== process.env.TEST_ARTIST_EMAIL);
    if (next.length !== users.length) fs.writeFileSync(file, JSON.stringify(next, null, 2));
  } catch { /* preserve a malformed data file rather than deleting it */ }
}
NODE
  fi
  rm -f "$AJ" "$RJ"
}
trap cleanup EXIT

step() { echo; echo "──── $1"; }
fail() { echo "✗ $1"; exit 1; }
ok() { echo "✓ $1"; }

# The CSRF gate accepts a browser-vouched same-origin request, so sending the
# Origin header is enough to look like the real dashboard.
post() { # post <jar> <path> <json>
  curl -s -c "$1" -b "$1" -X POST "$BASE$2" \
    -H 'content-type: application/json' -H "origin: $BASE" -d "$3"
}
patch() { # patch <jar> <path> <json>
  curl -s -c "$1" -b "$1" -X PATCH "$BASE$2" \
    -H 'content-type: application/json' -H "origin: $BASE" -d "$3"
}
put() { # put <jar> <path> <json>
  curl -s -c "$1" -b "$1" -X PUT "$BASE$2" \
    -H 'content-type: application/json' -H "origin: $BASE" -d "$3"
}
# jq_get <python expression over the parsed body, `d`>
jq_get() { python3 -c 'import sys,json; d=json.load(sys.stdin); v=eval(sys.argv[1], {"d": d}); print("" if v is None else v)' "$1"; }

step "0. seed an approved artist account"
DATA=$DATA node "$DIR/seed-artist-user.mjs" "$ARTIST_EMAIL" "$ARTIST_PASSWORD"
ARTIST_SEEDED=1

step "1. the artist signs in"
R=$(post $RJ /api/auth/login "{\"email\":\"$ARTIST_EMAIL\",\"password\":\"$ARTIST_PASSWORD\"}")
echo "$R" | head -c 200
echo "$R" | grep -q '"role":"artist"' || fail "artist login failed"

step "2. invalid related IDs fail at the API boundary"
INVALID_CREATE_STATUS=$(curl -s -o /tmp/pr-invalid-create.json -w '%{http_code}' -c "$RJ" -b "$RJ" -X POST "$BASE/api/artist/patterns" -H 'content-type: application/json' -H "origin: $BASE" -d '{"title":{"fa":"رابطه نامعتبر","en":"Invalid relation"},"categoryId":"__missing_category__","spaceIds":["__missing_space__"]}')
INVALID_CREATE_BODY=$(cat /tmp/pr-invalid-create.json)
[ "$INVALID_CREATE_STATUS" = "422" ] || fail "invalid pattern creation must return 422, got $INVALID_CREATE_STATUS: $INVALID_CREATE_BODY"
echo "$INVALID_CREATE_BODY" | grep -q 'categoryId' || fail "422 did not name the invalid category field"
ok "pattern create rejects missing category/space references with field paths"

step "2b. direct deletion cannot orphan products and collections"
DELETE_STATUS=$(curl -s -o /tmp/pr-invalid-delete.json -w '%{http_code}' -c "$RJ" -b "$RJ" -X DELETE "$BASE/api/artist/patterns?id=pattern-quiet-garden&type=pattern" -H "origin: $BASE")
DELETE_BODY=$(cat /tmp/pr-invalid-delete.json)
[ "$DELETE_STATUS" = "422" ] || fail "referenced pattern deletion must return 422, got $DELETE_STATUS: $DELETE_BODY"
echo "$DELETE_BODY" | grep -q 'patternId' || fail "delete response did not show the product dependency"
ok "referenced pattern deletion is blocked with a field path"

step "2c. the artist creates a pattern"
CREATE=$(post "$RJ" /api/artist/patterns "{\"title\":{\"fa\":\"پترن آزمایشی\",\"en\":\"Review Test Pattern\"},\"slug\":\"pattern-review-e2e-${BASHPID}\",\"categoryId\":\"cat-botanical\",\"price\":{\"fa\":100000,\"en\":5}}")
echo "$CREATE" | head -c 300
PAT_ID=$(echo "$CREATE" | jq_get "d['pattern']['id']")
PAT_SLUG=$(echo "$CREATE" | jq_get "d['pattern']['slug']")
PAT_SKU=$(echo "$CREATE" | jq_get "d['pattern']['sku']")
PAT_URL=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$PAT_SLUG")
[ -n "$PAT_ID" ] || fail "no pattern id returned"
ok "pattern id=$PAT_ID slug=$PAT_SLUG sku=$PAT_SKU"

step "3. a new submission waits for review, it is not published"
STATUS=$(echo "$CREATE" | jq_get "d['pattern']['status']")
[ "$STATUS" = "pending_review" ] || fail "expected status pending_review, got '$STATUS'"
ok "status=$STATUS"

step "4. the pending pattern is invisible to the public"
# Next streams notFound() as a fallback marker and can return the initial
# shell with HTTP 200; assert the actual route payload and rendered content.
DETAIL=$(curl -s "$BASE/fa/patterns/$PAT_URL")
echo "$DETAIL" | grep -q "$PAT_SKU" && fail "the pending pattern is rendered on its public page"
echo "$DETAIL" | grep -q 'NEXT_HTTP_ERROR_FALLBACK;404' && ok "detail route renders the 404 fallback" || fail "detail route did not render the 404 fallback"
LIST=$(curl -s "$BASE/fa/patterns")
echo "$LIST" | grep -q "$PAT_SKU" && fail "the pending pattern appears in the public list"
ok "not in the public list"
echo "$LIST" | grep -q "quiet-garden" && ok "the published catalogue is still served" || fail "the published catalogue disappeared"
SEARCH=$(curl -s "$BASE/fa/search?q=$PAT_SKU")
echo "$SEARCH" | grep -q "$PAT_SLUG" && fail "the pending pattern shows up in search results" || ok "not in search results"
SITEMAP=$(curl -s "$BASE/sitemap.xml")
echo "$SITEMAP" | grep -q "$PAT_SLUG" && fail "the pending pattern appears in the sitemap" || ok "not in sitemap"

step "5. the artist cannot publish or reassign their own pattern"
FORCED=$(put $RJ /api/artist/patterns "{\"id\":\"$PAT_ID\",\"status\":\"published\",\"artistId\":null}")
echo "$FORCED" | head -c 200
FORCED_STATUS=$(echo "$FORCED" | jq_get "d['pattern']['status']")
FORCED_OWNER=$(echo "$FORCED" | jq_get "d['pattern']['artistId']")
[ "$FORCED_STATUS" = "pending_review" ] || fail "the artist bypassed the review, status=$FORCED_STATUS"
[ "$FORCED_OWNER" = "artist-niloufar-rad" ] || fail "the artist reassigned ownership to '$FORCED_OWNER'"
ok "status=$FORCED_STATUS and owner unchanged"

step "6. the artist cannot inject a rejection note"
FORCED2=$(put $RJ /api/artist/patterns "{\"id\":\"$PAT_ID\",\"rejectionNote\":\"hacked\"}")
FORCED2_NOTE=$(echo "$FORCED2" | jq_get "d['pattern'].get('rejectionNote')")
[ -z "$FORCED2_NOTE" ] || fail "artist injected a rejection note: $FORCED2_NOTE"
ok "no rejection note accepted from artist"

step "7. the admin signs in"
R=$(post $AJ /api/auth/login "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
echo "$R" | head -c 200
echo "$R" | grep -q '"role":"admin"' || fail "admin login failed"

step "8. the admin review queue lists the submission"
QUEUE=$(curl -s -c $AJ -b $AJ "$BASE/api/admin/patterns")
echo "$QUEUE" | jq_get "d['pendingCount']"
echo "$QUEUE" | grep -q "$PAT_ID" || fail "the pending pattern is missing from the review queue"
ok "pending pattern is queued"

step "9. the admin rejects it with a note"
REJ=$(patch $AJ /api/admin/patterns "{\"id\":\"$PAT_ID\",\"status\":\"rejected\",\"rejectionNote\":\"کیفیت تصویر کافی نیست.\"}")
echo "$REJ" | head -c 240
REJ_STATUS=$(echo "$REJ" | jq_get "d['pattern']['status']")
[ "$REJ_STATUS" = "rejected" ] || fail "expected rejected, got $REJ_STATUS"
REJ_NOTE=$(echo "$REJ" | jq_get "d['pattern']['rejectionNote']")
[ -n "$REJ_NOTE" ] || fail "the rejection note was not stored"
ok "rejected with note"

step "10. revising a rejected pattern resubmits it for review"
RESUB=$(put $RJ /api/artist/patterns "{\"id\":\"$PAT_ID\",\"description\":{\"fa\":\"نسخهٔ اصلاح‌شده\",\"en\":\"Revised\"}}")
RESUB_STATUS=$(echo "$RESUB" | jq_get "d['pattern']['status']")
[ "$RESUB_STATUS" = "pending_review" ] || fail "expected a resubmission, got $RESUB_STATUS"
RESUB_NOTE=$(echo "$RESUB" | jq_get "d['pattern'].get('rejectionNote')")
[ -z "$RESUB_NOTE" ] || fail "the old rejection note survived a resubmission"
ok "resubmitted as $RESUB_STATUS"

step "11. the admin publishes it"
PUB=$(patch $AJ /api/admin/patterns "{\"id\":\"$PAT_ID\",\"status\":\"published\"}")
PUB_STATUS=$(echo "$PUB" | jq_get "d['pattern']['status']")
[ "$PUB_STATUS" = "published" ] || fail "expected published, got $PUB_STATUS"
ok "published"

step "12. now the pattern is public"
DETAIL=$(curl -s "$BASE/fa/patterns/$PAT_URL")
echo "$DETAIL" | grep -q "$PAT_SKU" || fail "the published pattern is not rendered on its public page"
ok "detail page renders the pattern"
LIST=$(curl -s "$BASE/fa/patterns")
echo "$LIST" | grep -q "$PAT_SKU" || fail "the published pattern is missing from the list"
ok "present in the public list"
SITEMAP=$(curl -s "$BASE/sitemap.xml")
echo "$SITEMAP" | grep -q "$PAT_SLUG" && ok "present in the sitemap" || fail "missing from the sitemap"
SEARCH=$(curl -s "$BASE/fa/search?q=$PAT_SKU")
echo "$SEARCH" | grep -q "$PAT_SKU" && ok "present in search" || fail "missing from search"

step "13. an invalid review decision is rejected"
BAD=$(patch $AJ /api/admin/patterns "{\"id\":\"$PAT_ID\",\"status\":\"nonsense\"}")
echo "$BAD" | head -c 160
echo "$BAD" | grep -q '"ok":false' || fail "an invalid status was accepted"

step "14. clean up"
curl -s -c $AJ -b $AJ -X DELETE "$BASE/api/artist/patterns?id=$PAT_ID&type=pattern" \
  -H "origin: $BASE" > /dev/null
echo "pattern removed"

echo
echo "✅ pattern review workflow verified end to end"
