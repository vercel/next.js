# Curate Next.js Agent Build evals

Next.js Agent Build candidates measure real framework work that still separates model capability after the existing suite has saturated. New tasks use Harbor today, while their capability and grading contract stays independent from the runner so the set can move to the planned shared eval system.

The existing `agent-eval` fixtures remain in `evals/evals`. They preserve the published history on nextjs.org/evals and continue to run the `regression` and `competency` suites. New candidates live in `evals/agent-build` and do not enter that publication pipeline.

See [Run Agent Build evals](./RUN_AGENT_BUILD_EVALS.md) for the current Harbor and Vercel Sandbox setup.

## Decide whether to retain a candidate

A new task is a candidate until repeated calibration proves otherwise. Complexity alone does not make a task hard.

Use valid pass@1 results from a fixed frontier and weaker-model cohort:

- Retain a candidate when frontier models stay below 90% because of repeatable capability failures.
- Revise or drop a candidate when failures come from the task, verifier, runner, or infrastructure.
- Remove a candidate from the curated set when repeated runs show that frontier models have saturated it. A future regression guard is a separate decision.
- Treat weaker-model separation as supporting evidence. It does not make a frontier-saturated task suitable for the curated set.

One model cohort provides directional evidence. Admission to the curated Agent Build set needs repeated independent runs, confirmation that scored failures are real, and review by the framework owner.

The `regression`, `competency`, and `audit` labels apply only to the existing `agent-eval` tasks. Do not assign those labels to new tasks in `evals/agent-build` or add new tasks to the legacy publication pipeline.

## Choose a capability

Use an Agent Build eval when an agent must make a correct Next.js code change. Start with behavior observed in real work, including repeated agent feedback, framework migrations, release changes, and fixes from real applications.

Route other questions to the measurement that owns them:

| Question                                                        | Measurement        |
| --------------------------------------------------------------- | ------------------ |
| Can the agent produce a correct Next.js change?                 | Agent Build        |
| Does the agent discover and choose Next.js?                     | Product choice     |
| Can the agent authenticate, deploy, and use a live application? | Agent Journey      |
| What changed in cost, speed, or shipped output?                 | Performance        |
| Did bundled docs, `AGENTS.md`, or a Skill improve the task?     | Context experiment |

Before writing the task, record:

1. The capability and evidence that it matters
2. A prompt that describes the goal without naming the solution
3. The broken starting application and exact Next.js version
4. Behavioral checks that allow more than one correct implementation
5. A reference solution and representative incorrect solutions
6. An owner and the change that should trigger a review
7. Whether the task must be held out from model training

## Keep the task contract portable

Each task needs five independent parts:

1. The instruction the agent receives
2. The broken starting application
3. One reference repair for oracle validation
4. A hidden verifier that grades behavior and safety constraints
5. Runtime, isolation, resource, version, and provenance metadata

The reference repair proves that the task is solvable. It does not define the only accepted implementation. The verifier must accept reasonable alternative repairs that satisfy the stated contract.

Harbor is the current interchange format for these parts. Keep runner commands, credential setup, and Vercel-specific workarounds in [Run Agent Build evals](./RUN_AGENT_BUILD_EVALS.md) so the contract can be translated without changing what a task measures.

## Prevent contamination

A verifier can be hidden from the agent during a run while still being public to future model training. Public tasks provide reproducible examples and may support future regression checks, but they cannot support a leakage-resistant headline score on their own.

When resistance to training contamination matters, create multiple meaningful instances of the same capability. Keep scoring prompts, fixtures, reference solutions, and verifiers in an approved private dataset. Publish the capability definition and aggregate result, record when an instance becomes exposed, and rotate exposed instances out of the held-out score. Superficial renames do not create new instances.

The public tasks in `evals/agent-build` can validate the authoring workflow and seed task families. They enter a held-out score only through independently authored private sibling instances.

## Validate the task

Prove that the task measures its contract before interpreting model results:

1. Lint the task format.
2. Review the task against the runner's quality rubric.
3. Run the untouched fixture and confirm that it fails for the intended reason.
4. Run the reference repair and confirm that it passes.
5. Confirm that representative incorrect solutions fail.
6. Ask a framework owner to review the prompt and verifier together.

The prompt must state every behavior the verifier requires without revealing the implementation. The verifier must accept reasonable alternative solutions and check that unrelated behavior still works. Avoid exact symbols, patches, or error messages unless the prompt requires them.

Classify each failure as a task, verifier, runner, model, or infrastructure failure. Only valid model attempts contribute to the score.

## Calibrate and report

Run a fixed frontier and weaker-model cohort. Score the first valid attempt as pass@1. Retry setup, image, sandbox, network, and model transport errors. When a model fails, use confirmation attempts to understand whether the failure is stable. Confirmations do not change the first valid score.

One attempt per model provides directional evidence. Use repeated independent runs before claiming a stable pass rate or saturation. Keep the transcript, patch, verifier output, failure classification, token usage, cost, and duration with each result.

Start the pull request title with `eval:`. Keep its description focused on the measured capability and results. Use one table and link the complete job when available:

| Task | Agent and model | Passed / valid | Duration | Tokens | Cost | Job |
| ---- | --------------- | -------------- | -------- | ------ | ---- | --- |

State the Next.js, runner, agent, and model versions, the attempt count, and the verifier used. Call single-attempt results directional. List discarded infrastructure attempts and confirmation runs below the table without changing the scored result.

Adding a task to `evals/agent-build` does not publish its scores on nextjs.org/evals. Score publication requires a separate decision after the team reviews the task, evidence, ownership, and maintenance cost.
