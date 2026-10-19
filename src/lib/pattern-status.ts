import type { Pattern, PatternStatus } from "@/lib/types";

/**
 * Presentation metadata for the pattern review workflow.
 *
 * Shared by the artist dashboard (where a designer sees where their own work
 * stands) and the admin panel (where a reviewer decides the outcome), so both
 * surfaces always describe a status the same way.
 */
export interface PatternStatusMeta {
  label: { fa: string; en: string };
  tone: "neutral" | "accent" | "blue" | "success" | "warning" | "error" | "outline";
  /** True while the pattern is still waiting for a decision. */
  pending: boolean;
}

export const PATTERN_STATUS_META: Record<PatternStatus, PatternStatusMeta> = {
  draft: {
    label: { fa: "پیش‌نویس", en: "Draft" },
    tone: "outline",
    pending: false,
  },
  pending_review: {
    label: { fa: "در انتظار بررسی", en: "Pending review" },
    tone: "warning",
    pending: true,
  },
  published: {
    label: { fa: "منتشرشده", en: "Published" },
    tone: "success",
    pending: false,
  },
  rejected: {
    label: { fa: "ردشده", en: "Rejected" },
    tone: "error",
    pending: false,
  },
};

/** The state a pattern starts in when an artist submits it for review. */
export const INITIAL_PATTERN_STATUS: PatternStatus = "pending_review";

export function patternStatusMeta(status: PatternStatus | undefined): PatternStatusMeta {
  return PATTERN_STATUS_META[status ?? "published"];
}

/**
 * Add the backward-compatible default to pre-workflow records.
 *
 * This is deliberately additive and idempotent: legacy patterns stay live as
 * "published", while every explicit review decision is left untouched.
 */
export function backfillLegacyPatternStatuses(patterns: Pattern[]): Pattern[] {
  return patterns.map((pattern) => pattern.status
    ? pattern
    : { ...pattern, status: "published" });
}
