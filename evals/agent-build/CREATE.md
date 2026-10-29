# Create an Agent Build task

Create a task by drafting candidates in batches, screening them on two models, and building out only the ones that separate models. [Harbor format](./HARBOR.md) covers the files a task contains and the Harbor and Terminal-Bench rules it follows, and [Run tasks](./RUN.md) has the commands each step uses.

## Steps

Every task goes through the seven steps below, from finding a capability to calibrating and deciding. Build the full grader only for drafts that pass the screen. A task that skips a step is not ready for review.

### 1. Find a capability

Look for work where agents fail on real applications, in this order:

- **Agent Feedback reports** in the Maintainer Agent store, especially the ones that ended in a wrong workaround. Read the reports behind a finding rather than the cluster summary, because they say what the agent was building, what it tried, and what it settled for. Most reports, blocked ones included, describe framework bugs or tooling friction rather than agent mistakes, so confirm the problem still reproduces (step 4) before building on one.
- **Competency tasks that still separate models** (`evals/eval.suites.json`). A harder variant of a capability where weaker models already fail is a better bet than a new topic.
- **Error repros**, minimal apps that each trigger one framework error. Use a repro to find where the error lives, then write the feature request that leads an agent there. Never start the task from the error itself.
- **Quality problems real apps keep having**, which customer performance audits and support see repeatedly: raw `<img>` tags, whole pages rendered on the client, large props sent to the browser, slow navigation, or a switcher that stores its state in search params and makes the page dynamic. These apps build and run, so nothing warns the agent, which makes them good tasks. Grade them by what users get, such as page weight, prerendered HTML, or instant navigation.
- **GitHub issues and merged pull requests** that change how an application has to be written, such as a new API, a migration, or a behavior change. A merged change gives a realistic starting point and a known-good result, which is how SelfBench builds its tasks. Grade the behavior the change produces rather than the tests that came with it. Tests written for one patch import its files and mock its functions, so a correct repair with another structure fails.

Difficulty comes from real work at real size. SWE-Bench Pro tasks take an engineer hours to days, with changes across several files in real repositories. A 15-file fixture that needs a 30-line change can be brute-forced. Prefer a real open-source Next.js app at a pinned commit over a fixture written for the task. The `vercel/next-benchmarks` apps are adapted for performance runs, with stubbed pages and mock data, so they are not usable as they are.

Search `evals/evals/*/PROMPT.md` and `EVAL.ts` first. A larger fixture for a capability the suite already measures does not make a harder eval.

Route other questions to the measurement that owns them:

| Question                                                        | Measurement        |
| --------------------------------------------------------------- | ------------------ |
| Can the agent produce a correct Next.js change?                 | Agent Build        |
| Does the agent discover and choose Next.js?                     | Product choice     |
| Can the agent authenticate, deploy, and use a live application? | Agent Journey      |
| What changed in cost, speed, or shipped output?                 | Performance        |
| Did bundled docs, `AGENTS.md`, or a Skill improve the task?     | Context experiment |

### 2. Build the task around a decision, not an error message

Start from a working application and a feature request, not from a failing build. A build error names the route and the problem, so the agent can loop on `next build` until it's green. Frontier and weaker models alike pass that, and the task measures error-following instead of the decision. Agent Feedback reports describe an error, but turn the report into the feature the user was building, not the broken state.

Put the decision where nothing warns the agent: content that has to stay in the static HTML, a cache lifetime that has to stay fresh, data that must not leak between users, navigation that has to stay instant. Let a build error appear only when the agent's own change causes it, and make the shortcuts the error page suggests fail one of those requirements.

The strongest decisions show up only after the agent is done. State a change the app will go through later, such as new content, a new locale, or another route, and have the verifier make that change before it builds. A one-off fix that meets every check on today's app then fails, while the framework's own mechanism keeps working. For example, an agent that resizes today's images by hand meets every page-weight budget but fails once the verifier adds a new photo, while the image component handles it.

### 3. Write a short instruction

Follow Harbor's [instruction guidance](https://docs.harborframework.com/tasks/instruction), which asks for a concise instruction with clear outcomes. Write it as the user would report it, with the symptom, the goal, and only the constraints a user would actually state, such as not editing a vendored SDK or not changing dependencies. Never list the checks, and never name the API or the patch. The instruction must still state everything the verifier checks, with nothing left to guess, including requirements a user would take for granted, such as a passing type check or an unchanged feature. The approved competency prompts are 20 to 50 words. A checklist of every requirement hands the agent the answer, and every model passes it.

