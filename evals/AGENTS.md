# Evals

This directory holds two kinds of evals, defined in `evals/README.md`:

- `agent-eval` fixtures in `evals/evals`, documented in `evals/README.md`.
  Keep them running. They carry the published history.
- Agent Build tasks in `evals/agent-build`, in Harbor format. Start from
  `evals/agent-build/README.md`, which links to how to create, format, and run
  them. They never join the `agent-eval` suites or their labels.

Rules for every eval change:

- Title the pull request `eval:` and follow the description format in
  `evals/agent-build/CREATE.md`, with the Results section from
  `evals/agent-build/tools/report.mjs` pasted unchanged.
- Do not export fixtures with `"publish": false` to `next-evals-oss` or publish
  their results on nextjs.org/evals. Publishing Agent Build scores is a
  separate decision.
