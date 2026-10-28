# Curate Next.js Agent Build evals

Agent Build evals measure whether an agent can make a correct Next.js code change on work that still separates model capability. Tasks live in `evals/agent-build` in the Harbor task format. The existing `agent-eval` fixtures in `evals/evals` keep running the `regression` and `competency` suites and keep their published history; new tasks do not enter that pipeline, and the `regression`, `competency`, and `audit` labels do not apply to them.

This directory owns the Next.js task definitions and grading contracts. The scripts in `evals/agent-build/tools` are temporary pilot adapters for validating and calibrating these first tasks. Shared execution, credentials, budgets, evidence, and reporting belong in the Vercel-owned eval layer built from Vercel Bench and Harbor; landing a task here does not establish that platform contract or promise that the task will move there unchanged.

See [Run Agent Build evals](./RUN_AGENT_BUILD_EVALS.md) for the runner, credentials, and local validation.

## Add a task

Terminal-Bench, Harbor's own benchmark, publishes the bar these steps follow: its [task rubric](https://github.com/harbor-framework/terminal-bench/blob/main/docs/prompts/task-proposal.md) and [contribution guide](https://github.com/harbor-framework/terminal-bench/blob/main/CONTRIBUTING.md). Read both before writing a task; the steps below add only what is specific to Next.js.

Every task goes through the same steps: find a capability, build it around a decision, write a short instruction, screen a draft on two models, grade behavior, validate the grader, then calibrate and decide. Build the full grader only for drafts that pass the screen. A task that skips a step is not ready for review.

### 1. Find a capability

Look for work where agents fail on real applications, in this order:

- **Agent Feedback reports** in the Maintainer Agent store, especially the ones that ended in a wrong workaround. Read the reports behind a finding, not the cluster summary: they say what the agent was building, what it tried, and what it settled for.
- **Competency tasks that still separate models** (`evals/eval.suites.json`). A harder variant of a capability where weaker models already fail is a better bet than a new topic.
- **GitHub issues and merged pull requests** that change how an application has to be written, such as a new API, a migration, or a behavior change. A merged change gives a realistic starting point and a known-good result, which is how SelfBench builds its tasks. Grade the behavior the change produces, not the tests that came with it: tests written for one patch import its files and mock its functions, so a correct repair with another structure fails.

Difficulty comes from real work at real size. SWE-Bench Pro tasks take an engineer hours to days, with changes across several files in real repositories; a 15-file fixture that needs a 30-line change is easy to brute-force. Prefer a real open-source Next.js app at a pinned commit over a fixture written for the task. The `vercel/next-benchmarks` apps are adapted for performance runs, with stubbed pages and mock data, so they are not usable as they are.

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

Start from a working application and a feature request, not from a failing build. A build error names the route and the problem, so the agent can loop on `next build` until it is green; frontier and weaker models alike pass that, and the task measures error-following instead of the decision. Agent Feedback reports describe an error, but turn the report into the feature the user was building, not the broken state.

Put the decision where nothing warns the agent: content that has to stay in the static HTML, a cache lifetime that has to stay fresh, data that must not leak between users, navigation that has to stay instant. In the first pilots, every task that started from a failing build saturated, and every real failure came from a requirement like these: content deferred to the browser, a stale cache lifetime, a clock read only the production log reported. Let a build error appear only when the agent's own change causes it, and make the shortcuts the error page suggests fail one of those requirements.

### 3. Write a short instruction

Follow Harbor's [instruction guidance](https://docs.harborframework.com/tasks/instruction): concise, with clear outcomes. Write it as the user would report it: the symptom, the goal, and only the constraints a user would actually state, such as not editing a vendored SDK or not changing dependencies. Never list the checks, and never name the API or the patch. The instruction must still state everything the verifier checks, with nothing left to guess, including requirements a user would take for granted, such as a passing type check or an unchanged feature. The approved competency prompts are 20 to 50 words. A checklist of every requirement hands the agent the answer, and every model passes it.

