import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { decideIssues } from "../lib/decide";
import { loadIssues } from "../lib/issues";
import {
  CONFIDENCE_THRESHOLD,
  Review,
  type Row,
  type TriageOutput,
} from "../lib/triage";

export default defineWorkflowTool({
  description:
    "Triage the open issues: give every issue a category and a priority, and return the results.",
  inputSchema: z.object({}),
  async *execute(_input, ctx): AsyncGenerator<TriageOutput, TriageOutput> {
    "use workflow";
    const issues = await loadIssues();

    // A decision model answers for every issue in one fast step.
    const decisions = await decideIssues(issues, ctx.abortSignal);
    let rows: Row[] = issues.map((issue, index) => ({
      number: issue.number,
      title: issue.title,
      ...decisions[index],
      status:
        decisions[index].confidence >= CONFIDENCE_THRESHOLD
          ? "decided"
          : "reviewing",
    }));
    yield { issues: rows };

    // Only the unsure issues go to the reviewer, one fresh session each.
    const unsure = issues.filter(
      (_issue, index) => rows[index].status === "reviewing",
    );
    const reviews = await Promise.all(
      unsure.map(async (issue) => {
        const turn = await ctx.agent("reviewer").send(JSON.stringify(issue), {
          outputSchema: Review,
          signal: ctx.abortSignal,
        });
        const parsed = Review.safeParse((await turn.result()).data);
        return {
          number: issue.number,
          review: parsed.success ? parsed.data : undefined,
        };
      }),
    );

    rows = rows.map((row): Row => {
      const reviewed = reviews.find(({ number }) => number === row.number);
      if (!reviewed) return row;
      return reviewed.review
        ? { ...row, ...reviewed.review, status: "reviewed" }
        : { ...row, status: "failed" };
    });
    return { issues: rows };
  },
});
