"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/components/providers/AppProviders";
import { cn } from "@/lib/utils";
import { SuccessState } from "@/components/ui/States";

export function NewsletterForm({ compact, className }: { compact?: boolean; className?: string }) {
  const { locale, dict } = useLocale();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(locale === "fa" ? "ایمیل معتبر وارد کنید." : "Enter a valid e-mail address.");
      setState("error");
      return;
    }
    if (!consent) {
      setError(locale === "fa" ? "برای عضویت در خبرنامه، رضایت خود را تأیید کنید." : "Please consent to receive the newsletter.");
      setState("error");
      return;
    }

    setState("loading");
    setError("");
    try {
      const r = await fetch("/api/newsletter", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail, consent: true, locale }),
        headers: { "content-type": "application/json" },
      });
      const payload = await r.json().catch(() => null) as { ok?: boolean } | null;
      if (!r.ok || !payload?.ok) throw new Error("newsletter_submit_failed");
      setState("ok");
    } catch {
      setError(locale === "fa" ? "ثبت ایمیل انجام نشد؛ لطفاً دوباره تلاش کنید." : "We could not save your e-mail. Please try again.");
      setState("error");
    }
  };

  if (state === "ok") return <div className={className}><SuccessState message={dict.common.newsletterOk} /></div>;

  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-3", className)} noValidate>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={compact ? "nl-compact" : "nl"}>{dict.common.email}</label>
        <input
          id={compact ? "nl-compact" : "nl"}
          type="email"
          dir="ltr"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state === "error") { setState("idle"); setError(""); } }}
          placeholder="you@example.com"
          aria-invalid={state === "error"}
          className={cn("h-11 w-full rounded-full border bg-surface px-4 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/10", state === "error" ? "border-error" : "border-border focus:border-foreground", compact ? "" : "h-13")}
        />
        <button type="submit" disabled={state === "loading"} aria-label={dict.common.newsletterCta} className={cn("flex shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105 active:scale-95 disabled:opacity-50", compact ? "h-11 w-11" : "h-13 gap-2 px-6 text-sm font-medium")}>
          {!compact && dict.common.newsletterCta}
          <ArrowRight className="h-4 w-4 rtl-flip" />
        </button>
      </div>
      <label className="flex cursor-pointer items-start gap-2 px-1 text-xs leading-relaxed text-foreground-secondary">
        <input
          type="checkbox"
          checked={consent}
          required
          aria-invalid={state === "error" && !consent}
          onChange={(e) => { setConsent(e.target.checked); if (e.target.checked && state === "error") { setState("idle"); setError(""); } }}
          className="mt-0.5 accent-accent"
        />
        <span>{locale === "fa" ? "با دریافت خبرنامهٔ آتلیه رزی از طریق ایمیل موافقم." : "I agree to receive the Rosie Atelier newsletter by e-mail."}</span>
      </label>
      {state === "error" && error && <p role="alert" className="px-1 text-xs text-error">{error}</p>}
    </form>
  );
}