Before implementing, record in `task.toml` the capability, the evidence that it matters, and the owner, and decide whether the task must be held out from model training. Each task's `README.md` has a **Difficulty explanation**, why the task is hard for agents and for which reports, and a **Verification explanation**, which gate checks what, as Terminal-Bench asks. The reference repair is not the only accepted answer; the verifier must accept any repair that meets the instruction.

### 4. Screen a draft on two models

Before writing the full grader, run the draft (instruction, fixture, reference repair, and a rough check) on one frontier and one weaker model, and read both transcripts. Build the task out only when a model fails for a capability reason, not because of the task or the check. A draft both models solve is dropped or reworked, not run on a full cohort. Benchmarks that stay hard select from many drafts this way: Terminal-Bench 2.0 kept 89 of 229 contributed tasks after running models on each.

### 5. Grade behavior

Use the first row that can prove the requirement, and stop there:

| Check                                    | Use when                                                      | Example                                             |
| ---------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Tests on files, build output, HTTP, logs | The outcome is observable                                     | Prerendered shell contents, status codes, log lines |
| Scripted browser                         | It needs a browser and we wrote the page                      | `instant()` navigation, filtering through the URL   |
| QA agent in a browser                    | The agent's build decides what the UI looks like              | "Add login and deploy it"                           |
| Judge model with a written rubric        | A semantic requirement none of the above can express          | "details wait for navigation behind a boundary"     |
| Trajectory review                        | Detecting shortcuts or a broken task; never part of the score | Editing tests, hard-coding answers, reading graders |

Terminal-Bench allows a model judge only in rare cases where it is shown to essentially never err, with a documented reason a program could not check the requirement. A judge grades only the criteria that need it, on top of every deterministic gate. Pin the model, commit the rubric, report its result as its own labeled number in `reward.json` rather than folding it into the pass, and spot-check its verdicts until its accuracy is known. The current tasks have no judge because every requirement in them is observable; that is a property of these tasks, not a rule for the suite. Harbor's `harbor-rewardkit` is the supported way to add one.

Source checks cover only the constraints the instruction states and behavior cannot show, such as an unchanged vendored SDK or dependency set. Do not ban an opt-out in the source; make the behavior it breaks fail.

#### Grading lessons

Read every failure before trusting it. In the first pilot runs, about six checks rejected correct repairs because they tested something the instruction did not state: exact title wording, server wording for live times, a start-time element in the static HTML, and markup around a value instead of its text. Fix the check, or state the requirement and bump the version, then regrade.

Each of these let a wrong repair through until the check changed:

- **A live response is not the static shell.** Playwright's `request` fixture returns the whole streamed document. Read the prerendered HTML the build wrote under `.next/server/app/<route>.html`, and treat a missing file as "no shell".
- **Compare visible text, not markup.** `© {year} Pulse` renders as `© <!-- -->2026<!-- --> Pulse`, a Suspense boundary leaves a `<template>` placeholder, and a correct repair may wrap the value in a `<span>` with an inline script. Strip scripts and tags and collapse whitespace before checking content, and read headings from the `<h1>` text.
- **Read the production server log.** Some unstable-value reads report only at request time, after a green build. Exercise document, RSC, and prefetch requests, then fail on `while prerendering`, `unstable value`, or `Could not validate`.
- **Use two identities.** Isolation needs a second user whose data must not appear and an expired session that must see nothing.
- **Disable redirects when checking status codes.** A streamed redirect is a 200 with the redirect inside the body.
- **Pin vendored dependencies.** Compare `lib/vendor/*` with the git baseline so the agent cannot edit the library instead of working around it.
- **Compare timestamps with the prerendered value.** Two requests within one second produce the same second-resolution stamp.
- **State the dependency policy in the instruction and enforce it first.** The verifier has no network and installs the committed lockfile, so an agent that adds a dev dependency to write its own tests fails `tsc` for a reason it was never told. Say so in the instruction and fail dependency changes in the source check with that message, before any other gate.

