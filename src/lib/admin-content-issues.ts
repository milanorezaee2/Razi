export interface ContentRelationIssueSummary {
  path: string;
}

function relationPathList(issues: readonly ContentRelationIssueSummary[], locale: "fa" | "en"): string {
  const paths = [...new Set(issues.map((issue) => issue.path).filter(Boolean))];
  if (!paths.length) return locale === "fa" ? "ارجاع‌های محتوای وابسته" : "the related content references";

  const visible = paths.slice(0, 3);
  const remaining = paths.length - visible.length;
  const suffix = remaining
    ? locale === "fa" ? ` و ${remaining} ارجاع دیگر` : ` and ${remaining} more reference${remaining === 1 ? "" : "s"}`
    : "";
  return `${visible.join(locale === "fa" ? "، " : ", ")}${suffix}`;
}

/** Format a concise, actionable message for a blocked deletion. */
export function formatInvalidContentRelationsMessage(
  issues: readonly ContentRelationIssueSummary[] = [],
  locale: "fa" | "en" = "fa",
): string {
  return locale === "fa"
    ? `حذف ممکن نیست؛ ابتدا ارجاع‌های محتوا را اصلاح کنید: ${relationPathList(issues, locale)}.`
    : `Deletion blocked; fix these content references first: ${relationPathList(issues, locale)}.`;
}

/** Format a concise, actionable message for a rejected content save/reset. */
export function formatInvalidContentWriteMessage(
  issues: readonly ContentRelationIssueSummary[] = [],
  locale: "fa" | "en" = "fa",
): string {
  return locale === "fa"
    ? `ذخیره انجام نشد؛ ابتدا ارجاع‌های محتوا را اصلاح کنید: ${relationPathList(issues, locale)}.`
    : `Changes were not saved; fix these content references first: ${relationPathList(issues, locale)}.`;
}
