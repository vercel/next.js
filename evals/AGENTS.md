# Harder eval authoring and publication

Follow `evals/HARDER_EVALS.md` when adding or reclassifying a harder eval. Every
candidate must measure an agent-solvable Next.js capability and appear in
exactly one lifecycle suite. New and unresolved candidates start in `audit`
with `"publish": false`.

Use the first valid attempt as pass@1. Discard and retry infrastructure
failures. Confirmation attempts may explain a model failure, but must not
change its score. Record the framework, task, runner, agent, model, and
treatment revisions needed to reproduce a result.

Keep framework preference, end-to-end deployment journeys, and performance
measurements in the systems that own those questions. Do not approximate them
with an Agent Build fixture.

Do not export evals with `"publish": false` to `next-evals-oss` or publish their
results on nextjs.org/evals.
