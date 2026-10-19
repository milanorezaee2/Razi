import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { withNoStore } from "@/lib/http";
import { getContent } from "@/lib/data/store";
import { getAssets, getUploadSessions } from "@/lib/marketplace/assets";
import { getProductFamilyReferenceCounts } from "@/lib/product-family-references";

export const dynamic = "force-dynamic";

/** Admin-only dependency counts used to explain why a taxonomy entry cannot be deleted. */
export async function GET() {
  const user = await getAdminSession();
  if (user?.role !== "admin") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, withNoStore({ status: 401 }));
  }

  const [content, assets, uploads] = await Promise.all([
    getContent(),
    getAssets(),
    getUploadSessions(),
  ]);
  return NextResponse.json(
    { ok: true, references: getProductFamilyReferenceCounts(content, assets, uploads) },
    withNoStore(),
  );
}
