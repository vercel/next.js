# Eval authoring and publication

Read `evals/README.md` before changing an existing `agent-eval` fixture. Read
`evals/HARDER_EVALS.md` before creating a new Agent Build eval.

Keep existing `agent-eval` fixtures operational. They use the `competency` and
`regression` suites and preserve published history. Put new Agent Build
candidates in `evals/harder` using the Harbor task format. Do not add them to
the legacy suites or call them hard before repeated calibration shows stable
capability separation.

Run every new task during authoring. Verify that the untouched fixture fails,
the reference solution passes, and representative incorrect solutions fail.
Use the first valid model attempt as pass@1. Retry infrastructure failures.
Confirmation attempts can explain a model failure, but they do not change its
score.

Record the framework, task, runner, agent, and model versions needed to
reproduce each result. Keep product-choice studies, end-to-end deployment
journeys, and performance measurements in the systems that own them.

The `publish` setting applies only to existing `agent-eval` fixtures. Do not
export fixtures with `"publish": false` to `next-evals-oss` or publish their
results on nextjs.org/evals. Harbor tasks in `evals/harder` do not enter that
publication pipeline. Public task definitions are suitable for reproducibility
and regression. A leakage-resistant score requires independently authored
private sibling tasks, not merely a verifier hidden during the run.
