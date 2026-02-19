---
name: pr-status-triage
description: >
  Triage CI failures and PR review comments using scripts/pr-status.js.
  Use when investigating failing CI jobs, flaky tests, or PR review feedback.
  Covers blocker-first prioritization (build > lint > types > tests),
  CI env var matching for local reproduction, and the Known Flaky Tests
  distinction.
---

# PR Status Triage

Use this skill when the user asks about PR status, CI failures, or review comments in the Next.js monorepo.

## Workflow

1. Run `node scripts/pr-status.js` (or `node scripts/pr-status.js <number>`).
2. Read generated files in `scripts/pr-status/`.
3. Prioritize blocking jobs first: build, lint, types, then test jobs.
4. Treat failures as real until disproven; check the "Known Flaky Tests" section before calling anything flaky.
5. Reproduce locally with the same mode and env vars as CI.

## Quick Commands

```bash
node scripts/pr-status.js
node scripts/pr-status.js <number>
```

## Detailed References

- [workflow.md](./workflow.md) - prioritization and common failure patterns
- [local-repro.md](./local-repro.md) - mode/env matching and isolation guidance
