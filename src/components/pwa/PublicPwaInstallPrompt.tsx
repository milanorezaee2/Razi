"use client";

import { useEffect, useState } from "react";
import { Share2, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export function PublicPwaInstallPrompt({ locale }: { locale: "fa" | "en" }) {
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const isPersian = locale === "fa";

  useEffect(() => {
    const onInstallable = () => setInstallable(true);
    const onInstalled = () => {
      setInstalled(true);
      setInstallable(false);
      setIos(false);
    };

    window.addEventListener("ra-public-pwa-installable", onInstallable);
    window.addEventListener("ra-public-pwa-installed", onInstalled);

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(isStandalone);

    const isIosDevice =
      /iPad|iPhone|iPod/i.test(window.navigator.userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    if (isIosDevice && !isStandalone) setIos(true);

    return () => {
      window.removeEventListener("ra-public-pwa-installable", onInstallable);
      window.removeEventListener("ra-public-pwa-installed", onInstalled);
    };
  }, []);

  const install = async () => {
    const prompt = (window as unknown as { __raPublicInstallPrompt?: InstallPromptEvent })
      .__raPublicInstallPrompt;
    if (!prompt) return;

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallable(false);
    } catch {
      setInstallable(false);
    }
  };

  if (installed || dismissed || (!installable && !ios)) return null;

  return (
    <aside
      className="mobile-install-prompt fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[80] mx-auto max-w-md lg:inset-x-auto lg:right-6 lg:bottom-6"
      aria-label={isPersian ? "نصب آتلیه رزی" : "Install Rosie Atelier"}
    >
      <div className="flex items-start gap-3 rounded-2xl border border-accent/25 bg-white p-3 shadow-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {isPersian ? "نصب آتلیه رزی" : "Install Rosie Atelier"}
          </p>
          {ios ? (
            <p className="mt-1 flex items-start gap-1.5 text-xs leading-6 text-foreground-secondary">
              <Share2 className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />
              {isPersian
                ? "از منوی اشتراک‌گذاری مرورگر، «افزودن به صفحهٔ اصلی» را انتخاب کنید."
                : "Choose Share, then Add to Home Screen in your browser."}
            </p>
          ) : (
            <p className="mt-1 text-xs leading-5 text-foreground-secondary">
              {isPersian
                ? "برای دسترسی سریع، آتلیه رزی را روی دستگاهتان نصب کنید."
                : "Install the app for quick access from your device."}
            </p>
          )}
        </div>
        {!ios && installable && (
          <button
            type="button"
            onClick={() => void install()}
            className="min-h-[44px] shrink-0 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white"
          >
            {isPersian ? "نصب" : "Install"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 p-2 text-muted"
          aria-label={isPersian ? "بستن پیام نصب" : "Dismiss install prompt"}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