Before implementing, record in `task.toml` the capability, the evidence that it matters, and the owner, and decide whether the task must be held out from model training. Each task's `README.md` opens with **What this eval does**, three lines naming the app, the request, and what passes, and an **Instruction to checks** table that maps each sentence of the instruction to the check that verifies it, the instruction-to-test checklist Terminal-Bench asks for. A **Difficulty explanation** then says why the task is hard for agents and for which reports, and a **Verification explanation** lists which gate checks what. The reference repair is one accepted answer among many, and the verifier must accept any repair that meets the instruction.

### 4. Screen drafts before building graders

Most ideas do not survive contact with a model, so work in batches. Draft eight to ten candidates at once from the sources in step 1, screen them together, and build out only the few that fail for a real reason. This follows the SelfBench pipeline, which generates many candidate tasks from merged pull requests and keeps only those that pass its gates: the tests fail on the untouched repository, pass with the reference change, and pass again on a rerun.

A draft is the instruction, the fixture, a reference repair, one or two known-bad repairs, and a rough behavior check. Keep drafts out of the repository until one is built out into a full task.

1. **Confirm the pitfall on the pinned version.** Apply the change a developer would write first and check that it fails the rough check while the reference passes. Ideas from feedback reports and error repros often no longer reproduce because the framework now handles the case, and those drafts are dropped before any model runs.
2. **Validate locally.** The untouched fixture builds and scores 0, every known-bad repair scores 0, and the reference scores 1. A fixture that does not build hands the agent an error to follow.
3. **Run one frontier and one weaker model**, base treatment only. `MODELS` limits the cohort to those rows and `PARALLEL` runs them at the same time.
4. **Read both transcripts.** Keep a draft only when a model fails for a capability reason, such as a wrong API choice, a missed requirement, or a claim it never verified. A failure caused by the task or the check is a task bug to fix. A draft both models solve is dropped or reworked, not run on a full cohort.

Benchmarks that stay hard select from many drafts this way. Terminal-Bench 2.0 kept 89 of 229 contributed tasks after running models on each. Build out a draft that passes the screen by completing steps 5 to 7, adding the reviewed passing runs from the screen as known-good solutions.

### 5. Grade behavior

Use the first row that can prove the requirement, and stop there:

| Check                                    | Use when                                                      | Example                                             |
| ---------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Tests on files, build output, HTTP, logs | The outcome is observable                                     | Prerendered shell contents, status codes, log lines |
| Scripted browser                         | It needs a browser and we wrote the page                      | `instant()` navigation, filtering through the URL   |
| QA agent in a browser                    | The agent's build decides what the UI looks like              | "Add login and deploy it"                           |
| Judge model with a written rubric        | A semantic requirement none of the above can express          | "details wait for navigation behind a boundary"     |
| Trajectory review                        | Detecting shortcuts or a broken task; never part of the score | Editing tests, hard-coding answers, reading graders |

Terminal-Bench allows a model judge only in rare cases where it is shown to essentially never err, with a documented reason a program could not check the requirement. A judge grades only the criteria that need it, on top of every deterministic gate. Pin the model, commit the rubric, report its result as its own labeled number in `reward.json` rather than folding it into the pass, and spot-check its verdicts until its accuracy is known. The current tasks have no judge because every requirement in them is observable, and a future task may need one. Harbor's `harbor-rewardkit` is the supported way to add a judge.

Source checks cover only the constraints the instruction states and behavior cannot show, such as an unchanged vendored SDK or dependency set. Rather than banning an opt-out in the source, make the behavior it breaks fail.

#### Grading lessons

Read every failure before trusting it. A check that tests something the instruction doesn't state, such as exact wording or the markup around a value, fails correct repairs. Fix the check, or state the requirement and bump the version, then regrade.

Each of these let a wrong repair through until the check changed:

- **A live response is not the static shell.** Playwright's `request` fixture returns the whole streamed document. Read the prerendered HTML the build wrote under `.next/server/app/<route>.html`, and treat a missing file as "no shell".
- **Compare visible text, not markup.** React splits interpolated values with comment markers (`<!-- -->2026<!-- -->`), a Suspense boundary leaves a `<template>` placeholder, and a correct repair may wrap the value in a `<span>` with an inline script. Strip scripts and tags and collapse runs of spaces before checking content, and read headings from the `<h1>` text.
- **Read the production server log.** Some errors report only at request time, after a green build. Exercise document, RSC, and prefetch requests, then fail on `while prerendering`, `unstable value`, or `Could not validate`.
- **Use two identities.** Isolation needs a second user whose data must not appear and an expired session that must see nothing.
- **Disable redirects when checking status codes.** A streamed redirect is a 200 with the redirect inside the body.
- **Pin vendored dependencies.** Compare vendored files with the git baseline so the agent can't edit the library instead of working around it.
- **Compare timestamps with the prerendered value.** Two requests within one second produce the same second-resolution stamp.
- **State the dependency policy in the instruction and enforce it first.** The verifier has no network and installs the committed lockfile, so an agent that adds a dev dependency to write its own tests fails `tsc` for a reason it was never told. Say so in the instruction and fail dependency changes in the source check with that message, before any other gate.

