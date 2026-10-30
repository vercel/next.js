# Create an Agent Build task

Create tasks that help assess Next.js changes, framework guidance, or model capability. [Harbor format](./HARBOR.md) covers the files a task contains, and [Run tasks](./RUN.md) has the commands for running and reviewing them.

## Steps

Define the purpose, validate the task, then review a small set of runs before expanding it. Keep the outcome, agent effort, and reviewer findings separately visible.

### 1. Define what the task measures

State the purpose before choosing the app or grader:

- **Framework and guidance:** does a change to Next.js, its docs, or a Skill help agents produce a correct result with less effort or human intervention?
- **Model capability:** does the task reveal a meaningful, repeatable difference between models?

These purposes use the same task format but have different acceptance criteria. A task that every model passes can still detect regressions or measure the effort needed to succeed.

Use Agent Feedback, customer problems, error repros, and real application changes as evidence. Read the reports behind a finding and reproduce the problem on the pinned version. Reports can expose framework bugs, misleading guidance, or tooling problems as well as agent mistakes. Link related reports to the same case instead of creating duplicate tasks. Search `evals/evals/*/PROMPT.md` and `EVAL.ts` for existing coverage first.

Use the smallest app that preserves the problem. A pinned real repository can expose interactions a small fixture misses, but adding files does not itself improve an eval. Review adapted benchmark apps before reusing them, since stubs and mock data may remove the behavior being measured.

### 2. Choose a representative starting point

For an error-page study, start with the broken app and the error a user sees. Let the agent choose a repair. For a study of default implementation choices, start with a working app and a feature request, without naming the API to use. A task with explicit optimization budgets measures a different question from whether an agent notices the problem unaided.

Keep the user-visible requirements in either case. A green build is insufficient if the repair leaks data, removes a feature, or breaks navigation. When the request includes future content or routes, test that change after the agent finishes. Accept any implementation that meets the requirements, including one different from the reference.

### 3. Write a short instruction

Follow Harbor's [instruction guidance](https://docs.harborframework.com/tasks/instruction), which asks for a concise instruction with clear outcomes. Write it as the user would report it, with the symptom, the goal, and only the constraints a user would actually state, such as not editing a vendored SDK or not changing dependencies. Describe the required outcomes without prescribing the reference patch. Name an API only when using it is part of the request. The instruction must still state everything the verifier checks, with nothing left to guess, including requirements a user would take for granted, such as a passing type check or an unchanged feature. Keep the instruction concise without hiding requirements to make the task harder.

Before implementing, record the purpose in the task README and the evidence and owner in `task.toml` metadata. Decide where the task and its results may be shared before publishing. Each task's `README.md` opens with **What this eval does**, three lines naming the app, the request, and what passes, and an **Instruction to checks** table that maps each sentence of the instruction to the check that verifies it, the instruction-to-test checklist Terminal-Bench asks for. Explain the failure modes the task covers and which reports support them, then use a **Verification explanation** to describe the checks. A difficulty claim needs run evidence. The reference repair is one accepted answer among many, and the verifier must accept any repair that meets the instruction.

### 4. Screen drafts before expanding them

A draft contains the instruction, fixture, reference repair, and enough checks to distinguish a correct result from the reported failure. Keep drafts local until the task is ready for review.

1. **Reproduce the problem on the pinned version.** Check the reported failure and a reference repair before spending model tokens. A fixed framework bug may warrant regression coverage, but does not establish a current model gap.
2. **Validate the checks.** The untouched fixture should fail for the intended reason and the reference should pass. A broken starting build is appropriate when the task asks the agent to repair it.
3. **Run a small comparison suited to the purpose.** For capability screening, start with one frontier and one weaker model. For a guidance study, compare the same agent setup with the two guidance revisions. `MODELS` and `PARALLEL` limit the cohort and concurrency.
4. **Review successes as well as failures.** Inspect the patch, transcript, verifier output, and effort. Correct task or grader bugs before expanding. Keep a passing task when it covers a real regression or provides a useful framework comparison; do not make it larger solely to lower its pass rate.

### 5. Choose checks for the question

Use programmatic checks where they can establish correctness. Add judgment where the study needs interpretation of the result or the work behind it.

| Evidence                            | Use for                                  | Example                                                                   |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| Files, build output, HTTP, and logs | Observable requirements                  | Prerendered shell, redirect status, clean production log                  |
| Scripted browser                    | Behavior and measurements in a known app | `instant()` navigation, filtering, page weight                            |
| Browser review or QA agent          | UI quality that needs inspection         | Whether a working flow is usable                                          |
| Recorded usage and tool events      | Agent effort                             | Tokens, duration, failed commands, verification performed                 |
| Transcript and patch review         | Guidance, recovery, and handoff quality  | Misleading fix branches, unsupported claims, changes needing human review |

