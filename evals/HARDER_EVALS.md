# Author harder Next.js evals

This directory is the Next.js implementation of the shared Vercel Agent Build
contract. New tasks use the open-source
[Harbor](https://github.com/harbor-framework/harbor) format and run on Vercel
Sandbox. The contract keeps the prompt, environment, reference solution, hidden
verifier, and result provenance separate so the same task can move to the
planned shared eval repository and CLI without being rewritten.

The existing `agent-eval` fixtures remain in `evals/evals`. They preserve the
published history on nextjs.org/evals and continue to run the `regression` and
`competency` suites. New tasks live in `evals/harder` and do not enter that
publication pipeline.

“Harder” describes the goal: real Next.js work that still separates model
capability after the current suite has saturated. Complexity alone does not
qualify a task. Validation and calibration determine whether it belongs in the
maintained set.

## Choose a capability

Use an Agent Build eval when an agent must make a correct Next.js code change.
Start with behavior observed in real work, such as repeated agent feedback,
framework migrations, release changes, and fixes from real applications.

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
3. The starting application and exact Next.js version
4. Behavioral checks that allow more than one correct implementation
5. A reference solution and representative incorrect solutions
6. An owner and the change that should trigger a review
7. Whether the task must be held out from model training

## Task structure

```text
evals/harder/<task>/
├── task.toml
├── instruction.md
├── environment/
│   ├── Dockerfile
│   └── fixture/
├── solution/
│   └── solve.sh
└── tests/
    ├── Dockerfile
    ├── fixture/
    ├── test.sh
    └── <behavioral checks>
```

Fill in the task name, version, description, author, and searchable keywords.
Record the product, measurement type, capability, framework version, and source
in metadata. Pin the container image, resources, and timeouts.

Run the verifier in a separate environment with no network access. Pass only the
artifacts it needs, and install verifier tooling in its image rather than at
scoring time. Task definitions in this directory are public. Keep a future task
outside this repository only when it must be held out from model training.

## Validate the task

Prove that the task measures its contract before interpreting model results:

1. Run `harbor lint` and fix every format error.
2. Run `harbor check` to review the task against Harbor's quality rubric.
3. Run the `nop` agent and confirm that the untouched application fails for the
   intended reason.
4. Run the `oracle` agent and confirm that the reference solution passes.
5. Confirm that representative incorrect solutions fail.
6. Ask a framework owner to review the prompt and verifier together.

The prompt must state every behavior the verifier requires without revealing the
implementation. The verifier must accept reasonable alternative solutions and
check that unrelated behavior still works. Avoid exact symbols, patches, or error
messages unless the prompt requires them. If the verifier image duplicates the
starting fixture, verify that the copies are byte-identical.

Classify each failure as a task, verifier, runner, model, or infrastructure
failure. Only valid model attempts contribute to the score.

## Run on Vercel Sandbox

Install the pinned Harbor revision in a local virtual environment:

```bash
python -m venv .harbor
.harbor/bin/pip install \
  'harbor[vercel] @ git+https://github.com/harbor-framework/harbor.git@e77a18bfeed53f907f335b9132d87006e01b3dfd'
.harbor/bin/harbor lint --select ALL evals/harder/<task>
```

Use an approved measurement project's `VERCEL_OIDC_TOKEN` for Vercel Sandbox.
Use a dedicated, spend-limited `AI_GATEWAY_API_KEY` for model calls. Store both
in an ignored local file. Never add credentials to a task or result artifact.

Run the quality review with model credentials exported for the selected
checker. Run `nop` and `oracle` in the same Sandbox environment used for model
calibration.

```bash
.harbor/bin/harbor check evals/harder/<task> \
  --agent codex \
  --model openai/gpt-6.1-sol \
  --env vercel
.harbor/bin/harbor run \
  --path evals/harder/<task> \
  --agent nop \
  --env vercel \
  --env-file /path/to/local.env
.harbor/bin/harbor run \
  --path evals/harder/<task> \
  --agent oracle \
  --env vercel \
  --env-file /path/to/local.env
```

```bash
.harbor/bin/harbor run \
  --path evals/harder/<task> \
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

## Calibrate and report

Run a fixed frontier and weaker-model cohort. Score the first valid attempt as
pass@1. Retry setup, image, sandbox, network, and model transport errors. When a
model fails, use confirmation attempts to understand whether the failure is
stable. Confirmations do not change the first valid score.

One attempt per model is directional evidence. Use repeated independent runs
before claiming a stable pass rate or saturation. Keep the transcript, patch,
verifier output, failure classification, token usage, cost, and duration with
each result.

Start the pull request title with `eval:`. Summarize the calibration in one
table and link the complete Harbor job when it is available:

| Task | Agent and model | Passed / valid | Duration | Tokens | Cost | Job |
| ---- | --------------- | -------------- | -------- | ------ | ---- | --- |

State the Next.js, Harbor, agent, and model versions, the attempt count, and
the verifier used. Call single-attempt results directional. List discarded
infrastructure attempts and confirmation runs below the table without changing
the scored result.

Adding a task to `evals/harder` does not publish its scores on nextjs.org/evals.
Score publication is a separate decision after the team reviews the task,
evidence, ownership, and maintenance cost.
