"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Mail, MessageSquareText, RefreshCw } from "lucide-react";
import { useLocale } from "@/components/providers/AppProviders";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/States";
import { SESSION_FETCH } from "@/lib/http";
import { withCsrf } from "@/lib/security/csrf-client";
import { cn } from "@/lib/utils";

interface Lead {
  id: string;
  kind: "b2b" | "custom" | "contact" | "creator";
  name: string;
  email: string;
  phone?: string;
  projectType?: string;
  message: string;
  locale: "fa" | "en";
  consentAt: string;
  createdAt: string;
  status: "new" | "read" | "archived";
}

interface Subscriber {
  email: string;
  locale: "fa" | "en";
  status: "active" | "unsubscribed";
  consentAt: string;
  createdAt: string;
  updatedAt: string;
}

type Kind = "contact" | "newsletter";

export function LeadsManager() {
  const { locale } = useLocale();
  const fa = locale === "fa";
  const [kind, setKind] = useState<Kind>("contact");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/leads?kind=${kind}&limit=1000`, { ...SESSION_FETCH, signal });
      const body = await response.json().catch(() => null) as { ok?: boolean; leads?: Lead[]; subscribers?: Subscriber[] } | null;
      if (!response.ok || !body?.ok) throw new Error("load_failed");
      if (kind === "contact") setLeads(body.leads ?? []);
      else setSubscribers(body.subscribers ?? []);
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") setError(fa ? "دریافت فهرست انجام نشد. دوباره تلاش کنید." : "Could not load the inbox. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [kind, fa]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const updateStatus = async (record: { kind: Kind; id?: string; email?: string; status: string }) => {
    const busy = record.id ?? record.email ?? "";
    setBusyId(busy);
    setError("");
    try {
      const response = await fetch("/api/admin/leads", {
        ...SESSION_FETCH,
        ...withCsrf({
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(record),
        }),
      });
      const body = await response.json().catch(() => null) as { ok?: boolean } | null;
      if (!response.ok || !body?.ok) throw new Error("update_failed");
      await load();
    } catch {
      setError(fa ? "ذخیرهٔ تغییر انجام نشد." : "The update could not be saved.");
    } finally {
      setBusyId("");
    }
  };

  const exportHref = `/api/admin/leads?kind=${kind}&format=csv&limit=5000`;
  const dateLabel = (value: string) => new Date(value).toLocaleString(fa ? "fa-IR" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-5" dir={fa ? "rtl" : "ltr"}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent"><MessageSquareText className="h-4 w-4" /></span>
            {fa ? "درخواست‌ها و خبرنامه" : "Inquiries & newsletter"}
          </h1>
          <p className="mt-1 text-sm text-muted">{fa ? "درخواست‌ها فقط پس از ذخیرهٔ موفق در این فهرست تأیید می‌شوند." : "A form is acknowledged only after the submission has been saved here."}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />{fa ? "به‌روزرسانی" : "Refresh"}
          </Button>
          <a href={exportHref} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium hover:bg-background-secondary">
            <Download className="h-4 w-4" />{fa ? "خروجی CSV" : "Export CSV"}
          </a>
        </div>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={fa ? "نوع فهرست" : "Inbox type"}>
        {(["contact", "newsletter"] as const).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={kind === item} onClick={() => setKind(item)} className={cn("rounded-full border px-4 py-2 text-sm font-medium", kind === item ? "border-foreground bg-foreground text-white" : "border-border bg-white text-foreground-secondary hover:border-foreground-secondary")}>
            {item === "contact" ? (fa ? "درخواست‌های تماس" : "Contact requests") : (fa ? "مشترکان خبرنامه" : "Newsletter subscribers")}
          </button>
        ))}
      </div>

      {error && <div role="alert" className="rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">{error}</div>}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-32 rounded-xl" />)}</div>
      ) : kind === "contact" ? (
        leads.length ? (
          <div className="space-y-3">
            <p className="text-xs text-muted">{fa ? `${leads.length.toLocaleString("fa-IR")} درخواست` : `${leads.length} requests`}</p>
            {leads.map((lead) => (
              <article key={lead.id} className="rounded-xl border border-border bg-white p-4 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{lead.name}</h2>
                      <Badge tone={lead.status === "new" ? "warning" : lead.status === "archived" ? "neutral" : "success"}>
                        {lead.status === "new" ? (fa ? "جدید" : "New") : lead.status === "read" ? (fa ? "بررسی‌شده" : "Read") : (fa ? "بایگانی" : "Archived")}
                      </Badge>
                      <Badge tone="outline">{lead.kind === "b2b" ? "B2B" : lead.kind}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-secondary">
                      <a className="inline-flex items-center gap-1 hover:text-foreground" href={`mailto:${encodeURIComponent(lead.email)}`}><Mail className="h-3.5 w-3.5" />{lead.email}</a>
                      {lead.phone && <a href={`tel:${encodeURIComponent(lead.phone)}`} dir="ltr" className="hover:text-foreground">{lead.phone}</a>}
                      {lead.projectType && <span>{lead.projectType}</span>}
                    </div>
                  </div>
                  <time className="text-xs text-muted" dateTime={lead.createdAt}>{dateLabel(lead.createdAt)}</time>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-background-secondary/70 p-3 text-sm leading-relaxed">{lead.message}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">{fa ? "رضایت ثبت‌شده:" : "Consent recorded:"} {dateLabel(lead.consentAt)}</span>
                  <div className="flex gap-2">
                    {lead.status === "new" && <Button variant="outline" size="sm" disabled={busyId === lead.id} onClick={() => void updateStatus({ kind: "contact", id: lead.id, status: "read" })}>{fa ? "علامت‌گذاری بررسی‌شده" : "Mark read"}</Button>}
                    {lead.status !== "archived" && <Button variant="ghost" size="sm" disabled={busyId === lead.id} onClick={() => void updateStatus({ kind: "contact", id: lead.id, status: "archived" })}>{fa ? "بایگانی" : "Archive"}</Button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : <Empty kind="contact" fa={fa} />
      ) : subscribers.length ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[650px] text-sm">
            <thead className="bg-background-secondary text-right text-xs text-muted">
              <tr><th className="p-3">{fa ? "ایمیل" : "E-mail"}</th><th className="p-3">{fa ? "وضعیت" : "Status"}</th><th className="p-3">{fa ? "زبان" : "Locale"}</th><th className="p-3">{fa ? "تاریخ عضویت" : "Subscribed"}</th><th className="p-3">{fa ? "رضایت" : "Consent"}</th><th className="p-3">{fa ? "عملیات" : "Actions"}</th></tr>
            </thead>
            <tbody>
              {subscribers.map((subscriber) => (
                <tr key={subscriber.email} className="border-t border-border">
                  <td className="p-3" dir="ltr">{subscriber.email}</td>
                  <td className="p-3"><Badge tone={subscriber.status === "active" ? "success" : "neutral"}>{subscriber.status === "active" ? (fa ? "فعال" : "Active") : (fa ? "لغوشده" : "Unsubscribed")}</Badge></td>
                  <td className="p-3">{subscriber.locale.toUpperCase()}</td>
                  <td className="p-3 text-muted">{dateLabel(subscriber.createdAt)}</td>
                  <td className="p-3 text-muted">{dateLabel(subscriber.consentAt)}</td>
                  <td className="p-3">{subscriber.status === "active" && <Button variant="ghost" size="sm" disabled={busyId === subscriber.email} onClick={() => void updateStatus({ kind: "newsletter", email: subscriber.email, status: "unsubscribed" })}>{fa ? "لغو عضویت" : "Unsubscribe"}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty kind="newsletter" fa={fa} />}
    </div>
  );
}

function Empty({ kind, fa }: { kind: Kind; fa: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-white p-10 text-center">
      <MessageSquareText className="mx-auto h-8 w-8 text-muted" />
      <p className="mt-3 font-medium">{kind === "contact" ? (fa ? "درخواستی ثبت نشده است." : "No contact requests yet.") : (fa ? "هنوز مشترکی ثبت نشده است." : "No subscribers yet.")}</p>
    </div>
  );
}
