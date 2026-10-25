"use client";

import { useEffect } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" | string }>;
};

/** Registers the public-site worker and exposes the browser install prompt. */
export function PublicPwaRegister() {
  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      (window as unknown as { __raPublicInstallPrompt?: InstallPromptEvent }).__raPublicInstallPrompt =
        event as InstallPromptEvent;
      window.dispatchEvent(new CustomEvent("ra-public-pwa-installable"));
    };
    const onInstalled = () => {
      (window as unknown as { __raPublicInstallPrompt?: InstallPromptEvent }).__raPublicInstallPrompt = undefined;
      window.dispatchEvent(new CustomEvent("ra-public-pwa-installed"));
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator) {
      // This worker only provides a network-first offline fallback for public
      // locale pages. It does not cache account, checkout, API, or admin data.
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
        console.warn("[pwa] public service worker registration failed:", error);
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return null;
}
