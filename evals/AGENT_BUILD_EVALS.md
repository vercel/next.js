# Curate Next.js Agent Build evals

Agent Build evals measure whether an agent can make a correct Next.js code change on work that still separates model capability. Tasks live in `evals/agent-build` in the Harbor task format. The existing `agent-eval` fixtures in `evals/evals` keep running the `regression` and `competency` suites and keep their published history; new tasks do not enter that pipeline, and the `regression`, `competency`, and `audit` labels do not apply to them.

This directory owns the Next.js task definitions and grading contracts. The scripts in `evals/agent-build/tools` are temporary pilot adapters for validating and calibrating these first tasks. Shared execution, credentials, budgets, evidence, and reporting belong in the Vercel-owned eval layer built from Vercel Bench and Harbor; landing a task here does not establish that platform contract or promise that the task will move there unchanged.

See [Run Agent Build evals](./RUN_AGENT_BUILD_EVALS.md) for the runner, credentials, and local validation.

## Add a task

Every task goes through the same steps: find a capability, build it around a decision, write a short instruction, grade behavior, validate the grader, then calibrate. A task that skips a step is not ready for review.

### 1. Find a capability

Look for work where agents fail on real applications, in this order:

- **Agent Feedback reports** in the Maintainer Agent store. Read the reports behind a finding, not the cluster summary: they say what the agent tried, what the overlay suggested, and what finally worked.
- **Competency tasks that still separate models** (`evals/eval.suites.json`). A harder variant of a capability where weaker models already fail is a better bet than a new topic.
- **GitHub issues and merged pull requests** that change how an application has to be written, such as a new API, a migration, or a behavior change. A merged change gives a realistic starting point and a known-good result, which is how SelfBench builds its tasks. Grade the behavior the change produces, not the tests that came with it: tests written for one patch import its files and mock its functions, so a correct repair with another structure fails.

Search `evals/evals/*/PROMPT.md` and `EVAL.ts` first; a larger fixture for a capability the suite already measures is not a harder eval.

Route other questions to the measurement that owns them:

| Question                                                        | Measurement        |
| --------------------------------------------------------------- | ------------------ |
| Can the agent produce a correct Next.js change?                 | Agent Build        |
| Does the agent discover and choose Next.js?                     | Product choice     |
| Can the agent authenticate, deploy, and use a live application? | Agent Journey      |
| What changed in cost, speed, or shipped output?                 | Performance        |
| Did bundled docs, `AGENTS.md`, or a Skill improve the task?     | Context experiment |

### 2. Build the task around a decision, not an error message

A task that an agent can solve from the build error alone does not separate models; every frontier model passes it on the first attempt. The agent-feedback reports show where agents fail: an error page lists several fixes, the agent applies the first one everywhere, and the build goes green while a requirement breaks.

A hard task puts several sites of the same error in one realistic app, gives each site a different correct fix, and makes the wrong fix fail a requirement the error message never mentions. `prerender-unstable-values` has four `Date.now()` sites behind one error: cache the footer year, capture the fetch time inside the cached function it describes, defer the client clock behind a deterministic fallback, and keep a vendored SDK's clock read out of the prerender. `await connection()` at every site builds and fails.

### 3. Write a short instruction

Follow Harbor's [instruction guidance](https://docs.harborframework.com/tasks/instruction): concise, with clear outcomes. Write it as the user would report it: the symptom, the goal, and only the constraints a user would actually state, such as not editing a vendored SDK or not changing dependencies. Never list the checks, and never name the API or the patch. The approved competency prompts are 20 to 50 words. The first versions of our two pilots were checklists of over 250 words, and every model passed them.

Before implementing, record in `task.toml` the capability, the evidence that it matters, and the owner, and decide whether the task must be held out from model training. The reference repair is not the only accepted answer; the verifier must accept any repair that meets the instruction.

Context treatments such as `AGENTS.md` or a Skill are optional and belong to the runner, not the task. A treatment may add context files but must leave the instruction, application, verifier, model, and runtime unchanged, and a treatment result never moves a task in or out of the curated set.

### 4. Grade behavior

Use the first row that can prove the requirement, and stop there:

| Check                                    | Use when                                                      | Example                                             |
| ---------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Tests on files, build output, HTTP, logs | The outcome is observable                                     | Prerendered shell contents, status codes, log lines |
| Scripted browser                         | It needs a browser and we wrote the page                      | `instant()` navigation, filtering through the URL   |
| QA agent in a browser                    | The agent's build decides what the UI looks like              | "Add login and deploy it"                           |
| Judge model with a written rubric        | A semantic requirement none of the above can express          | "details wait for navigation behind a boundary"     |
| Trajectory review                        | Detecting shortcuts or a broken task; never part of the score | Editing tests, hard-coding answers, reading graders |

