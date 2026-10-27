"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Shapes, ShoppingBag, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useAuth,
  useLocale,
  useSearch,
} from "@/components/providers/AppProviders";
import { cn, href } from "@/lib/utils";

type MobileTab = {
  key: "home" | "patterns" | "search" | "shop" | "account";
  label: string;
  icon: LucideIcon;
  href?: string;
};

/** App-like bottom navigation for the public mobile experience. */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { locale, dict } = useLocale();
  const { user } = useAuth();
  const { isOpen: searchOpen, open: openSearch } = useSearch();
  const fa = locale === "fa";

  const hiddenRoute =
    [
      href(locale, "/login"),
      href(locale, "/signup"),
      href(locale, "/checkout"),
      href(locale, "/checkout/return"),
      href(locale, "/checkout/sandbox"),
    ].some((route) => pathname === route || pathname.startsWith(`${route}/`)) ||
    /\/academy\/[^/]+\/(?:live|broadcast)\/?$/.test(pathname) ||
    // Detail pages get the sticky buy bar instead of the tab bar.
    /\/(?:patterns|shop|academy)\/[^/]+\/?$/.test(pathname);

  if (hiddenRoute) return null;

  const tabs: MobileTab[] = [
    { key: "home", label: dict.nav.home, icon: Home, href: href(locale, "/") },
    {
      key: "patterns",
      label: dict.nav.patterns,
      icon: Shapes,
      href: href(locale, "/patterns"),
    },
    { key: "search", label: dict.nav.search, icon: Search },
    {
      key: "shop",
      label: dict.nav.products,
      icon: ShoppingBag,
      href: href(locale, "/shop"),
    },
    {
      key: "account",
      label: dict.nav.account,
      icon: UserRound,
      href: href(locale, user ? "/account" : "/login"),
    },
  ];

  const isActive = (tab: MobileTab) => {
    if (tab.key === "home")
      return (
        pathname === href(locale, "/") || pathname === `${href(locale, "/")}/`
      );
    if (tab.key === "search") return searchOpen;
    if (tab.key === "patterns")
      return pathname.startsWith(href(locale, "/patterns"));
    if (tab.key === "shop")
      return (
        pathname.startsWith(href(locale, "/shop")) ||
        pathname.startsWith(href(locale, "/marketplace"))
      );
    return ["/account", "/login", "/signup"].some((route) =>
      pathname.startsWith(href(locale, route)),
    );
  };

  return (
    <>
      <nav
        className="mobile-tabbar lg:hidden"
        aria-label={fa ? "پیمایش اصلی" : "Main navigation"}
      >
        <div className="mobile-tabbar__surface">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab);
            const content = (
              <>
                <span
                  className={cn(
                    "mobile-tabbar__icon",
                    active && "mobile-tabbar__icon--active",
                    tab.key === "search" && "mobile-tabbar__icon--search",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className="h-[19px] w-[19px]"
                    strokeWidth={active ? 2.25 : 1.8}
                  />
                </span>
                <span
                  className={cn(
                    "mobile-tabbar__label",
                    active && "mobile-tabbar__label--active",
                  )}
                >
                  {tab.label}
                </span>
              </>
            );

            if (tab.key === "search") {
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={openSearch}
                  className={cn(
                    "mobile-tabbar__item mobile-tabbar__item--search",
                    active && "is-active",
                  )}
                  aria-label={tab.label}
                  aria-pressed={searchOpen}
                >
                  {content}
                </button>
              );
            }

            return (
              <Link
                key={tab.key}
                href={tab.href!}
                className={cn("mobile-tabbar__item", active && "is-active")}
                aria-current={active ? "page" : undefined}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="mobile-tabbar-spacer lg:hidden" aria-hidden="true" />
    </>
  );
}
