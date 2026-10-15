import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { dictionaries } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/types";
import { getEditableRouteMetadata } from "@/lib/site-seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return getEditableRouteMetadata("/returns", locale, dictionaries[locale].footer.returns);
}
export default async function ReturnsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const d = dictionaries[locale];
  const fa = locale === "fa";
  return (
    <>
      <PageHero eyebrow={d.footer.support} title={d.footer.returns} />
      <div className="container-x prose-ra pb-20">
        <p>{fa ? "محصولات فیزیکی کالکشن اختصاصی تا ۷ روز پس از تحویل، در صورت سالم بودن و بسته‌بندی اولیه، قابل بازگشت هستند." : "Physical products from the exclusive collection can be returned within 7 days of delivery, if unused and in original packaging."}</p>
        <p>{fa ? "فایل‌های دیجیتال پترن به دلیل ماهیت‌شان قابل بازگشت نیستند. اگر فایل مشکل فنی داشته باشد، پشتیبانی آن را بررسی می‌کند و ظرف ۴۸ ساعت برای رفع مشکل یا هماهنگی بازپرداخت اقدام می‌کند. بازپرداخت تأییدشده به‌صورت دستی و خارج از این وب‌سایت، از طریق بانک یا ارائه‌دهندهٔ پرداخت انجام می‌شود؛ این سامانه انتقال وجه خودکار ندارد." : "Digital pattern files are non-returnable by nature. If a file has a technical fault, support will review it and work toward a fix or refund within 48 hours. An approved refund is processed manually outside this website through the bank or payment provider; this site does not transfer refund funds automatically."}</p>
      </div>
    </>
  );
}