A judge grades only the criteria that need it, on top of every deterministic gate. Pin the model, commit the rubric, report its result as its own labeled number in `reward.json` rather than folding it into the pass, and spot-check its verdicts until its accuracy is known. The current tasks have no judge because every requirement in them is observable; that is a property of these tasks, not a rule for the suite. Harbor's `harbor-rewardkit` is the supported way to add one.

Source checks cover only the constraints the instruction states and behavior cannot show, such as an unchanged vendored SDK or dependency set. Do not ban an opt-out in the source; make the behavior it breaks fail.

#### Grading lessons

Each of these let a wrong repair through until the check changed:

- **A live response is not the static shell.** Playwright's `request` fixture returns the whole streamed document. Read the prerendered HTML the build wrote under `.next/server/app/<route>.html`, and treat a missing file as "no shell".
- **Strip React's comment nodes first.** `© {year} Pulse` renders as `© <!-- -->2026<!-- --> Pulse`.
- **Read the production server log.** Some unstable-value reads report only at request time, after a green build. Exercise document, RSC, and prefetch requests, then fail on `while prerendering`, `unstable value`, or `Could not validate`.
- **Use two identities.** Isolation needs a second user whose data must not appear and an expired session that must see nothing.
- **Disable redirects when checking status codes.** A streamed redirect is a 200 with the redirect inside the body.
- **Pin vendored dependencies.** Compare `lib/vendor/*` with the git baseline so the agent cannot edit the library instead of working around it.
- **Compare timestamps with the prerendered value.** Two requests within one second produce the same second-resolution stamp.
- **State the dependency policy in the instruction and enforce it first.** The verifier has no network and installs the committed lockfile, so an agent that adds a dev dependency to write its own tests fails `tsc` for a reason it was never told. Say so in the instruction and fail dependency changes in the source check with that message, before any other gate.

### 5. Validate the grader

Prove the task measures its contract before reading any model result:

1. `harbor lint --select ALL` passes.
2. The untouched fixture scores 0 for the intended reason.
3. The reference repair scores 1.
4. Every script in `tests/bad-solutions/` scores 0 at the check its header names.
5. A framework owner reviews the prompt and verifier together.

`tests/bad-solutions/` holds one script per shortcut the error page or the feedback reports show agents taking, each starting from the reference files and changing one decision. They are the grader's test suite: a bad repair that scores 1 means the grader is wrong, and an untouched fixture that scores 1 means the task is wrong.

### 6. Calibrate

Run a fixed frontier and weaker-model cohort with `evals/agent-build/tools/calibrate.sh`. The first valid attempt is the pass@1 score. Retry setup, image, sandbox, network, and model transport errors; they are not model failures. Rerun a scored failure to learn whether it is stable, and record that separately. Confirmations never change the score. One cohort is directional; repeated independent runs are needed before publishing a stable rate.

Calibration decides whether a candidate belongs in this harder-task set. Keep it when valid attempts expose repeatable capability failures in the intended cohort. Revise it when failures come from the task, verifier, runner, or infrastructure. Remove it from this set when the intended cohort consistently solves it; the working bar is frontier models below 90% valid pass@1, the same line that separates `regression` from `competency` in `evals/README.md`. Removal does not reclassify or move the task into another suite; any separate regression coverage is an independent decision in its own format and change.

Public tasks support review and reproducibility. A leakage-resistant headline score needs independently authored private sibling instances in an approved dataset, with exposed instances rotated out. Adding a task here does not publish its scores on nextjs.org/evals; that is a separate decision.

## Pull request format

Title starts with `eval:` and names the outcome. Keep the description short
and in the same shape as other Next.js pull requests:

1. **Summary**: what the change adds and what calibration found, in plain
   sentences. Then one bullet per task saying what the agent has to get right.
   No suite label; a task that proves too easy is removed, not relabeled.
2. **Results**: one line with the Next.js version, attempt policy, and
   treatments, the table and chart from
   `node evals/agent-build/tools/report.mjs <jobs-dir> <task ...>`,
   and a few sentences on what it means: which failures are real, and whether
   a task separates models or is saturated. Say "still running" or "not run"
   rather than leaving the section out.
3. **Verification**: a short list covering lint, untouched and reference
   scores, known-bad solutions rejected, and formatting.

Bump the `version` in `task.toml` whenever the instruction, fixture, or
verifier changes, so older trials are never compared with newer ones.
