"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Tag, Trash2 } from "lucide-react";
import { SESSION_FETCH } from "@/lib/http";
import { hasProductFamilyReferences, type ProductFamilyReferenceCounts } from "@/lib/product-family-references";
import { orderedProductFamilies, type ProductFamily } from "@/lib/data/families";
import type { SiteContent } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  data: SiteContent;
  update: (patch: Partial<SiteContent>) => void;
}

interface FamilyDraft {
  fa: string;
  en: string;
  slug: string;
}

const EMPTY_DRAFT: FamilyDraft = { fa: "", en: "", slug: "" };
const EMPTY_REFERENCES: ProductFamilyReferenceCounts = {
  products: 0,
  artistSignups: 0,
  marketplaceAssets: 0,
  openUploads: 0,
};
const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function makeFamilyId(): string {
  const random = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `fam-${random}`;
}

function normaliseOrder(families: readonly ProductFamily[]): ProductFamily[] {
  return families.map((family, index) => ({ ...family, order: index + 1 }));
}

export function ProductFamiliesManager({ data, update }: Props) {
  const [draft, setDraft] = useState<FamilyDraft>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState("");
  const [notice, setNotice] = useState("");
  const [references, setReferences] = useState<Record<string, ProductFamilyReferenceCounts>>({});
  const [referenceState, setReferenceState] = useState<"loading" | "ready" | "error">("loading");

  const families = useMemo(
    () => orderedProductFamilies(Array.isArray(data.productFamilies) ? data.productFamilies : []),
    [data.productFamilies],
  );

  const refreshReferences = useCallback(async () => {
    setReferenceState("loading");
    try {
      const response = await fetch("/api/admin/product-families/references", SESSION_FETCH);
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        references?: Record<string, ProductFamilyReferenceCounts>;
      } | null;
      if (!response.ok || !payload?.ok || !payload.references) throw new Error("references_unavailable");
      setReferences(payload.references);
      setReferenceState("ready");
    } catch {
      setReferenceState("error");
    }
  }, []);

  useEffect(() => {
    void refreshReferences();
  }, [refreshReferences]);

  const publish = (next: readonly ProductFamily[]) => update({ productFamilies: normaliseOrder(next) });

  const updateFamily = (id: string, patch: Partial<ProductFamily>) => {
    publish(families.map((family) => family.id === id ? { ...family, ...patch } : family));
    setNotice("");
  };

  const moveFamily = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= families.length) return;
    const next = families.slice();
    [next[index], next[destination]] = [next[destination], next[index]];
    publish(next);
  };

  const usageFor = (familyId: string): ProductFamilyReferenceCounts => {
    const remote = references[familyId] ?? EMPTY_REFERENCES;
    return {
      products: data.products.filter((product) => product.familyId === familyId).length,
      artistSignups: data.artists.filter((artist) => artist.signupFamilies?.includes(familyId)).length,
      marketplaceAssets: remote.marketplaceAssets,
      openUploads: remote.openUploads,
    };
  };

  const addFamily = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = { fa: draft.fa.trim(), en: draft.en.trim() };
    const slug = draft.slug.trim().toLowerCase();
    if (!name.fa || !name.en) {
      setDraftError("نام فارسی و انگلیسی را وارد کنید.");
      return;
    }
    if (name.fa.length > 120 || name.en.length > 120) {
      setDraftError("نام هر زبان حداکثر ۱۲۰ نویسه است.");
      return;
    }
    if (!VALID_SLUG.test(slug) || slug.length > 80 || slug === "other") {
      setDraftError("اسلاگ باید انگلیسی، کوچک و بدون فاصله باشد؛ «other» برای محصولات بدون خانواده رزرو شده است.");
      return;
    }
    if (families.some((family) => family.slug === slug)) {
      setDraftError("این اسلاگ قبلاً استفاده شده است.");
      return;
    }
    const id = makeFamilyId();
    publish([...families, { id, slug, name, order: families.length + 1 }]);
    setDraft(EMPTY_DRAFT);
    setDraftError("");
    setNotice("خانواده به پیش‌نویس اضافه شد؛ برای ثبت نهایی «ذخیره» پنل را بزنید.");
  };

  const removeFamily = (family: ProductFamily) => {
    const usage = usageFor(family.id);
    if (hasProductFamilyReferences(usage)) {
      setNotice(`«${family.name.fa}» هنوز وابستگی دارد. ابتدا محصولات، علایق ثبت‌نام طراحان، آثار مارکت‌پلیس یا آپلودهای باز را به خانوادهٔ دیگری منتقل کنید.`);
      return;
    }
    if (!window.confirm(`خانوادهٔ «${family.name.fa} / ${family.name.en}» از پیش‌نویس حذف شود؟ تغییر پس از ذخیرهٔ پنل ثبت می‌شود.`)) return;
    publish(families.filter((item) => item.id !== family.id));
    setNotice("خانواده از پیش‌نویس حذف شد؛ برای ثبت نهایی «ذخیره» پنل را بزنید.");
  };

  return (
    <section className="space-y-5" aria-labelledby="product-families-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="product-families-title" className="flex items-center gap-2 text-lg font-bold text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent"><Tag className="h-4 w-4" /></span>
            خانواده‌های محصول
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            نام فارسی و انگلیسی، اسلاگ و ترتیب نمایش را مدیریت کنید. این فهرست منبع مشترک فروشگاه و آپلود مارکت‌پلیس است.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshReferences()}
          disabled={referenceState === "loading"}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-foreground-secondary hover:bg-background-secondary disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", referenceState === "loading" && "animate-spin")} />
          بررسی وابستگی‌ها
        </button>
      </div>

      {notice && <p role="status" className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-foreground">{notice}</p>}
      {referenceState === "error" && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          شمارش آثار و نشست‌های مارکت‌پلیس دریافت نشد؛ حذف در سرور دوباره بررسی می‌شود و در صورت وجود وابستگی رد خواهد شد.
        </p>
      )}

      <form onSubmit={addFamily} className="rounded-xl border border-border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold">افزودن خانواده</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_0.9fr_auto] md:items-end">
          <label className="block text-xs font-medium text-foreground-secondary">
            نام فارسی
            <input
              dir="rtl"
              value={draft.fa}
              onChange={(event) => setDraft((current) => ({ ...current, fa: event.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background-secondary px-3 text-sm text-foreground focus:border-accent focus:outline-none"
              maxLength={120}
              required
            />
          </label>
          <label className="block text-xs font-medium text-foreground-secondary">
            نام انگلیسی
            <input
              dir="ltr"
              value={draft.en}
              onChange={(event) => setDraft((current) => ({ ...current, en: event.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background-secondary px-3 text-sm text-foreground focus:border-accent focus:outline-none"
              maxLength={120}
              required
            />
          </label>
          <label className="block text-xs font-medium text-foreground-secondary">
            اسلاگ انگلیسی
            <input
              dir="ltr"
              value={draft.slug}
              onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background-secondary px-3 font-mono text-sm text-foreground focus:border-accent focus:outline-none"
              maxLength={80}
              placeholder="new-family"
              required
            />
          </label>
          <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:opacity-90">
            <Plus className="h-4 w-4" /> افزودن
          </button>
        </div>
        {draftError && <p role="alert" className="mt-3 text-xs text-error">{draftError}</p>}
      </form>

      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border bg-background-secondary px-4 py-3 text-xs font-semibold text-foreground-secondary sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(10rem,0.9fr)_auto]">
          <span>نام فارسی / انگلیسی</span>
          <span className="hidden sm:block">اسلاگ</span>
          <span className="hidden sm:block">وابستگی‌ها</span>
          <span className="text-left">ترتیب / حذف</span>
        </div>
        {families.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">هنوز خانواده‌ای تعریف نشده است.</p>
        ) : families.map((family, index) => {
          const usage = usageFor(family.id);
          const blocked = hasProductFamilyReferences(usage);
          const duplicateSlug = families.some((item) => item.id !== family.id && item.slug === family.slug);
          const validSlug = VALID_SLUG.test(family.slug) && family.slug !== "other" && !duplicateSlug;
          return (
            <article key={family.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(10rem,0.9fr)_auto] sm:items-center">
              <div className="grid gap-2">
                <label className="sr-only" htmlFor={`family-${family.id}-fa`}>نام فارسی</label>
                <input
                  id={`family-${family.id}-fa`}
                  dir="rtl"
                  value={family.name.fa}
                  onChange={(event) => updateFamily(family.id, { name: { ...family.name, fa: event.target.value } })}
                  maxLength={120}
                  className="h-9 w-full rounded-md border border-border bg-background-secondary px-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
                />
                <label className="sr-only" htmlFor={`family-${family.id}-en`}>نام انگلیسی</label>
                <input
                  id={`family-${family.id}-en`}
                  dir="ltr"
                  value={family.name.en}
                  onChange={(event) => updateFamily(family.id, { name: { ...family.name, en: event.target.value } })}
                  maxLength={120}
                  className="h-9 w-full rounded-md border border-border bg-background-secondary px-2.5 text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </div>
              <label className="block text-xs text-muted sm:sr-only" htmlFor={`family-${family.id}-slug`}>اسلاگ انگلیسی</label>
              <input
                id={`family-${family.id}-slug`}
                dir="ltr"
                value={family.slug}
                onChange={(event) => updateFamily(family.id, { slug: event.target.value.toLowerCase() })}
                maxLength={80}
                className={cn(
                  "h-9 w-full rounded-md border bg-background-secondary px-2.5 font-mono text-sm text-foreground focus:outline-none",
                  validSlug ? "border-border focus:border-accent" : "border-error/60 focus:border-error",
                )}
              />
              <div className="text-xs leading-6 text-foreground-secondary">
                <p>{usage.products.toLocaleString("fa-IR")} محصول · {usage.artistSignups.toLocaleString("fa-IR")} ثبت‌نام طراح</p>
                <p>{referenceState === "ready" ? usage.marketplaceAssets.toLocaleString("fa-IR") : "—"} اثر · {referenceState === "ready" ? usage.openUploads.toLocaleString("fa-IR") : "—"} آپلود باز</p>
              </div>
              <div className="flex items-center gap-1 sm:justify-end">
                <span className="me-1 min-w-7 text-center text-xs tabular-nums text-muted">{index + 1}</span>
                <button
                  type="button"
                  aria-label={`انتقال ${family.name.fa} به بالا`}
                  title="انتقال به بالا"
                  disabled={index === 0}
                  onClick={() => moveFamily(index, -1)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground-secondary hover:bg-background-secondary disabled:opacity-30"
                ><ArrowUp className="h-4 w-4" /></button>
                <button
                  type="button"
                  aria-label={`انتقال ${family.name.fa} به پایین`}
                  title="انتقال به پایین"
                  disabled={index === families.length - 1}
                  onClick={() => moveFamily(index, 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground-secondary hover:bg-background-secondary disabled:opacity-30"
                ><ArrowDown className="h-4 w-4" /></button>
                <button
                  type="button"
                  aria-label={`حذف ${family.name.fa}`}
                  title={blocked ? "ابتدا وابستگی‌ها را منتقل کنید" : "حذف خانواده"}
                  disabled={blocked}
                  onClick={() => removeFamily(family)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-error/20 text-error hover:bg-error/5 disabled:cursor-not-allowed disabled:opacity-30"
                ><Trash2 className="h-4 w-4" /></button>
              </div>
              {(!family.name.fa.trim() || !family.name.en.trim()) && (
                <p role="alert" className="text-xs text-error sm:col-span-4">نام هر دو زبان الزامی است.</p>
              )}
              {!validSlug && (
                <p role="alert" className="text-xs text-error sm:col-span-4">
                  {duplicateSlug ? "اسلاگ باید یکتا باشد." : family.slug === "other" ? "اسلاگ «other» برای محصولات بدون خانواده رزرو شده است." : "اسلاگ باید انگلیسی، با حروف کوچک و بدون فاصله باشد."}
                </p>
              )}
              {blocked && (
                <p className="text-[11px] text-amber-800 sm:col-span-4">
                  حذف غیرفعال است؛ ابتدا وابستگی‌ها را اصلاح کنید. سرور نیز این موارد را هنگام ذخیره دوباره کنترل می‌کند.
                </p>
              )}
            </article>
          );
        })}
      </div>
      <p className="text-xs text-muted">پس از هر ویرایش، تغییرات تا زدن دکمهٔ ذخیرهٔ اصلی پنل فقط پیش‌نویس هستند.</p>
    </section>
  );
}
