"use client";

import Image from "@/components/ui/SiteImage";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Product/pattern gallery: large stage + thumbnail rail, keyboard accessible.
 *  Optional `active` prop keeps the stage in sync with an external colourway picker.
 */
export function Gallery({
  images,
  alt,
  className,
  ratio = "aspect-[4/5]",
  active,
}: {
  images: string[];
  alt: string;
  className?: string;
  ratio?: string;
  /** When set, forces the gallery to show this image (colourway sync). */
  active?: string | null;
}) {
  const list = images.length ? images : ["/images/patterns/p06.jpg"];
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!active) return;
    const idx = list.indexOf(active);
    if (idx >= 0) setI(idx);
    else {
      // active image not in list — still show it by not changing index, parent should include it
    }
  }, [active, list]);

  const display = active && !list.includes(active) ? [active, ...list] : list;
  const current = Math.min(i, display.length - 1);

  /* Touch swipe on the stage (RTL-aware): the next frame lives in the
     reading direction, so the gesture flips with the document dir. */
  const [touchX, setTouchX] = useState<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => setTouchX(e.touches[0]?.clientX ?? null);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX == null || display.length < 2) return;
    const endX = e.changedTouches[0]?.clientX ?? touchX;
    const delta = endX - touchX;
    setTouchX(null);
    if (Math.abs(delta) < 42) return;
    const rtl = document.documentElement.dir === "rtl";
    const goNext = rtl ? delta > 0 : delta < 0;
    setI((prev) => {
      const cur = Math.min(prev, display.length - 1);
      return goNext
        ? Math.min(cur + 1, display.length - 1)
        : Math.max(cur - 1, 0);
    });
  };

  return (
    <div className={cn("grid gap-3", className)}>
      <div
        className={cn("mobile-gallery-stage relative touch-pan-y overflow-hidden rounded-lg bg-background-secondary", ratio)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {display.map((src, idx) => (
          <Image
            key={src + idx}
            src={src}
            alt={alt}
            fill
            priority={idx === 0}
            sizes="(max-width:767px) 100vw, (max-width:1024px) 100vw, 55vw"
            className={cn(
              "object-cover transition-[opacity,transform] duration-700 ease-[var(--ease-out)]",
              idx === current ? "opacity-100 scale-100" : "opacity-0 scale-[1.03]",
            )}
          />
        ))}
        {display.length > 1 && (
          <div className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-1.5 md:hidden" aria-hidden="true">
            {display.map((src, idx) => (
              <span
                key={src + idx}
                className={cn(
                  "h-1.5 rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-all duration-300",
                  idx === current ? "w-5 bg-white" : "w-1.5 bg-white/55",
                )}
              />
            ))}
          </div>
        )}
      </div>
      {display.length > 1 && (
        <div role="tablist" className="no-scrollbar flex gap-2 overflow-x-auto px-0.5 py-0.5 [scroll-padding-inline:0.125rem]">
          {display.map((src, idx) => (
            <button
              key={src + idx}
              role="tab"
              aria-selected={idx === current}
              aria-label={`${alt} ${idx + 1}`}
              onClick={() => setI(idx)}
              className={cn(
                "relative h-20 w-16 shrink-0 overflow-hidden rounded-md ring-offset-2 ring-offset-background transition-[box-shadow,opacity]",
                idx === current ? "ring-2 ring-foreground" : "opacity-70 hover:opacity-100",
              )}
            >
              <Image src={src} alt="" fill sizes="160px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
