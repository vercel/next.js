# Curating harder Next.js evals

Harder evals measure realistic Next.js work that current agents do not solve
reliably. They keep the competency suite useful as older tasks become
saturated.

Harder describes validated capability separation. It does not mean a longer
prompt, a larger repository, or a more complicated grader.

## Keep the measurement in scope

This suite measures Agent Build: whether an agent can produce a correct Next.js
change. Route other questions to the systems that own them:

| Question                                                               | Measurement        |
| ---------------------------------------------------------------------- | ------------------ |
| Does the agent discover and choose Next.js?                            | Product choice     |
| Can the agent authenticate, build, deploy, and use a real application? | Agent Journey      |
| What changed in cost, speed, or shipped output?                        | Performance        |
| Did bundled docs, `AGENTS.md`, or a Skill improve the same task?       | Context experiment |

A candidate belongs in the harder suite only when the agent has a valid action
to take and the result measures a Next.js capability.

## Find candidates

Start from observed behavior rather than an invented puzzle. Useful sources
include:

- recurring, reviewed agent failures;
- difficult framework changes, migrations, and release work;
- real repository tasks and merged fixes;
- repeated support or documentation gaps; and
- existing evals whose valid failures still separate model capability.

A source is evidence, not automatic admission. Route pure framework bugs to
framework regression tests, preference questions to product-choice studies,
and environment failures to the owning infrastructure.

## Define the task contract

Before implementation, establish:

1. the Next.js capability and why it matters;
2. a realistic prompt that states the user's goal without naming the solution;
3. a reproducible starting application and framework version;
4. deterministic checks for the requested behavior rather than one preferred
   patch;
5. a reference solution and representative incorrect solutions used to review
   the grader;
6. the expected runtime, cost, owner, and maintenance trigger; and
7. whether the task and its results may be public or must remain held out.

Keep solutions, hidden checks, and verifier-only material out of the agent's
context. Keep the task contract independent from one runner so the task remains
portable.

## Validate the task

Prove that the task measures its contract before interpreting model results:

1. Confirm the starting fixture fails for the intended reason.
2. Confirm the reference solution passes.
3. Confirm representative incorrect solutions fail.
4. Ask a framework owner to review the expected behavior and grader.
5. Separate task, grader, harness, model, and infrastructure failures.

Do not call a task hard until its grader and framework version are valid.

## Calibrate capability separation

Run a fixed frontier and weaker-model cohort with recorded agent and model
versions. Score the first valid attempt as pass@1. Discard and retry
infrastructure failures. If a model fails, confirmation attempts may help
distinguish a stable capability gap from run-to-run variation, but they never
change the pass@1 score.

Retain the prompt, output, transcript, evaluator output, failure
classification, framework revision, task revision, runner, treatment, cost,
and duration for each result.

## Decide what enters the suite

Record one decision after review and calibration:

- **Keep:** the task has a valid grader, useful capability separation, known
  cost, and a maintainer. Add it to `competency`.
- **Fix:** the capability matters, but the prompt, fixture, grader, environment,
  or evidence needs another review cycle. Keep it in `audit` and unpublished.
- **Drop or reroute:** the task is redundant, invalid, impractical to maintain,
  or answers a different measurement question.

Tasks can move as models and Next.js change. Move a competency task to
`regression` after it reaches at least 90% valid pass@1 across frontier and
weaker models over multiple runs or framework versions.

## Set visibility and cadence

New harder tasks remain unpublished by default. Publish only after reviewing
the task contract, grader, calibration, ownership, and maintenance plan. Keep
private or held-out checks out of public fixtures and result artifacts.

Run the harder competency suite when Next.js, its tasks, agents, or models
change. Run saturated regression tasks through their cheaper, more frequent
cadence. Record policy changes such as pass@4 to pass@1 as a new measurement
baseline rather than one continuous score history.
