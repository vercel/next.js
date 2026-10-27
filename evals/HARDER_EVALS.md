# Curating advanced Next.js evals

Advanced evals measure realistic Next.js work that current agents do not solve
reliably. They keep the competency suite useful as older tasks become
saturated.

Advanced describes validated capability separation. It does not mean a longer
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

A candidate belongs in the advanced suite only when the agent has a valid action
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
7. whether the task and its results may be public or must stay held out.

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

## Run portable pilot tasks

Keep the existing regression suite on `agent-eval`. New advanced tasks may also
use the open-source Harbor task format during the pilot so their application,
prompt, hidden verifier, and reference patch can run independently of this
repository.

A portable task archive must declare its image through
`[environment].docker_image`, pin that image by digest, and pass
`harbor lint`. Include a minimal `docker-compose.yaml` in each environment
directory: `environment/` for the agent and `tests/` when the task uses a
separate verifier image. Compose mode pulls the pinned images inside Vercel
Sandbox and avoids copying large task images through Vercel Container
Registry.

Run with an approved measurement project's `VERCEL_OIDC_TOKEN` and a dedicated
`AI_GATEWAY_API_KEY` with its own spend limit in one local, ignored env file.
The OIDC token authorizes Sandbox; the Gateway key authorizes model calls and
applies its key-level limit. A Vercel project budget does not apply to API key
requests. Vercel Compose tasks currently require public network mode, so do not
reuse a general-purpose model credential. Do not copy either value into a task
or result artifact.

```bash
python -m venv .harbor
.harbor/bin/pip install \
  'harbor[vercel] @ git+https://github.com/harbor-framework/harbor.git@e77a18bfeed53f907f335b9132d87006e01b3dfd'
.harbor/bin/harbor lint /path/to/task

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

Keep the agent and verifier isolated. Store the task revision, runner version,
model configuration, transcript, patch, verifier output, cost, and duration in
the result directory. Treat setup, image, sandbox, network, and model transport
errors as infrastructure failures and retry them without changing pass@1.

The Vercel credentials are runner details, not part of the task contract. A
task remains portable when its environment is pinned and the same prompt and
verifier can run through another supported Harbor environment.

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

New advanced tasks stay unpublished by default. Publish only after reviewing
the task contract, grader, calibration, ownership, and maintenance plan. Keep
private or held-out checks out of public fixtures and result artifacts.

Run the advanced competency suite when Next.js, its tasks, agents, or models
change. Run saturated regression tasks through their cheaper, more frequent
cadence. Record policy changes such as pass@4 to pass@1 as a new measurement
baseline rather than one continuous score history.
