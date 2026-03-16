---
name: pr-status-triage
description: >
  Triage CI failures and PR review comments using scripts/pr-status.js.
  Use when investigating failing CI jobs, flaky tests, or PR review feedback.
---

# PR Status Triage

Use this skill when the user asks about PR status, CI failures, or review comments in the Next.js monorepo.

## Workflow

### Step 1 — Start the background script

Run the script with `--wait` in the background (timeout ~1 minute):

```bash
node scripts/pr-status.js [PR_NUMBER] --wait
```

The script writes an initial partial report immediately, then waits for CI to complete and re-runs the full analysis. Record the task ID for step 9.

### Step 2 — Read the initial report

Poll until `Output written to` appears in the background task output, then read `scripts/pr-status/index.md`. It lists failing jobs, PR reviews, and inline review comments with links to detail files. Some jobs may be missing if CI is still in progress.

### Step 3 — Analyze CI failures with subagents

Spawn parallel haiku subagents (3–4 max) to analyze the `job-{id}.md` files. See [workflow.md](./workflow.md) for the subagent prompt template. Each subagent should return findings grouped by **test file**, not by job.

### Step 4 — Analyze review comments with subagents

If review threads exist, spawn parallel haiku subagents to analyze `thread-{i}.md` and `review-{id}.md` files. See [workflow.md](./workflow.md) for the subagent prompt template.

### Step 5 — Deduplicate by test file

Group all failures by test file path (not by CI job name). If multiple jobs fail the same test file, count them but report once. Flag systemic issues (same test failing across many jobs).

### Step 6 — Present summary tables

Present two tables: CI failures grouped by test file, and review feedback grouped by file. See [workflow.md](./workflow.md) for table format examples.

### Step 7 — Recommend fixes with priority

- **HIGH**: Blocker review comments; assertion/routing/build failures — show exact expected vs received.
- **MEDIUM**: Open suggestions; identifiable root cause patterns.
- **LOW**: Likely flaky/transient; resolved or nitpick comments.

Do not fix failures or address review comments without user confirmation. If there are multiple complex problems, do basic analysis only and note that deeper investigation is available on request.

### Step 8 — Check flaky tests

Check the **"Known Flaky Tests"** section in `index.md`. Tests listed there also fail on main — mark them as **FLAKY (pre-existing)** in the summary, but treat this as context, not automatic dismissal. Use `--skip-flaky-check` if the check is too slow.

### Step 9 — Poll for final report

After presenting the partial analysis, poll the background task from step 1 (long timeout). If CI completes:

- Re-read `scripts/pr-status/index.md` and compare with the partial report.
- Spawn haiku subagents to analyze any newly failed jobs (same template as step 3).
- Present an updated summary.

If the poll times out, CI is still running — inform the user and poll again later.

## Quick Commands

```bash
node scripts/pr-status.js                  # current branch PR
node scripts/pr-status.js <number>         # specific PR
node scripts/pr-status.js [PR] --wait      # background mode, waits for CI to finish
node scripts/pr-status.js --skip-flaky-check  # skip flaky test detection
```

## References

- [workflow.md](./workflow.md) — prioritization, subagent prompt templates, failure/review categories, common patterns, resolving review threads
- [local-repro.md](./local-repro.md) — mode/env matching and isolation guidance
