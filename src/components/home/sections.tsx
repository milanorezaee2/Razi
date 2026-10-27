"use client";

import Image from "@/components/ui/SiteImage";
import Link from "next/link";
import { ArrowUpRight, Building2, PenTool, Quote } from "lucide-react";
import { useLocale } from "@/components/providers/AppProviders";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { BentoGrid, bentoSpan } from "@/components/ui/BentoGrid";
import { Carousel } from "@/components/ui/Carousel";
import { EmptyState } from "@/components/ui/States";
import { PatternCard, type PatternCardData } from "@/components/cards/PatternCard";
import { ProductCard, type ProductCardData } from "@/components/cards/ProductCard";
import { ArtistCard, type ArtistCardData } from "@/components/cards/ArtistCard";
import { PortfolioCard, type PortfolioCardData } from "@/components/cards/PortfolioCard";
import { EducationCard, type EducationCardData } from "@/components/cards/EducationCard";
import { StyleCard } from "@/components/cards/StyleCard";
import { NewsletterForm } from "@/components/layout/NewsletterForm";
import { cn, faNum, href, t } from "@/lib/utils";
import type { Artist, Category, Space, Story } from "@/lib/types";

/* ------------------------------------------------------------------ */
/** Decorative SVG icon per product type — used in CategoriesSection */
const CategoryIcons: Record<string, React.ReactNode> = {
  wallpaper: (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <rect x="4" y="4" width="18" height="18" rx="2" />
      <rect x="26" y="4" width="18" height="18" rx="2" />
      <rect x="4" y="26" width="18" height="18" rx="2" />
      <rect x="26" y="26" width="18" height="18" rx="2" />
    </svg>
  ),
  fabric: (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path d="M8 8 Q24 18 40 8" /><path d="M8 18 Q24 28 40 18" />
      <path d="M8 28 Q24 38 40 28" /><path d="M8 38 Q24 48 40 38" />
    </svg>
  ),
  curtain: (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <line x1="4" y1="6" x2="44" y2="6" /><line x1="10" y1="6" x2="10" y2="42" />
      <line x1="38" y1="6" x2="38" y2="42" />
      <path d="M10 42 Q24 36 38 42" />
    </svg>
  ),
  decor: (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <circle cx="24" cy="24" r="10" /><circle cx="24" cy="24" r="18" strokeDasharray="3 4" />
      <line x1="24" y1="6" x2="24" y2="14" /><line x1="24" y1="34" x2="24" y2="42" />
      <line x1="6" y1="24" x2="14" y2="24" /><line x1="34" y1="24" x2="42" y2="24" />
    </svg>
  ),
  pattern: (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path d="M12 12 L36 36 M36 12 L12 36" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <circle cx="36" cy="12" r="3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="36" r="3" fill="currentColor" stroke="none" />
      <circle cx="36" cy="36" r="3" fill="currentColor" stroke="none" />
      <circle cx="24" cy="24" r="4" />
    </svg>
  ),
  default: (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path d="M24 4 L44 14 L44 34 L24 44 L4 34 L4 14 Z" />
      <path d="M24 4 L24 44 M4 14 L44 14 M4 34 L44 34" />
    </svg>
  ),
};

function getCategoryIcon(slug: string): React.ReactNode {
  const key = slug.toLowerCase();
  for (const [k, icon] of Object.entries(CategoryIcons)) {
    if (key.includes(k)) return icon;
  }
  return CategoryIcons.default;
}

