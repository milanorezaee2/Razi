"use client";

import Image from "@/components/ui/SiteImage";
import Link from "next/link";
import { Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocale } from "@/components/providers/AppProviders";
import { Badge, Sku } from "@/components/ui/Badge";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { AddToCartButton, FavoriteButton } from "@/components/product/Actions";
import { ColorwayDots, resolveColorways } from "@/components/product/ColorwayDots";
import { useHoverCard } from "@/components/ui/HoverCard";
import { cn, formatPrice, href, t } from "@/lib/utils";
import type { Artist, Category, Colorway, Pattern } from "@/lib/types";
import { QuickView } from "@/components/product/QuickView";

export interface PatternCardData extends Pattern {
  artist: Artist | null;
  category: Category | null;
}

type Variant = "default" | "large" | "wide" | "compact";

export function PatternCard({ pattern, variant = "default", priority, className }: { pattern: PatternCardData; variant?: Variant; priority?: boolean; className?: string }) {
  const { locale, dict } = useLocale();
  const [quick, setQuick] = useState(false);
  const colorways = useMemo(() => resolveColorways(pattern), [pattern]);
  const defaultCw = colorways.find((c) => c.isDefault) ?? colorways[0];
  const [cwId, setCwId] = useState(defaultCw?.id ?? "default");
  const activeCw: Colorway = colorways.find((c) => c.id === cwId) ?? defaultCw ?? {
    id: "default",
    name: { fa: "اصلی", en: "Default" },
    hex: "#888",
    image: pattern.image,
    isDefault: true,
  };
  const { onMouseEnter, onMouseLeave, onClick, portal } = useHoverCard({ kind: "pattern", pattern });
  const url = href(locale, `/patterns/${pattern.slug}`);
  const ratio = variant === "large" ? "aspect-[4/5]" : variant === "wide" ? "aspect-[16/10]" : variant === "compact" ? "aspect-square" : "aspect-[4/5]";
  const displayImage = activeCw.image || pattern.image;

  return (
    <>
      <SpotlightCard as="article" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={onClick} className={cn("pattern-card group relative flex min-w-0 flex-col rounded-lg", className)}>
        <Link href={url} className="relative block overflow-hidden rounded-lg bg-background-secondary" aria-label={t(pattern.title, locale)}>
          <div className={cn("pattern-card__media relative w-full", variant === "large" && "pattern-card__media--large", variant === "wide" && "pattern-card__media--wide", ratio)}>
            <Image
              key={displayImage}
              src={displayImage}
              alt={`${t(pattern.title, locale)} — ${t(activeCw.name, locale)}`}
              fill
              priority={priority}
              sizes={
                variant === "large" || variant === "wide"
                  ? "(max-width:767px) 92vw, (max-width:1024px) 66vw, 50vw"
                  : variant === "compact"
                    ? "(max-width:767px) 46vw, (max-width:1024px) 25vw, 20vw"
                    : "(max-width:767px) 62vw, (max-width:1024px) 33vw, 25vw"
              }
              className="img-zoom object-cover anim-scale-fade"
            />
          </div>
          {/* top row */}
          <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {pattern.isNew && <Badge tone="glass">{dict.common.new}</Badge>}
              {pattern.trending && <Badge tone="glass">{dict.common.trending}</Badge>}
              {pattern.bestSeller && !pattern.trending && <Badge tone="glass">{dict.common.bestSeller}</Badge>}
              {!pattern.artistId && <Badge tone="glass" className="text-accent">{dict.common.sitePattern}</Badge>}
            </div>
            <FavoriteButton id={pattern.id} size="sm" />
          </div>
          {/* hover CTA */}
          <div className="pattern-card__actions pointer-events-none absolute inset-x-3 bottom-3 flex translate-y-3 items-center justify-between gap-2 opacity-0 transition-[opacity,transform] duration-300 ease-[var(--ease-out)] group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setQuick(true);
              }}
              className="pattern-card__quick inline-flex h-9 items-center gap-1.5 rounded-full glass px-3 text-[13px] font-medium text-foreground hover:bg-surface"
            >
              <Eye className="h-3.5 w-3.5" />
              {dict.common.quickView}
            </button>
            <AddToCartButton
              className="pattern-card__add"
              variant="icon"
              line={{
                kind: "pattern",
                id: pattern.id,
                sku: pattern.sku,
                title: `${t(pattern.title, locale)} — ${t(activeCw.name, locale)}`,
                image: displayImage,
                price: pattern.price,
                href: url,
                colorName: t(activeCw.name, locale),
                colorHex: activeCw.hex,
              }}
            />
          </div>
        </Link>

        <div className={cn("pattern-card__info flex min-w-0 flex-col gap-1.5 pt-3.5", variant === "large" && "pt-5")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={url} className={cn("pattern-card__title block truncate font-medium text-foreground hover:text-accent transition-colors", variant === "large" ? "text-h4" : "text-[15px]")}>
                {t(pattern.title, locale)}
              </Link>
              <p className="pattern-card__subtitle mt-0.5 truncate text-caption text-foreground-secondary">
                {pattern.artist ? (
                  <Link href={href(locale, `/artists/${pattern.artist.slug}`)} className="hover:text-foreground">
                    {t(pattern.artist.name, locale)}
                  </Link>
                ) : (
                  dict.brand
                )}
                {pattern.category && <span className="text-muted"> · {t(pattern.category.name, locale)}</span>}
              </p>
            </div>
            <span className="pattern-card__price shrink-0 text-sm font-semibold tabular text-foreground">{formatPrice(pattern.price, locale)}</span>
          </div>

          {/* Spoonflower-style colourway dots */}
          {colorways.length > 0 && (
            <div className="pattern-card__colorways flex items-center justify-between gap-2 pt-1">
              <ColorwayDots
                colorways={colorways}
                value={activeCw.id}
                onChange={setCwId}
                size={variant === "compact" ? "sm" : "md"}
                max={variant === "compact" ? 4 : 6}
                locale={locale}
              />
              <span className="min-w-0 truncate text-caption text-muted">
                {t(activeCw.name, locale)}
              </span>
            </div>
          )}

          <div className="pattern-card__metadata flex items-center justify-between gap-2 pt-0.5">
            <Sku value={pattern.sku} />
            {variant !== "compact" && (
              <span className="truncate text-caption text-muted" dir="auto">
                {t(pattern.specs.repeat, locale)} · {pattern.specs.dpi} · {t(pattern.specs.scale, locale)}
              </span>
            )}
          </div>
        </div>
      </SpotlightCard>
      {portal}
      {quick && <QuickView open={quick} onClose={() => setQuick(false)} item={{ kind: "pattern", pattern }} />}
    </>
  );
}