### 6. Validate the grader

Prove the task measures its contract before reading any model result:

1. `harbor lint --select ALL` passes.
2. The untouched fixture scores 0 for the intended reason.
3. The reference repair scores 1.
4. Every script in `tests/bad-solutions/` scores 0 at the check its header names.
5. The reference repair scores 1 on repeated runs. A verifier that flakes on a correct solution is wrong.
6. Correct solutions other than the reference score 1. Keep reviewed passing solutions from the screen and earlier runs as known-good cases, so the grader has to accept implementations shaped differently from yours.
7. A framework owner reviews the prompt and verifier together.

`tests/bad-solutions/` holds one script per shortcut the error page or the feedback reports show agents taking, each starting from the reference files and changing one decision. They are the grader's test suite: a bad repair that scores 1 means the grader is wrong, and an untouched fixture that scores 1 means the task is wrong.

### 7. Calibrate and decide

Run the task on a fixed cohort of frontier and weaker models with `evals/agent-build/tools/calibrate.sh`, then decide from the result:

1. **Score pass@1 only.** The first valid attempt is the score. Discard and rerun setup, image, sandbox, network, and model transport errors; an agent that runs out of time is a failure.
2. **Confirm failures.** Rerun each valid failure twice with `calibrate.sh --confirm` and record whether it repeats. Confirmations never change the score; they show whether a failure is stable.
3. **Read every failure** before trusting it, and fix the grader when the instruction did not ask for what it checks.
4. **Keep the task** only if all of these hold:
   - It represents a real user or agent failure.
   - More than one correct implementation is possible, and the verifier accepts them.
   - The verifier tests behavior, not the reference patch.
   - It separates models: frontier models below 90% valid pass@1, with failures that repeat.
   - The result is reproducible enough to maintain.
5. **Decide.** Accepted tasks join the harder suite. Revise or drop the rest. Saturated tasks stay in the existing regression suite; this step never migrates or redesigns them.

One cohort is directional; repeated independent runs are needed before publishing a stable rate. Prove a new task format with a few strong tasks before expanding a suite.

Public tasks support review and reproducibility. A leakage-resistant headline score needs independently authored private sibling instances in an approved dataset, with exposed instances rotated out. Adding a task here does not publish its scores on nextjs.org/evals; that is a separate decision.

## Context treatments

Context treatments such as `AGENTS.md` or a Skill are optional and belong to the runner, not the task. For Next.js, with and without `AGENTS.md` are two real user conditions, not docs versus no docs: `create-next-app` adds `AGENTS.md` by default, older apps usually lack it, and the bundled docs are in `node_modules/next/dist/docs` in both runs. The comparison measures whether pointing the agent at the docs changes the result; with `AGENTS.md` is the product claim, and without it shows how often agents find the docs on their own. A treatment may add context files but must leave the instruction, application, verifier, model, and runtime unchanged, and a treatment result never moves a task in or out of the curated set.

## Pull request format

Title starts with `eval:` and names the outcome. Keep the description short and in the same shape as other Next.js pull requests:

1. **Summary**: what the change adds and what calibration found, in plain sentences, then one bullet per task saying what the agent has to get right. No suite label; a task that proves too easy is removed, not relabeled.
2. **Results**: one line with the Next.js version, attempt policy, and treatments, then the output of `node evals/agent-build/tools/report.mjs <jobs-dir> <task ...>` unchanged: one table with a row for every cohort model, a base / AGENTS.md column per task, the totals (Base, + AGENTS.md, Delta), and price per million tokens, tokens, cost, and time per run, then pass@1 and cost per run as two bar charts. After it, a few sentences on which failures are real and whether a task separates models or is saturated. Say "still running" or "not run" rather than leaving the section out.
3. **Verification**: a short list covering lint, untouched and reference scores, known-bad and known-good results, and formatting.

Bump the `version` in `task.toml` whenever the instruction, fixture, or verifier changes, so older trials are never compared with newer ones.
