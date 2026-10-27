import Link from "next/link";

/**
 * Branded bilingual 404. Used by the root not-found (bare, own brand row)
 * and the [locale] not-found (inside the site shell). Static copy mirrors
 * both locales since not-found boundaries receive no route params.
 */
export function NotFoundView({ bare = false }: { bare?: boolean }) {
  return (
    <div
      className={
        bare
          ? "flex min-h-dvh flex-col bg-background px-6"
          : "container-x flex min-h-[70vh] flex-col items-center justify-center pt-[calc(var(--announce-h,0px)+var(--header-h))] text-center"
      }
    >
      {bare && (
        <header className="flex items-center justify-center pt-8">
          <Link href="/fa" className="font-display text-h3 tracking-tight text-foreground">
            Rosy<span className="text-accent"> Ateliyer</span>
          </Link>
        </header>
      )}
      <div className={bare ? "flex flex-1 flex-col items-center justify-center py-16 text-center" : "flex flex-col items-center"}>
        <p className="font-display text-[6rem] leading-none font-semibold text-foreground/10 select-none sm:text-[9rem]" aria-hidden="true">
          404
        </p>
        <h1 className="-mt-8 font-display text-display text-foreground sm:-mt-12" dir="ltr" lang="en">
          Nothing here.
        </h1>
        <p className="mt-4 max-w-md text-body leading-relaxed text-foreground-secondary">
          <span className="block" dir="ltr" lang="en">
            The page you are looking for does not exist or has moved.
          </span>
          <span className="mt-1 block" dir="rtl" lang="fa">
            صفحه‌ای که دنبالش هستید وجود ندارد یا منتقل شده است.
          </span>
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/fa"
            className="inline-flex h-12 items-center rounded-full bg-primary px-7 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            خانه
          </Link>
          <Link
            href="/en"
            className="inline-flex h-12 items-center rounded-full border border-border px-7 text-sm font-medium text-foreground transition-colors hover:border-foreground"
          >
            Home
          </Link>
        </div>
        <nav aria-label="404" className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-foreground-secondary">
          <Link href="/fa/patterns" className="transition-colors hover:text-accent">پترن‌ها</Link>
          <Link href="/fa/shop" className="transition-colors hover:text-accent">فروشگاه</Link>
          <Link href="/en/patterns" className="transition-colors hover:text-accent">Patterns</Link>
          <Link href="/en/shop" className="transition-colors hover:text-accent">Shop</Link>
        </nav>
      </div>
    </div>
  );
}