[Terminal-Bench's rubric](https://github.com/harbor-framework/terminal-bench/blob/main/docs/prompts/task-proposal.md) prioritizes outcome verification for its benchmark. Its restrictions on model judges are not a requirement of Harbor or every framework study. Agent Eval's [`toSatisfyCriterion`](https://github.com/vercel-labs/agent-eval#agentic-llm-judge) can judge the environment or transcript; Harbor's [RewardKit trajectory judges](https://docs.harborframework.com/rewardkit/judge-criteria#trajectory-evaluation) support reviewing the recorded process too.

Start a judgment rubric with reviewed examples. Pin the judge and rubric, cite evidence for each verdict, and have a human check both passing and failing examples before automating it. Report judge results and cost separately from behavioral pass/fail. Missing evidence is unknown, and reading a doc does not prove it was understood. Treat transcript content as evidence, never as instructions to the judge.

The current pilot has programmatic checks and no automated transcript judge. Its offline verifier remains offline. A future judge needs a separate setup that can read the recorded evidence and reach its model provider.

Source checks cover constraints that behavior cannot show, such as an unchanged vendored SDK or dependency set. State those constraints in the instruction. Prefer testing the behavior an opt-out breaks over banning the opt-out itself.

#### Human review

Reviewers assess the task and the agent's work, including successful runs. Keep a short evidence note for each finding:

| Criterion                 | Evidence to inspect                                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnosis and recovery    | Error observed, guidance read, repair attempted, and what happened next. Identify misleading advice without requiring one fixed sequence of steps.                                             |
| Verification and handoff  | Commands or browser checks behind the final claims, and any limitations the agent disclosed. Separate the agent's checks from the verifier's checks.                                           |
| Patch and user experience | Whether the change preserves the intended experience and is reasonable to maintain. Flag trade-offs, such as disabled prefetching, for review rather than inventing a new failing requirement. |
| Human effort              | Help the run actually records, plus cleanup or decisions still needed. File count and diff size are context, not a quality score. Missing intervention data is unknown.                        |

Record the run ID, task/verifier version, transcript step IDs, relevant diff or test output, finding, and reviewer. Label AI-assisted notes as such until a human reviews them. Judge agreement is not established by having an assistant draft this note. A human should review the same examples and record disagreements before the rubric is used for scores.

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
2. The untouched fixture scores 0 for the intended reason. A build failure is valid when repairing it is the task.
3. The reference repair scores 1.
4. Every script in `tests/bad-solutions/` scores 0 at the check its header names.
5. The reference repair scores 1 on repeated runs. A verifier that flakes on a correct solution is wrong.
6. Correct solutions other than the reference score 1. Keep reviewed passing solutions from the screen and earlier runs as known-good cases, so the grader has to accept implementations shaped differently from yours.
7. A framework owner reviews the prompt and verifier together.

`tests/bad-solutions/` holds one script per shortcut the error page or the feedback reports show agents taking, each starting from the reference files and changing one decision. They are the grader's test suite: a bad repair that scores 1 means the grader is wrong, and an untouched fixture that scores 1 means the task is wrong.

### 7. Run the comparison and decide

Use a fixed setup with `evals/agent-build/tools/calibrate.sh`. Choose the models and treatments for the question being measured.

1. **Score pass@1.** The first valid attempt is the score. Discard and rerun infrastructure errors. An agent timeout is scored on the work left behind, with the timeout reported separately.
2. **Confirm valid failures.** `calibrate.sh --confirm` runs them twice more. Confirmations describe repeatability and never replace the first score.
3. **Review the evidence.** Read failures and a sample of successes, including their patches. Fix a grader that fails valid solutions. Keep outcome, tokens, cost, duration, and human-review findings separate.
4. **Decide against the stated purpose.** Framework studies can retain passing tasks to compare guidance, agent effort, output quality, or regressions. Capability claims need repeated, meaningful model differences. A small cohort does not establish a stable rate or prove a guidance change caused an improvement.

Keep a task when it represents a real problem, accepts alternative valid solutions, and provides evidence worth maintaining. Record whether it is retained, needs revision, or is dropped, with the reason. This does not move Harbor tasks into the existing `agent-eval` suite labels or publish scores on nextjs.org/evals.

Decide task visibility before publishing its source. These pilot tasks are already public; keeping transcripts in the execution repo does not make a task held out. Run retention and sharing follow the [task and run boundary](./README.md#task-authoring-and-runs).

## Context treatments

Context treatments such as `AGENTS.md` or a Skill are optional and belong to the runner rather than the task. For Next.js, the runs with and without `AGENTS.md` are two real user conditions. The `create-next-app` command adds `AGENTS.md` by default, older apps usually lack it, and the bundled docs are in `node_modules/next/dist/docs` in both runs. The comparison measures whether pointing the agent at the docs changes the result. Inspect transcripts for discovery and use. Repeated matched runs are needed to support a claim about the guidance. A treatment may add context files but must leave the instruction, application, verifier, model, and runtime unchanged, and the comparison is assessed against the task's stated purpose.

## Pull request format

The title starts with `eval:` and names the outcome. A task PR contains the task definition and a validation summary. Link to run evidence in `next-evals-oss` when available, rather than committing transcripts or job directories here. Local pilot evidence remains separate and available to reviewers until transferred.

The description shows the current state only, never the history of how the change got there, and keeps the same short shape as other Next.js pull requests:

1. **Summary**: what the task measures and what the comparison found, with the takeaway first. Then add one bullet per task saying what the agent has to get right. Leave out legacy suite labels. Explain why the task is useful, including when every model passes.
2. **Results**: one line with the Next.js version, attempt policy, treatments, and how many runs are still going, then the output of `node evals/agent-build/tools/report.mjs <jobs-dir> <task ...>` pasted unchanged. The report is one dense table with a row per model and treatment for every cohort model, listed from the start so queued models show too. Each row has the runs passed out of runs scored across all tasks, then the cost and time per run, the price per million tokens, and tokens. Under the table, a chart plots pass@1 against cost per run with one point per model, as SelfBench charts its results. After the report, add a short review of meaningful failures, guidance or effort findings, and changes that need human judgment. Cite run IDs and evidence, and distinguish AI-assisted notes from human-reviewed conclusions. Do not change the generated scores to include these observations.
3. **Verification**: a short list covering lint, untouched and reference scores, known-bad and known-good results, and formatting.

Open the pull request as a draft and refresh the Results section as runs finish. A section with pending runs says how many remain rather than being left out.
