# Eval authoring

Do not export evals with `"publish": false` to `next-evals-oss` or publish their
results on nextjs.org/evals.

Existing `evals/evals/agent-*` fixtures use `@vercel/agent-eval` and stay in
that format. Classify each actively measured fixture in exactly one lifecycle
group: new or unresolved fixtures start in audit, verified capability
separators move to competency, and tasks with at least 90% valid pass@1 across
frontier and weaker models over multiple runs or versions move to regression.

Author new harder tasks under `evals/harder/tasks/` using the task format
described in `evals/harder/README.md`. Treat partner tasks and tasks derived
from agent feedback as candidates until their task contract, environment,
solution, tests, and verifier have been reviewed and a fixed frontier/weaker
pass@1 calibration has been inspected. Discard and retry infrastructure
failures; never turn them into model failures.

Keep harder-eval candidates unpublished until their public, private, or held-out
status is explicitly decided. Do not copy verifier-only material into agent
context or migrate existing agent-eval fixtures as part of unrelated work.
