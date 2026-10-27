# Curate Next.js Agent Build evals

Agent Build evals measure whether an agent can make a correct Next.js code change on work that still separates model capability. Tasks live in `evals/agent-build` in the Harbor task format; the grading contract is independent of the runner so the set can move to the shared `vercel/evals` repository unchanged. The existing `agent-eval` fixtures in `evals/evals` keep running the `regression` and `competency` suites and keep their published history; new tasks do not enter that pipeline, and the `regression`, `competency`, and `audit` labels do not apply to them.

See [Run Agent Build evals](./RUN_AGENT_BUILD_EVALS.md) for the runner, credentials, and local validation.

## Choose a capability

Start from observed agent behavior: repeated agent feedback, migrations, release changes, and fixes from real applications. Search `evals/evals/*/PROMPT.md` and `EVAL.ts` first; a bigger fixture for a capability the suite already measures is not a harder eval.

Route other questions to the measurement that owns them:

| Question                                                        | Measurement        |
| --------------------------------------------------------------- | ------------------ |
| Can the agent produce a correct Next.js change?                 | Agent Build        |
| Does the agent discover and choose Next.js?                     | Product choice     |
| Can the agent authenticate, deploy, and use a live application? | Agent Journey      |
| What changed in cost, speed, or shipped output?                 | Performance        |
| Did bundled docs, `AGENTS.md`, or a Skill improve the task?     | Context experiment |

### Build the task around a decision, not an error message

A task that an agent can solve from the build error alone does not separate models; every frontier model passes it on the first attempt. The agent-feedback reports show where agents fail: an error page lists several fixes, the agent applies the first one everywhere, and the build goes green while a requirement breaks.

A hard task puts several sites of the same error in one realistic app, gives each site a different correct fix, and makes the wrong fix fail a requirement the error message never mentions. `prerender-unstable-values` has four `Date.now()` sites behind one error: cache the footer year, capture the fetch time inside the cached function it describes, defer the client clock behind a deterministic fallback, and keep a vendored SDK's clock read out of the prerender. `await connection()` at every site builds and fails.

Read the reports behind a finding in the Maintainer Agent store, not the cluster summary. They say what the agent tried, what the overlay suggested, and what finally worked. The task should make the first two fail.

## Define the task

Each task has five independent parts: the instruction the agent receives, the broken starting application at an exact Next.js version, one reference repair that proves the task is solvable, a hidden verifier that grades behavior and safety constraints, and runtime and provenance metadata. The reference repair is not the only accepted answer; the verifier must accept any repair that meets the stated contract.

Before implementing, record the capability and the evidence that it matters, the owner and the change that should trigger a review, and whether the task must be held out from model training. Write the prompt as the user would: the goal and every behavior the verifier requires, never the API or the patch.

Context treatments such as `AGENTS.md` or a Skill are optional and belong to the runner, not the task. A treatment may add context files but must leave the instruction, application, verifier, model, and runtime unchanged, and a treatment result never moves a task in or out of the curated set.

## Validate before calibrating

Prove the task measures its contract before reading any model result:

1. `harbor lint --select ALL` passes.
2. The untouched fixture scores 0 for the intended reason.
3. The reference repair scores 1.
4. Every script in `tests/bad-solutions/` scores 0 at the check its header names.
5. A framework owner reviews the prompt and verifier together.

`tests/bad-solutions/` holds one script per shortcut the error page or the feedback reports show agents taking, each starting from the reference files and changing one decision. They are the grader's test suite: a bad repair that scores 1 means the grader is wrong, and an untouched fixture that scores 1 means the task is wrong.

### Choose the kind of check

Use the first row that can prove the requirement, and stop there:

| Check                                    | Use when                                                      | Example                                             |
| ---------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Tests on files, build output, HTTP, logs | The outcome is observable                                     | Prerendered shell contents, status codes, log lines |
| Scripted browser                         | It needs a browser and we wrote the page                      | `instant()` navigation, filtering through the URL   |
| QA agent in a browser                    | The agent's build decides what the UI looks like              | "Add login and deploy it"                           |
| Judge model with a written rubric        | A semantic requirement none of the above can express          | "details wait for navigation behind a boundary"     |
| Trajectory review                        | Detecting shortcuts or a broken task; never part of the score | Editing tests, hard-coding answers, reading graders |

A judge grades only the criteria that need it, on top of every deterministic gate. Pin the model, commit the rubric, report its result as its own labeled number in `reward.json` rather than folding it into the pass, and spot-check its verdicts until its accuracy is known. The current tasks have no judge because every requirement in them is observable; that is a property of these tasks, not a rule for the suite. Harbor's `harbor-rewardkit` is the supported way to add one.

### Grade what the error message cannot tell the agent

Each of these let a wrong repair through until the check changed:

- **A live response is not the static shell.** Playwright's `request` fixture returns the whole streamed document. Read the prerendered HTML the build wrote under `.next/server/app/<route>.html`, and treat a missing file as "no shell".
- **Strip React's comment nodes first.** `© {year} Pulse` renders as `© <!-- -->2026<!-- --> Pulse`.
- **Read the production server log.** Some unstable-value reads report only at request time, after a green build. Exercise document, RSC, and prefetch requests, then fail on `while prerendering`, `unstable value`, or `Could not validate`.
- **Use two identities.** Isolation needs a second user whose data must not appear and an expired session that must see nothing.
- **Disable redirects when checking status codes.** A streamed redirect is a 200 with the redirect inside the body.
- **Pin vendored dependencies.** Compare `lib/vendor/*` with the git baseline so the agent cannot edit the library instead of working around it.
- **Compare timestamps with the prerendered value.** Two requests within one second produce the same second-resolution stamp.
- **State the dependency policy in the instruction and enforce it first.** The verifier has no network and installs the committed lockfile, so an agent that adds a dev dependency to write its own tests fails `tsc` for a reason it was never told. Say so in the instruction and reject dependency changes in the source check with that message, before any other gate.

## Calibrate

Run a fixed frontier and weaker-model cohort with `evals/agent-build/tools/calibrate.sh`. The first valid attempt is the pass@1 score. Retry setup, image, sandbox, network, and model transport errors; they are not model failures. Rerun a scored failure to learn whether it is stable, and record that separately. Confirmations never change the score. One cohort is directional; retention needs repeated independent runs.

Retain a task while frontier models stay below 90% because of repeatable capability failures. Revise or drop it when failures come from the task, verifier, runner, or infrastructure. Remove it from the curated set once frontier models saturate it; a regression guard is a separate decision. Weaker-model separation supports a decision but does not qualify a frontier-saturated task.

Public tasks support reproducibility and regression. A leakage-resistant headline score needs independently authored private sibling instances in an approved dataset, with exposed instances rotated out. Adding a task here does not publish its scores on nextjs.org/evals; that is a separate decision.

## Pull request format

Title starts with `eval:` and names the outcome. The description is short and
has the same four parts every time, so results read the same across pull
requests; see #100756 for the shape.

1. One sentence on what the change adds.
2. **Tasks**: a table of task, what the agent has to get right, and source
   findings. No suite label; a task that proves too easy is removed, not
   relabeled.
3. **Validation**: a table of untouched, reference, and known-bad results,
   then one line for lint and formatting.
4. **Calibration**: the grid and chart from
   `node evals/agent-build/tools/report.mjs <jobs-dir>`, with the framework
   version, Harbor revision, task version, and attempt policy on one line.
   Say "in progress" or "not run" rather than leaving it out.

Bump the `version` in `task.toml` whenever the instruction, fixture, or
verifier changes, so older trials are never compared with newer ones.
