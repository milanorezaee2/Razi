"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Horizontal scroll rail with snap + RTL-aware arrow controls. */
export function Carousel({ children, className, itemClassName = "w-[calc((100%-0.875rem)/2)] sm:w-[calc((100%-1rem)/2)] md:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)]" }: { children: React.ReactNode[]; className?: string; itemClassName?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canPrev, setPrev] = useState(false);
  const [canNext, setNext] = useState(true);
  const [progress, setProgress] = useState({ p: 0, vf: 1, rtl: false, scrollable: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const x = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth - 2;
    setPrev(x > 2);
    setNext(x < max);
    const rawMax = el.scrollWidth - el.clientWidth;
    setProgress({
      p: rawMax > 0 ? Math.min(1, x / rawMax) : 0,
      vf: el.scrollWidth > 0 ? Math.min(1, el.clientWidth / el.scrollWidth) : 1,
      rtl,
      scrollable: rawMax > 4,
    });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className={cn("relative", className)}>
      <div ref={ref} className="no-scrollbar scroll-snap-x flex gap-3.5 overflow-x-auto pb-2 sm:gap-4">
        {children.map((c, i) => (
          <div key={i} className={cn("snap-item shrink-0", itemClassName)}>{c}</div>
        ))}
      </div>
      {/* Phones: a framed progress thumb shows where the rail is scrolled to —
          cards always rest fully inside the frame, nothing is cut at rest. */}
      {progress.scrollable && (
        <div className="relative mt-3 h-[3px] w-full overflow-hidden rounded-full bg-border/60 md:hidden" aria-hidden="true">
          <div
            className="absolute top-0 h-full rounded-full bg-accent"
            style={{
              width: `${progress.vf * 100}%`,
              ...(progress.rtl ? { right: `${progress.p * (1 - progress.vf) * 100}%` } : { left: `${progress.p * (1 - progress.vf) * 100}%` }),
            }}
          />
        </div>
      )}
      <div className="mt-4 hidden items-center justify-end gap-2 md:flex">
        <button type="button" aria-label="previous" disabled={!canPrev} onClick={() => scroll(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-foreground disabled:opacity-30">
          <ChevronLeft className="h-4 w-4 rtl-flip" />
        </button>
        <button type="button" aria-label="next" disabled={!canNext} onClick={() => scroll(1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-foreground disabled:opacity-30">
          <ChevronRight className="h-4 w-4 rtl-flip" />
        </button>
      </div>
    </div>
  );
}
