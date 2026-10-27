import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { LOCALES, dirOf, type Locale } from "@/lib/i18n/types";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b2e4b",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://rosieatelier.com"),
  title: "Rosie Atelier",
  description: "Pattern, design, creativity and lifestyle.",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale?: string }> }>) {
  const { locale } = await params;
  const headerLocale = (await headers()).get("x-locale") ?? undefined;
  const lang = (
    LOCALES.includes(headerLocale as Locale)
      ? headerLocale
      : LOCALES.includes(locale as Locale)
        ? locale
        : "fa"
  ) as Locale;
  const dir = dirOf(lang);

  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <body className="min-h-dvh flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
