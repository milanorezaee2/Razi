"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Mobile app-style sticky action bar for detail pages.
 *
 * Two modes:
 * - `watchRef`: appears once the referenced buy-box CTA scrolls above the
 *   fold (product / pattern PDPs).
 * - `watchId` + `revealAfter`: appears after scrolling `revealAfter` px
 *   while the element with that id (e.g. an enroll form) is out of view.
 *
 * Hidden on lg+ (desktop keeps sticky side columns). Rendered in a portal
 * so `fixed` positioning is not captured by transformed ancestors.
 */
export function StickyBuyBar({
  watchRef,
  watchId,
  revealAfter = 480,
  price,
  caption,
  children,
}: {
  watchRef?: RefObject<HTMLElement | null>;
  watchId?: string;
  revealAfter?: number;
  price: ReactNode;
  caption?: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (watchId) {
      const el = document.getElementById(watchId);
      if (!el) return;
      let raf = 0;
      const update = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          const outOfView = r.bottom < 72 || r.top > window.innerHeight;
          setVisible(outOfView && window.scrollY > revealAfter);
        });
      };
      update();
      window.addEventListener("scroll", update, { passive: true });
      window.addEventListener("resize", update);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("scroll", update);
        window.removeEventListener("resize", update);
      };
    }
    const el = watchRef?.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0, rootMargin: "-72px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [watchRef, watchId, revealAfter]);

  if (!mounted) return null;

  return createPortal(
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        "sticky-buybar fixed inset-x-0 bottom-0 z-40 transition-[transform,opacity] duration-300 ease-out lg:hidden",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0",
      )}
    >
      <div className="border-t border-border bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_36px_rgba(28,25,23,0.12)] backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 shrink-0">
            {caption && (
              <p className="max-w-[9.5rem] truncate text-caption leading-tight text-muted">
                {caption}
              </p>
            )}
            <p className="text-base leading-snug font-semibold whitespace-nowrap tabular">
              {price}
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
