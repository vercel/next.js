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

Prefer capabilities the existing `agent-eval` fixtures do not already measure. Before writing a task, search `evals/evals/*/PROMPT.md` and `EVAL.ts` for the capability; a bigger fixture for a saturated capability is not a harder eval.

### Build tasks around a decision, not an error message

The first candidates in this directory were solvable from the build error alone: the Cache Components clock error and the `server-only` import error each name their fix, and every frontier model passed on the first attempt. The agent-feedback reports show a different failure. Agents read an error page with several branches, pick the branch the overlay lists first, and apply it everywhere. A hard task puts several sites of the same error in one realistic app so that each site needs a different branch, and makes the wrong branch fail a requirement the error message does not mention.

`prerender-unstable-values` is the pattern. Four clock reads trigger the same `blocking-prerender-current-time` error. The footer year must be cached so marketing pages stay static; the "checked at" time must be captured inside the cached data function it describes; the client relative time must be deferred behind a deterministic fallback; and a vendored SDK's clock read must be kept out of the prerender with `io()`, which only shows up in the production server log after the build is green. `await connection()` at every site builds, and fails.

`protected-routes-instant-scope` takes the same approach to `blocking-prerender-dynamic` and instant validation: the overlay suggests `instant = false`, the reports show agents adding it to every segment, and the task forbids it while requiring a real HTTP redirect for signed-out visitors and a prerendered frame for every workspace route.

To find these decisions, read the reports behind a cluster in the Maintainer Agent store, not the summary. The reports say what the agent tried, what the overlay suggested, and what finally worked; the task should make the first two fail.

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

## Keep context treatments optional

Calibrate every task against its base environment. Add a context treatment only when the run is measuring whether extra guidance changes the result.

Next.js can pair the base environment with an `AGENTS.md` treatment to measure the effect of its bundled documentation. Another framework may use no treatment, a Skill, or a different source of context. The Agent Build task format does not require any of them.

Define treatments in the suite or runner configuration instead of the task. A treatment may add context files, but it must keep the task instruction, starting application, verifier, model, and runtime unchanged. Record the treatment with each result so base and treated runs remain comparable.

Treatment results answer a separate question from task difficulty. A task does not enter or leave the curated set because one treatment helped it.

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

### Grade what the error message cannot tell the agent

Lessons from validating the first tasks, each of which let a wrong repair through until the check changed:

- **A live response is not the static shell.** Playwright's `request` fixture returns the whole streamed document, so a substring check passes whether the content was prerendered or streamed later. Read the prerendered HTML the build wrote under `.next/server/app/<route>.html` to prove what is in the shell, and treat a missing file as "this route has no shell".
- **Strip React's comment nodes before substring checks.** `© {year} Pulse` renders as `© <!-- -->2026<!-- --> Pulse`.
- **Read the server log.** Some unstable-value reads report only at request time, after a green build. Start the production server, exercise document, RSC, and prefetch requests, then fail the task if the log contains `while prerendering`, `unstable value`, or `Could not validate`.
- **Use two identities.** Isolation checks need a second user whose data must not appear, and an expired or invalid session that must see nothing.
- **Check the status code with redirects disabled.** A streamed redirect is a 200 with a redirect inside the body; uptime checks and non-browser clients only see the 200.
- **Pin the vendored dependency.** Compare `lib/vendor/*` against the git baseline so the agent cannot edit the library instead of working around it, which is the real-world constraint the reports describe.
- **Keep timestamp comparisons honest.** Two requests inside the same second produce the same second-resolution timestamp; compare against the prerendered value instead.

### Keep the known incorrect repairs

Every task ships `tests/bad-solutions/`: one script per shortcut the error page or the feedback reports show agents taking, each starting from the reference files and changing one decision, with a header naming the check that rejects it. They are the grader's test suite. When a bad repair scores 1, the grader is wrong, not the repair. When the untouched fixture scores 1, the task is wrong.

Classify each failure as a task, verifier, runner, model, or infrastructure failure. Only valid model attempts contribute to the score.

## Calibrate and report

Run a fixed frontier and weaker-model cohort. Score the first valid attempt as pass@1. Retry setup, image, sandbox, network, and model transport errors. When a model fails, use confirmation attempts to understand whether the failure is stable. Confirmations do not change the first valid score.

One attempt per model provides directional evidence. Use repeated independent runs before claiming a stable pass rate or saturation. Keep the transcript, patch, verifier output, failure classification, token usage, cost, and duration with each result.

Start the pull request title with `eval:`. Keep its description focused on the measured capability and results. Use one table and link the complete job when available:

| Task | Agent and model | Passed / valid | Duration | Tokens | Cost | Job |
| ---- | --------------- | -------------- | -------- | ------ | ---- | --- |

State the Next.js, runner, agent, and model versions, the attempt count, and the verifier used. Call single-attempt results directional. List discarded infrastructure attempts and confirmation runs below the table without changing the scored result.

Adding a task to `evals/agent-build` does not publish its scores on nextjs.org/evals. Score publication requires a separate decision after the team reviews the task, evidence, ownership, and maintenance cost.
