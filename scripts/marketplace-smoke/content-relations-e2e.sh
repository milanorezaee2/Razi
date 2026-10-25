#!/usr/bin/env bash
# Direct HTTP tests for admin/content relationship validation. No valid content
# is written; invalid full-document PUTs and artist deletion must fail with 422.
#
#   BASE=http://localhost:3000 bash scripts/marketplace-smoke/content-relations-e2e.sh
set -euo pipefail
BASE=${BASE:-http://localhost:3000}
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@rosie-atelier.local}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-rosie-dev-admin-2026}
JAR=/tmp/razi-content-relations-cookies.txt
HEADERS=/tmp/razi-content-relations-headers.txt
BODY=/tmp/razi-content-relations-body.json
RESPONSE=/tmp/razi-content-relations-response.txt
rm -f "$JAR" "$HEADERS" "$BODY" "$RESPONSE"

fail() { echo "✗ $1"; exit 1; }
ok() { echo "✓ $1"; }

LOGIN=$(curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -H "origin: $BASE" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
echo "$LOGIN" | grep -q '"role":"admin"' || fail "admin login failed"
ok "admin session established"

curl -s -D "$HEADERS" -c "$JAR" -b "$JAR" "$BASE/api/admin/content" > "$BODY"
ETAG=$(awk 'BEGIN { IGNORECASE=1 } /^etag:/ { gsub("\r", ""); gsub(/^etag:[[:space:]]*/, ""); gsub(/"/, ""); print; exit }' "$HEADERS")
[ -n "$ETAG" ] || fail "GET /api/admin/content did not return an ETag"

python3 - "$BODY" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding="utf8") as stream:
    data = json.load(stream)

def first(collection):
    rows = data.get(collection) or []
    if not rows:
        raise SystemExit(f"test fixture has no {collection} records")
    return rows[0]

first("patterns")["categoryId"] = "__missing_category__"
first("products")["patternId"] = "__missing_pattern__"
first("products")["familyId"] = "__missing_family__"
first("collections")["productIds"] = ["__missing_product__"]
first("portfolios")["categoryId"] = "__missing_portfolio_category__"
first("education")["authorId"] = "__missing_artist__"
with open(path, "w", encoding="utf8") as stream:
    json.dump(data, stream, ensure_ascii=False)
PY

STATUS=$(curl -s -o "$RESPONSE" -w '%{http_code}' -c "$JAR" -b "$JAR" \
  -X PUT "$BASE/api/admin/content" \
  -H 'content-type: application/json' -H "origin: $BASE" -H "If-Match: \"$ETAG\"" \
  --data-binary "@$BODY")
[ "$STATUS" = "422" ] || { cat "$RESPONSE"; fail "invalid relationships should return 422, got $STATUS"; }
ok "invalid full-document update rejected with HTTP 422"

python3 - "$RESPONSE" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf8") as stream:
    payload = json.load(stream)
assert payload.get("error") == "invalid_relationships", payload
paths = {issue.get("path") for issue in payload.get("issues", [])}
for path in (
    "patterns[0].categoryId",
    "products[0].patternId",
    "products[0].familyId",
    "collections[0].productIds[0]",
    "portfolios[0].categoryId",
    "education[0].authorId",
):
    assert path in paths, f"missing field error for {path}: {paths}"
print("✓ response names the invalid category, pattern, product, portfolio and academy fields")
PY

# Removing a referenced artist through the dedicated admin route must use the
# same relationship guard as the full-document writer and leave content intact.
curl -s -D "$HEADERS" -c "$JAR" -b "$JAR" "$BASE/api/admin/content" > "$BODY"
ARTIST_ID=$(python3 - "$BODY" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf8") as stream:
    data = json.load(stream)
referenced = set()
for collection, field in (
    ("patterns", "artistId"),
    ("products", "artistId"),
    ("portfolios", "artistId"),
    ("education", "authorId"),
    ("stories", "artistId"),
):
    referenced.update(item.get(field) for item in data.get(collection, []) if item.get(field))
for item in data.get("education", []):
    event = item.get("liveEvent") or {}
    for field in ("instructorId", "hostId"):
        if event.get(field):
            referenced.add(event[field])
artist = next((item for item in data.get("artists", []) if item.get("id") in referenced), None)
if not artist:
    raise SystemExit("test fixture has no artist referenced by content")
print(artist["id"])
PY
) || fail "could not find an artist referenced by content"

STATUS=$(curl -s -o "$RESPONSE" -w '%{http_code}' -c "$JAR" -b "$JAR" \
  --get "$BASE/api/admin/artists" --data-urlencode "id=$ARTIST_ID" \
  -X DELETE -H "origin: $BASE")
[ "$STATUS" = "422" ] || { cat "$RESPONSE"; fail "referenced artist delete should return 422, got $STATUS"; }
python3 - "$RESPONSE" "$ARTIST_ID" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf8") as stream:
    payload = json.load(stream)
assert payload.get("error") == "invalid_relationships", payload
assert any(issue.get("id") == sys.argv[2] for issue in payload.get("issues", [])), payload
print("✓ referenced artist delete returns HTTP 422 with the offending relation ID")
PY

curl -s -c "$JAR" -b "$JAR" "$BASE/api/admin/content" > "$BODY"
python3 - "$BODY" "$ARTIST_ID" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf8") as stream:
    content = json.load(stream)
assert any(artist.get("id") == sys.argv[2] for artist in content.get("artists", [])), "rejected delete mutated the artist list"
print("✓ rejected artist delete leaves the content document unchanged")
PY

rm -f "$JAR" "$HEADERS" "$BODY" "$RESPONSE"
echo "✅ content relationship validation verified through the admin API"
