# Eval authoring and publication

Read `evals/README.md` before changing an existing `agent-eval` fixture. Read
`evals/EVAL_CURATION.md` before creating or reclassifying an eval.

Keep existing `agent-eval` fixtures operational. Use the Harbor task format for
new Agent Build evals. The existing fixtures use the `competency` and
`regression` suites. Do not place a new Harbor task in those suites during
authoring.

Run every new task during authoring. Keep, revise, or drop it based on the
validation and calibration evidence. New tasks start unpublished. Use the
first valid model attempt as pass@1. Discard infrastructure failures and retry
them. Confirmation attempts can explain a model failure, but they do not
change its score.

Record the framework, task, runner, agent, model, and treatment versions needed
to reproduce each result. Keep product-choice studies, end-to-end deployment
journeys, and performance measurements in the systems that own them.

Do not export evals with `"publish": false` to `next-evals-oss` or publish their
results on nextjs.org/evals.