/* ------------------------------------------------------------------ */
export function DiscoverySection({ patterns, categories }: { patterns: PatternCardData[]; categories: Category[] }) {
  const { locale, dict } = useLocale();
  if (!patterns.length) return null;
  const [lead, ...rest] = patterns;
  return (
    <section id="discover" className="container-x section-y">
      <SectionHeader eyebrow={dict.home.discoveryEyebrow} title={dict.home.discoveryTitle} description={dict.home.discoveryDesc} href={href(locale, "/patterns")} hrefLabel={dict.nav.viewAll} size="lg" />
      {/* Phones: one swipe rail for the whole discovery set. */}
      <Reveal className="mt-8 md:hidden">
        <Carousel>
          {patterns.slice(0, 5).map((p) => (
            <PatternCard key={p.id} pattern={p} />
          ))}
        </Carousel>
      </Reveal>
      <div className="mt-10 hidden gap-5 md:grid lg:grid-cols-12 lg:gap-6">
        <Reveal className="lg:col-span-6">
          <PatternCard pattern={lead} variant="large" priority />
        </Reveal>
        <div className="grid grid-cols-2 gap-5 lg:col-span-6 lg:gap-6">
          {rest.slice(0, 4).map((p, i) => (
            <Reveal key={p.id} delay={i * 60}>
              <PatternCard pattern={p} variant="compact" />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/**
 * CategoriesSection — full centered grid of category cards.
 * Each card shows the category image as background, a decorative SVG icon,
 * and the category name. Used on the home page between Discovery and trending.
 */
export function CategoriesSection({ categories }: { categories: Category[] }) {
  const { locale, dict } = useLocale();
  const fa = locale === "fa";
  const cats = categories.slice(0, 6);
  if (!cats.length) return null;

  return (
    <section className="bg-background-secondary">
      <div className="container-x section-y">
        {/* A compact, swipeable category discovery rail for phones. */}
        <Reveal className="mobile-category-heading md:hidden">
          <div className="min-w-0">
            <p className="text-label text-accent">{dict.nav.categories}</p>
            <h2 className="mt-2 font-display text-h3 text-balance text-foreground">
              {fa ? "از کجا شروع کنیم؟" : "Find your next favorite"}
            </h2>
          </div>
          <Link href={href(locale, "/styles")} className="mobile-category-heading__all">
            {dict.nav.viewAll}
            <ArrowUpRight className="h-3.5 w-3.5 rtl-flip" />
          </Link>
        </Reveal>

        <Reveal className="mt-5 md:hidden">
          <div className="mobile-category-list no-scrollbar">
            {cats.map((category, index) => (
              <Link
                key={category.id}
                href={href(locale, `/patterns?category=${category.slug}`)}
                className="mobile-category-card group"
                aria-label={t(category.name, locale)}
              >
                <span className="mobile-category-card__image">
                  <Image
                    src={category.image}
                    alt=""
                    fill
                    sizes="112px"
                    priority={index < 2}
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className="mobile-category-card__shade" />
                  <span className="mobile-category-card__icon" aria-hidden="true">{getCategoryIcon(category.slug)}</span>
                </span>
                <span className="mobile-category-card__label">{t(category.name, locale)}</span>
              </Link>
            ))}
          </div>
        </Reveal>

        {/* Spacious editorial category grid on tablet and desktop. */}
        <Reveal className="hidden md:block">
          <div className="text-center">
            <p className="text-label text-accent mb-3">
              {fa ? "دسته‌بندی‌ها" : "Categories"}
            </p>
            <h2 className="font-display text-h1 text-balance">
              {fa ? "سبک خود را انتخاب کنید" : "Explore by Category"}
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-body-lg text-foreground-secondary">
              {fa
                ? "از میان طیف گسترده‌ای از سبک‌ها و دسته‌بندی‌ها، طرح مورد نظر خود را بیابید"
                : "Discover patterns across a wide range of styles and product categories"}
            </p>
          </div>
        </Reveal>

        <Reveal className="mt-10 hidden md:block">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {cats.map((category, index) => (
              <Reveal key={category.id} delay={index * 55}>
                <Link
                  href={href(locale, `/patterns?category=${category.slug}`)}
                  className="group relative flex flex-col items-center overflow-hidden rounded-2xl border border-border bg-surface transition-shadow duration-300 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div className="relative w-full overflow-hidden" style={{ paddingBottom: "100%" }}>
                    <Image
                      src={category.image}
                      alt={t(category.name, locale)}
                      fill
                      sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 17vw"
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.07]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white opacity-70 backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:opacity-100">
                        {getCategoryIcon(category.slug)}
                      </span>
                    </span>
                  </div>
                  <div className="w-full px-2 py-2.5 text-center">
                    <p className="truncate text-xs font-semibold leading-snug text-foreground">
                      {t(category.name, locale)}
                    </p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </Reveal>

        <Reveal className="mt-8 hidden justify-center md:flex">
          <Link
            href={href(locale, "/styles")}
            className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground-secondary transition-colors hover:border-foreground hover:text-foreground"
          >
            {dict.nav.viewAll}
            <ArrowUpRight className="h-3.5 w-3.5 rtl-flip" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}


/* ------------------------------------------------------------------ */
export function PatternRail({ id, eyebrow, title, description, patterns, hrefPath, tone = "default" }: { id: string; eyebrow?: string; title: string; description?: string; patterns: PatternCardData[]; hrefPath: string; tone?: "default" | "secondary" }) {
  const { locale, dict } = useLocale();
  return (
    <section id={id} className={cn(tone === "secondary" && "bg-background-secondary")}>
      <div className="container-x section-y">
        <SectionHeader eyebrow={eyebrow} title={title} description={description} href={href(locale, hrefPath)} hrefLabel={dict.nav.viewAll} />
        <Reveal className="mt-10">
          {patterns.length ? (
            <Carousel>{patterns.map((p) => <PatternCard key={p.id} pattern={p} />)}</Carousel>
          ) : (
            <EmptyState />
          )}
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export function BestSellersSection({ patterns, products }: { patterns: PatternCardData[]; products: ProductCardData[] }) {
  const { locale, dict } = useLocale();
  return (
    <section className="container-x section-y">
      <SectionHeader eyebrow={dict.common.bestSeller} title={dict.home.bestTitle} description={dict.home.bestDesc} href={href(locale, "/patterns?sort=best")} hrefLabel={dict.nav.viewAll} />
      {/* Phones: compact card bodies keep the 2-column grid calm. */}
      <div className="mt-8 grid grid-cols-2 gap-3 md:hidden">
        {patterns.slice(0, 2).map((p, i) => (
          <Reveal key={p.id} delay={i * 60}><PatternCard pattern={p} variant="compact" /></Reveal>
        ))}
        {products.slice(0, 2).map((p, i) => (
          <Reveal key={p.id} delay={(i + 2) * 60}><ProductCard product={p} variant="compact" /></Reveal>
        ))}
      </div>
      <div className="mt-10 hidden grid-cols-2 gap-3.5 sm:gap-5 md:grid lg:grid-cols-4">
        {patterns.slice(0, 2).map((p, i) => (
          <Reveal key={p.id} delay={i * 60}><PatternCard pattern={p} /></Reveal>
        ))}
        {products.slice(0, 2).map((p, i) => (
          <Reveal key={p.id} delay={(i + 2) * 60}><ProductCard product={p} /></Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/** Mixed “new arrivals” rail: wallpaper · fabric · curtain · décor (not pattern-only). */
export function NewArrivalsSection({ patterns, products }: { patterns: PatternCardData[]; products: ProductCardData[] }) {
  const { locale, dict } = useLocale();
  const items: Array<{ key: string; kind: "pattern" | "product"; pattern?: PatternCardData; product?: ProductCardData }> = [];
  // Interleave: product, pattern, product, pattern… so the rail is never pattern-only
  const P = products.slice(0, 5);
  const A = patterns.slice(0, 3);
  const max = Math.max(P.length, A.length);
  for (let i = 0; i < max; i++) {
    if (P[i]) items.push({ key: P[i].id, kind: "product", product: P[i] });
    if (A[i]) items.push({ key: A[i].id, kind: "pattern", pattern: A[i] });
  }
  if (!items.length) return null;
  return (
    <section id="new" className="container-x section-y">
      <SectionHeader
        eyebrow={dict.common.new}
        title={dict.home.newTitle}
        description={dict.home.newDesc}
        href={href(locale, "/shop?sort=new")}
        hrefLabel={dict.nav.viewAll}
      />
      <Reveal className="mt-10">
        <Carousel>
          {items.map((it) =>
            it.kind === "product" && it.product ? (
              <ProductCard key={it.key} product={it.product} />
            ) : it.pattern ? (
              <PatternCard key={it.key} pattern={it.pattern} />
            ) : null,
          )}
        </Carousel>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export function ArtistsSection({ artists }: { artists: ArtistCardData[] }) {
  const { locale, dict } = useLocale();
  return (
    <section className="container-x section-y">
      <SectionHeader eyebrow={dict.nav.artists} title={dict.home.artistsTitle} description={dict.home.artistsDesc} href={href(locale, "/artists")} hrefLabel={dict.nav.viewAll} />
      {/* Phones: one elegant swipe rail instead of four full-screen stacked cards. */}
      <Reveal className="mt-10 md:hidden">
        <Carousel itemClassName="w-full sm:w-[calc((100%-1rem)/2)]">
          {artists.slice(0, 4).map((a) => (
            <ArtistCard key={a.id} artist={a} />
          ))}
        </Carousel>
      </Reveal>
      <div className="mt-10 hidden gap-5 md:grid md:grid-cols-2 xl:grid-cols-4">
        {artists.slice(0, 4).map((a, i) => (
          <Reveal key={a.id} delay={i * 70}><ArtistCard artist={a} /></Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export function PortfoliosSection({ items, title, description, eyebrow, hrefPath }: { items: PortfolioCardData[]; title: string; description: string; eyebrow: string; hrefPath: string }) {
  const { locale, dict } = useLocale();
  return (
    <section className="container-x section-y">
      <SectionHeader eyebrow={eyebrow} title={title} description={description} href={href(locale, hrefPath)} hrefLabel={dict.nav.viewAll} />
      {/* Phones: one cinematic swipe rail; the editorial bento is desktop-only. */}
      <Reveal className="mt-10 md:hidden">
        <Carousel itemClassName="w-full sm:w-[calc((100%-1rem)/2)]">
          {items.slice(0, 4).map((p, i) => (
            <div key={p.id} className="aspect-[4/3]">
              <PortfolioCard item={p} priority={i === 0} />
            </div>
          ))}
        </Carousel>
      </Reveal>
      <Reveal className="mt-10 hidden md:block">
        <BentoGrid>
          {items.slice(0, 4).map((p, i) => (
            <div key={p.id} className={bentoSpan[i === 0 ? "hero" : i === 1 ? "tall" : i === 2 ? "square" : "wide"]}>
              <PortfolioCard item={p} priority={i === 0} />
            </div>
          ))}
        </BentoGrid>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export function StylesSection({ categories, counts }: { categories: Category[]; counts: Record<string, number> }) {
  const { locale, dict } = useLocale();
  const cats = categories.slice(0, 7);
  return (
    <section className="bg-background-secondary">
      <div className="container-x section-y">
        <SectionHeader eyebrow={dict.nav.styles} title={dict.home.stylesTitle} description={dict.home.stylesDesc} href={href(locale, "/styles")} hrefLabel={dict.nav.viewAll} />
        {/* Phones: swipeable style tiles instead of the desktop mosaic. */}
        <Reveal className="mt-10 md:hidden">
          <Carousel>
            {cats.map((c) => {
              const n = counts[c.id] ?? 0;
              return (
                <StyleCard key={c.id} href={href(locale, `/styles/${c.slug}`)} title={t(c.name, locale)} image={c.image} className="aspect-[4/5]" count={`${locale === "fa" ? faNum(n) : n} ${dict.common.patterns}`} />
              );
            })}
          </Carousel>
        </Reveal>
        <Reveal className="mt-10 hidden md:block">
          <BentoGrid rows="auto-rows-[152px] sm:auto-rows-[176px] md:auto-rows-[220px]">
            {cats.map((c, i) => {
              const span = i === 0 ? "col-span-2 row-span-2 md:col-span-3 lg:col-span-5 lg:row-span-2" : i === 3 ? "col-span-2 md:col-span-3 lg:col-span-4" : "col-span-1 md:col-span-3 lg:col-span-3";
              const n = counts[c.id] ?? 0;
              return (
                <StyleCard key={c.id} big={i === 0} href={href(locale, `/styles/${c.slug}`)} title={t(c.name, locale)} description={t(c.description, locale)} image={c.image} className={span} count={`${locale === "fa" ? faNum(n) : n} ${dict.common.patterns}`} />
              );
            })}
          </BentoGrid>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export function SpacesSection({ spaces }: { spaces: Space[] }) {
  const { locale, dict } = useLocale();
  return (
    <section className="container-x section-y">
      <SectionHeader eyebrow={dict.nav.spaces} title={dict.home.spacesTitle} description={dict.home.spacesDesc} href={href(locale, "/spaces")} hrefLabel={dict.nav.viewAll} />
      <Reveal className="mt-10">
        <Carousel itemClassName="w-[calc((100%-0.875rem)/2)] sm:w-[calc((100%-1rem)/2)] md:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)] xl:w-[calc((100%-4rem)/5)]">
          {spaces.map((s) => (
            <StyleCard key={s.id} href={href(locale, `/spaces/${s.slug}`)} title={t(s.name, locale)} image={s.image} className="aspect-[4/5]" />
          ))}
        </Carousel>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export function ExclusiveSection({ products, heroImage }: { products: ProductCardData[]; heroImage: string }) {
  const { locale, dict } = useLocale();
  if (!products.length) return null;
  return (
    <section className="relative overflow-hidden bg-[#0f141c] text-white">
      <div className="pointer-events-none absolute -top-40 end-[-10%] h-[520px] w-[520px] rounded-full bg-accent/20 blur-[140px]" />
      <div className="container-x section-y relative">
        <SectionHeader tone="inverse" eyebrow={dict.common.siteExclusive} title={dict.home.exclusiveTitle} description={dict.home.exclusiveDesc} href={href(locale, "/shop")} hrefLabel={dict.nav.viewAll} />
        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-stretch">
          {/* hero image — decorative, full height */}
          <Reveal className="h-full lg:self-stretch">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl lg:aspect-auto lg:h-full">
              <Image src={heroImage} alt={dict.home.exclusiveTitle} fill sizes="(max-width:1024px) 100vw, 50vw" className="img-zoom object-cover" />
              <div className="absolute inset-0 vignette" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <h3 className="font-display text-h2">{dict.home.exclusiveTitle}</h3>
                <p className="mt-2 line-clamp-2 max-w-md text-body-sm text-white/75">{dict.home.exclusiveDesc}</p>
              </div>
            </div>
          </Reveal>
          {/* Phones: product rail under the banner */}
          <div className="md:hidden">
            <Carousel>
              {products.slice(0, 4).map((p) => (
                <div key={p.id} className="h-full overflow-hidden rounded-xl bg-white text-foreground dark:bg-surface">
                  <ProductCard product={p} />
                </div>
              ))}
            </Carousel>
          </div>
          {/* 4 product cards: 2 top + 2 bottom */}
          <div className="hidden grid-cols-2 gap-4 md:grid">
            {products.slice(0, 4).map((p, i) => (
              <Reveal key={p.id} delay={i * 70}>
                <div className="rounded-xl bg-white text-foreground dark:bg-surface overflow-hidden h-full">
                  <ProductCard product={p} variant="compact" />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export function EducationSection({ items }: { items: EducationCardData[] }) {
  const { locale, dict } = useLocale();
  const [lead, ...rest] = items;
  if (!lead) return null;
  return (
    <section className="container-x section-y">
      <SectionHeader eyebrow={dict.nav.education} title={dict.home.educationTitle} description={dict.home.educationDesc} href={href(locale, "/academy")} hrefLabel={dict.nav.viewAll} />
      {/* Phones: swipe rail of the same courses as the desktop spread. */}
      <Reveal className="mt-8 md:hidden">
        <Carousel itemClassName="w-full sm:w-[calc((100%-1rem)/2)]">
          {items.slice(0, 5).map((e) => (
            <EducationCard key={e.id} item={e} />
          ))}
        </Carousel>
      </Reveal>
      <div className="mt-10 hidden gap-6 md:grid lg:grid-cols-12">
        <Reveal className="lg:col-span-7"><EducationCard item={lead} variant="large" progress={0} /></Reveal>
        <Reveal className="lg:col-span-5 rounded-xl border border-border p-2 md:p-4">
          <p className="px-3 pt-2 text-label text-muted">{locale === "fa" ? "محبوب‌ترین‌ها" : "Popular"}</p>
          <div className="mt-2 px-3">
            {rest.slice(0, 4).map((e) => <EducationCard key={e.id} item={e} variant="row" />)}
          </div>
          <div className="px-3 pb-2 pt-4">
            <Button href={href(locale, "/academy")} variant="outline" size="sm">{dict.nav.viewAll}<ArrowUpRight className="h-4 w-4 rtl-flip" /></Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export function B2BCustomSection({ image1, image2, showB2B = true, showCustom = true }: { image1: string; image2: string; showB2B?: boolean; showCustom?: boolean }) {
  const { locale, dict } = useLocale();
  const items = [
    ...(showB2B ? [{ icon: Building2, title: dict.home.b2bTitle, desc: dict.home.b2bDesc, cta: dict.home.b2bCta, path: "/projects", image: image1 }] : []),
    ...(showCustom ? [{ icon: PenTool, title: dict.home.customTitle, desc: dict.home.customDesc, cta: dict.home.customCta, path: "/custom", image: image2 }] : []),
  ];
  if (items.length === 0) return null;
  return (
    <section className="container-x section-y">
      <div className={items.length === 1 ? "grid gap-6" : "grid gap-6 lg:grid-cols-2"}>
        {items.map((it, i) => (
          <Reveal key={it.path} delay={i * 80}>
            <Link href={href(locale, it.path)} className="group relative flex aspect-[4/3] min-h-0 flex-col justify-end overflow-hidden rounded-xl p-6 text-white sm:aspect-[16/10] sm:p-8 md:aspect-auto md:min-h-[480px]">
              <Image src={it.image} alt="" fill sizes="(max-width:1024px) 100vw, 50vw" className="img-zoom object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0d13]/90 via-[#0a0d13]/40 to-[#0a0d13]/10" />
              <div className="relative">
                <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full glass !bg-white/10 !border-white/20"><it.icon className="h-5 w-5" /></span>
                <h3 className="font-display text-h2 text-balance">{it.title}</h3>
                <p className="mt-3 max-w-md text-body-sm text-white/75">{it.desc}</p>
                <span className="mt-6 inline-flex items-center gap-2 border-b border-white/50 pb-1 text-sm font-medium transition-colors group-hover:border-white">{it.cta}<ArrowUpRight className="h-4 w-4 rtl-flip arrow-shift" /></span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export function StoriesSection({ stories, artists }: { stories: Story[]; artists: Artist[] }) {
  const { locale, dict } = useLocale();
  return (
    <section className="bg-background-secondary">
      <div className="container-x section-y">
        <SectionHeader eyebrow={dict.nav.stories} title={dict.home.storiesTitle} description={dict.home.storiesDesc} href={href(locale, "/stories")} hrefLabel={dict.nav.viewAll} />
        {/* Phones: a calm reading list with square thumbs. */}
        <div className="mt-6 md:hidden">
          {stories.slice(0, 3).map((s, i) => {
            const a = artists.find((x) => x.id === s.artistId);
            return (
              <Reveal key={s.id} delay={i * 60} className="border-b border-border last:border-b-0">
                <Link href={href(locale, `/stories/${s.slug}`)} className="group flex items-center gap-4 py-4">
                  <span className="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-xl bg-background">
                    <Image src={s.image} alt="" fill sizes="92px" className="img-zoom object-cover" />
                  </span>
                  <span className="min-w-0">
                    {a && <span className="block text-caption font-medium text-accent">{t(a.name, locale)}</span>}
                    <span className="mt-1 block line-clamp-2 font-semibold leading-snug text-foreground group-hover:text-accent transition-colors">{t(s.title, locale)}</span>
                    <span className="mt-1 block line-clamp-2 text-caption leading-6 text-foreground-secondary">{t(s.excerpt, locale)}</span>
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </div>
        <div className="mt-10 hidden gap-6 md:grid md:grid-cols-3">
          {stories.slice(0, 3).map((s, i) => {
            const a = artists.find((x) => x.id === s.artistId);
            return (
              <Reveal key={s.id} delay={i * 70}>
                <Link href={href(locale, `/stories/${s.slug}`)} className="group block">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-background md:aspect-[4/3]">
                    <Image src={s.image} alt="" fill sizes="(max-width:768px) 100vw, 33vw" className="img-zoom object-cover" />
                    <Quote className="absolute top-4 start-4 h-6 w-6 text-white/80" />
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    {a && <span className="relative h-9 w-9 overflow-hidden rounded-full"><Image src={a.avatar} alt="" fill sizes="36px" className="object-cover" /></span>}
                    <div>
                      <p className="text-caption text-foreground-secondary">{a ? t(a.name, locale) : ""}</p>
                      <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors">{t(s.title, locale)}</h3>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-body-sm text-foreground-secondary">{t(s.excerpt, locale)}</p>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
export function NewsletterSection() {
  const { dict } = useLocale();
  return (
    <section className="container-x section-y">
      <Reveal className="relative overflow-hidden rounded-xl border border-border bg-surface px-5 py-10 text-center md:px-12 md:py-20">
        <div className="pointer-events-none absolute -bottom-32 start-1/2 h-64 w-[60%] -translate-x-1/2 rounded-full bg-accent/15 blur-[100px] rtl:translate-x-1/2" />
        <p className="text-label text-accent">Newsletter</p>
        <h2 className="mt-4 font-display text-h1 text-balance">{dict.common.newsletterTitle}</h2>
        <p className="mx-auto mt-4 max-w-lg text-body-lg text-foreground-secondary">{dict.common.newsletterDesc}</p>
        <div className="mx-auto mt-8 max-w-md"><NewsletterForm /></div>
      </Reveal>
    </section>
  );
}
