import type { Metadata } from "next";
import Image from "@/components/ui/SiteImage";
import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { getSite } from "@/lib/data/queries";
import { dictionaries } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/types";
import { href, t } from "@/lib/utils";
import { getEditableRouteMetadata } from "@/lib/site-seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return getEditableRouteMetadata("/stories", locale, dictionaries[locale].nav.stories);
}
export default async function StoriesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const site = await getSite();
  const d = dictionaries[locale];
  return (
    <>
      <PageHero eyebrow={d.nav.stories} title={d.home.storiesTitle} description={d.home.storiesDesc} />
      <div className="container-x pb-16 lg:space-y-16 lg:pb-20">
        {site.stories.map((s, i) => {
          const a = site.artists.find((x) => x.id === s.artistId);
          return (
            <Reveal key={s.id} className="border-b border-border py-4 last:border-b-0 lg:border-b-0 lg:py-0">
              <Link href={href(locale, `/stories/${s.slug}`)} className={`group flex items-center gap-4 lg:grid lg:items-center lg:gap-8 lg:grid-cols-12 ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
                <div className="relative aspect-square w-[108px] shrink-0 self-start overflow-hidden rounded-xl lg:aspect-[16/10] lg:w-auto lg:self-auto lg:col-span-7"><Image src={s.image} alt="" fill sizes="(max-width:1024px) 108px, 60vw" className="img-zoom object-cover" /></div>
                <div className="min-w-0 lg:col-span-5">
                  {a && <p className="text-label text-accent">{t(a.name, locale)} · {t(a.profession, locale)}</p>}
                  <h2 className="mt-1 line-clamp-2 font-display text-h4 leading-snug text-balance group-hover:text-accent transition-colors lg:mt-3 lg:line-clamp-none lg:text-h2">{t(s.title, locale)}</h2>
                  <p className="mt-1.5 line-clamp-2 text-caption leading-6 text-foreground-secondary lg:mt-4 lg:line-clamp-none lg:text-body">{t(s.excerpt, locale)}</p>
                  <p className="mt-2 font-display text-[15px] italic leading-7 text-foreground-secondary lg:mt-6 lg:text-h3">{t(s.body, locale)}</p>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </>
  );
}
