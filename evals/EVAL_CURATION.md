# Author and calibrate new Next.js evals

New Next.js Agent Build evals use the open-source
[Harbor](https://github.com/harbor-framework/harbor) task format and run on
Vercel Sandbox. Harbor packages the prompt, application, reference solution,
and hidden verifier into a portable, versioned task.

The existing `agent-eval` fixtures stay in this repository during the
transition. They preserve published history and continue to run the current
`regression` and `competency` suites. Use them to understand the Next.js
capabilities we already measure. Use Harbor for new tasks.

The existing `competency` and `regression` labels apply only to the current
agent-eval fixtures. A new Harbor task is validated and calibrated before it
joins the new maintained set. It does not need a label from the old suites.
The shared eval runner can support both formats later without changing their
historical results.

## Choose the measurement

Agent Build evals measure whether an agent can make a correct Next.js code
change. Route other questions to the measurement that owns them.

| Question                                                               | Measurement        |
| ---------------------------------------------------------------------- | ------------------ |
| Can the agent produce a correct Next.js change?                        | Agent Build        |
| Does the agent discover and choose Next.js?                            | Product choice     |
| Can the agent authenticate, build, deploy, and use a live application? | Agent Journey      |
| What changed in cost, speed, or shipped output?                        | Performance        |
| Did bundled docs, `AGENTS.md`, or a Skill improve the same task?       | Context experiment |

Keep a candidate in Agent Build only when the agent has a code change to make
and the verifier can measure a Next.js capability.

## Find candidates from observed work

Start with behavior that agents encounter in real Next.js work. Good sources
include:

- Reviewed agent failures that happen more than once
- Framework changes, migrations, and release work
- Tasks derived from real repositories and merged fixes
- Repeated support or documentation gaps
- Existing evals that still produce valid capability failures

The source provides evidence, but it does not determine acceptance. Route a
framework bug to framework tests, an environment failure to the owning
infrastructure, and a preference question to product-choice measurement.

## Define the task contract

Record the following information before implementing the task:

1. The Next.js capability and why it matters
2. A realistic prompt that describes the goal without naming the solution
3. A reproducible application and framework version
4. Checks that verify behavior without requiring one exact patch
5. A reference solution and representative incorrect solutions
6. Expected runtime, cost, owner, and maintenance trigger
7. Whether the task, checks, and results can be public

Keep the reference solution and verifier-only files outside the agent's
context. Keep the contract independent from Harbor so another runner can
execute the same prompt and checks later.

## Create a Harbor task

A Harbor task keeps the agent environment and verifier separate. A typical
task contains these files:

```text
task-name/
├── task.toml
├── instruction.md
├── environment/
│   ├── Dockerfile
│   └── docker-compose.yaml
├── solution/
│   ├── gold.patch
│   └── solve.sh
└── tests/
    ├── Dockerfile
    ├── docker-compose.yaml
    ├── test.patch
    └── test.sh
```

Use `task.toml` to pin the source revision, environment image, resources, and
timeouts. Pin each image by digest. Set `verifier.environment_mode` to
`separate` so the agent cannot inspect hidden checks or the reference solution.

The minimal `docker-compose.yaml` files let Harbor pull the pinned images
inside Vercel Sandbox. This avoids copying large images through Vercel
Container Registry.

```yaml
services:
  main: {}
```

## Validate the task before model runs

Prove that the task measures its contract before interpreting a score.

1. Confirm that the starting application fails for the intended reason.
2. Confirm that the reference solution passes.
3. Confirm that representative incorrect solutions fail.
4. Ask a framework owner to review the expected behavior and verifier.
5. Run `harbor lint` and fix every task-format error.

Classify failures as task, verifier, runner, model, or infrastructure failures.
Only valid model attempts contribute to pass@1.

## Run a task on Vercel Sandbox

Install the pinned Harbor revision in a local virtual environment.

```bash
python -m venv .harbor
.harbor/bin/pip install \
  'harbor[vercel] @ git+https://github.com/harbor-framework/harbor.git@e77a18bfeed53f907f335b9132d87006e01b3dfd'
.harbor/bin/harbor lint /path/to/task
```

Use an approved measurement project's `VERCEL_OIDC_TOKEN` for Vercel Sandbox.
Use a dedicated `AI_GATEWAY_API_KEY` with its own spend limit for model calls.
Store both values in one ignored local file. A Vercel project budget does not
limit requests made with an AI Gateway API key.

```bash
.harbor/bin/harbor run \
  --path /path/to/task \
  --agent codex \
  --model openai/gpt-6.1-sol \
  --effort medium \
  --env vercel \
  --env-file /path/to/local.env \
  --base-url https://ai-gateway.vercel.sh/v1 \
  --api-key-name AI_GATEWAY_API_KEY \
  --n-attempts 1 \
  --jobs-dir /path/to/results
```

Vercel Compose tasks currently require public network access. Use a dedicated
model key, and never copy credentials into a task or result artifact.

## Calibrate capability separation

Run the same task with a fixed frontier and weaker-model cohort. Record the
agent, model, runner, task, and framework versions for every attempt.

Score the first valid attempt as pass@1. Discard setup, image, sandbox,
network, and model transport errors, then retry the attempt. When a model
fails, run confirmation attempts to learn whether the failure is stable.
Confirmation attempts add context but never change the first valid score.

Match the number of attempts to the claim. One valid attempt per model is a
directional calibration result. Use repeated independent attempts before
claiming a stable success rate or saturation. When reproducing an external
benchmark, use the attempt count and aggregation method declared by that
benchmark instead of applying the local pass@1 policy to it.

Keep the transcript, patch, verifier output, failure classification, token
usage, cost, and duration with each result.

## Report results in the pull request

Start the pull request title with `eval:` and name the capability being added or
changed.

Keep the result summary in the pull request and the complete trial records in
Harbor. Upload the job privately and link it so reviewers can inspect the
transcript, patch, verifier output, token usage, and cost.

Use one compact table based on Harbor's job and trial results:

| Task | Agent and model | Passed / valid | Pass rate | Average duration | Average tokens | Average cost | Job |
| ---- | --------------- | -------------- | --------- | ---------------- | -------------- | ------------ | --- |

State the task, framework, Harbor, agent, and model versions, the configured
attempt count, which verifier was used, and what the reported cost includes.
Call single-attempt results directional. List discarded infrastructure attempts
and confirmation runs below the table without changing the scored result. Do
not paste full trajectories into the pull request description.

## Decide whether to keep the task

Every new task is run during authoring. Use its validation and calibration
results to make one decision.

- **Keep**: The verifier is valid, results show useful capability separation,
  cost is understood, and the task has an owner. Add it to the maintained
  Harbor eval set.
- **Revise**: The capability matters, but the prompt, fixture, verifier,
  environment, or evidence needs another review cycle.
- **Drop or reroute**: The task is redundant, invalid, impractical to maintain,
  or belongs to another measurement.

New Harbor tasks do not enter the existing `competency` or `regression` suites
during authoring. Keep tasks and results unpublished until the team reviews
their contract, evidence, ownership, and maintenance plan. Record changes such
as pass@4 to pass@1 as a new measurement baseline instead of combining
incompatible score histories.
