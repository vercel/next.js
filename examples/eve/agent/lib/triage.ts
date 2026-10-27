import { z } from "zod";

export const CATEGORIES = ["bug", "feature", "docs", "maintenance"] as const;
export const PRIORITIES = ["high", "normal", "low"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];

/** Decisions below this confidence escalate to the reviewer subagent. */
export const CONFIDENCE_THRESHOLD = 0.7;

export const DECISION_MODEL = "openai/gpt-6-luna-decisions";

export type Issue = {
  number: number;
  title: string;
  body: string;
};

/** What the decision model returns for one issue. */
export type Decision = {
  category: Category;
  priority: Priority;
  /** The weaker of the two answers' top probability, from 0 to 1. */
  confidence: number;
};

/** What the reviewer subagent returns for one issue. */
export const Review = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  summary: z.string().min(1).max(240),
});
export type Review = z.infer<typeof Review>;

export type Row = {
  number: number;
  title: string;
  status: "decided" | "reviewing" | "reviewed" | "failed";
  category: Category;
  priority: Priority;
  confidence: number;
  summary?: string;
};

/** The shape triage_issues yields while it works and returns when it ends. */
export type TriageOutput = { issues: Row[] };