### 6. Validate the grader

Prove the task measures its contract before reading any model result:

1. `harbor lint --select ALL` passes.
2. The untouched fixture builds and type-checks, and scores 0 for the intended reason.
3. The reference repair scores 1.
4. Every script in `tests/bad-solutions/` scores 0 at the check its header names.
5. The reference repair scores 1 on repeated runs. A verifier that flakes on a correct solution is wrong.
6. Correct solutions other than the reference score 1. Keep reviewed passing solutions from the screen and earlier runs as known-good cases, so the grader has to accept implementations shaped differently from yours.
7. A framework owner reviews the prompt and verifier together.

`tests/bad-solutions/` holds one script per shortcut the error page or the feedback reports show agents taking, each starting from the reference files and changing one decision. They are the grader's test suite: a bad repair that scores 1 means the grader is wrong, and an untouched fixture that scores 1 means the task is wrong.

### 7. Calibrate and decide

Run the task on a fixed cohort of frontier and weaker models with `evals/agent-build/tools/calibrate.sh`, then decide from the result:

1. **Score pass@1 only.** The first valid attempt is the score. Discard and rerun setup, image, sandbox, network, and model transport errors. An agent that runs out of time is scored on the work it left, as Harbor scores it, so it usually fails.
2. **Confirm failures.** Rerun each valid failure twice with `calibrate.sh --confirm` and record whether it repeats. Confirmations show whether a failure is stable and never change the score.
3. **Read every failure** before trusting it, and fix the grader when the instruction did not ask for what it checks.
4. **Keep the task** only if all of these hold:
   - It represents a real user or agent failure.
   - More than one correct implementation is possible, and the verifier accepts them.
   - The verifier tests behavior, not the reference patch.
   - It separates models: frontier models below 90% valid pass@1, with failures that repeat.
   - The result is reproducible enough to maintain.
5. **Decide.** Accepted tasks join the harder suite. Revise or drop the rest. Saturated tasks stay in the existing regression suite, and this step never migrates or redesigns them.

One cohort is directional, and a stable rate needs repeated independent runs before it's published. Prove a new task format with a few strong tasks before expanding a suite.

Public tasks support review and reproducibility. A leakage-resistant headline score needs independently authored private sibling instances in an approved dataset, with exposed instances rotated out. Adding a task here does not publish its scores on nextjs.org/evals, which is a separate decision.

## Context treatments

Context treatments such as `AGENTS.md` or a Skill are optional and belong to the runner rather than the task. For Next.js, the runs with and without `AGENTS.md` are two real user conditions. The `create-next-app` command adds `AGENTS.md` by default, older apps usually lack it, and the bundled docs are in `node_modules/next/dist/docs` in both runs. The comparison measures whether pointing the agent at the docs changes the result. The run with `AGENTS.md` backs the product claim, and the run without it shows how often agents find the docs on their own. A treatment may add context files but must leave the instruction, application, verifier, model, and runtime unchanged, and a treatment result never moves a task in or out of the curated set.

## Pull request format

The title starts with `eval:` and names the outcome. The description shows the current state only, never the history of how the change got there, and keeps the same short shape as other Next.js pull requests:

1. **Summary**: what the change adds and what calibration found, in plain sentences with the takeaway first, such as whether the tasks are saturated. Then add one bullet per task saying what the agent has to get right. Leave out suite labels, and remove a task every model solves rather than relabeling it.
2. **Results**: one line with the Next.js version, attempt policy, treatments, and how many runs are still going, then the output of `node evals/agent-build/tools/report.mjs <jobs-dir> <task ...>` pasted unchanged. The report is one dense table with a row per model and treatment for every cohort model, listed from the start so queued models show too. Each row has the runs passed out of runs scored across all tasks, then the cost and time per run, the price per million tokens, and tokens. Under the table, a chart plots pass@1 against cost per run with one point per model, as SelfBench charts its results. After the report, add a few sentences on which failures are real and whether each task separates models or is saturated.
3. **Verification**: a short list covering lint, untouched and reference scores, known-bad and known-good results, and formatting.

Open the pull request as a draft and refresh the Results section as runs finish. A section with pending runs says how many remain rather than being left out.
