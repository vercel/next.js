# Run Next.js Agent Build evals

Run Next.js Agent Build eval candidates with Harbor on Vercel Sandbox. The authoring and grading contract lives in [Curate Next.js Agent Build evals](./AGENT_BUILD_EVALS.md); this file contains the current runner adapter and can change without redefining the tasks.

## Harbor task layout

Each candidate uses Harbor's task format:

```text
evals/agent-build/<task>/
├── task.toml
├── instruction.md
├── environment/
│   ├── Dockerfile
│   ├── docker-compose.yaml
│   └── fixture/
├── solution/
│   └── solve.sh
└── tests/
    ├── Dockerfile
    ├── docker-compose.yaml
    ├── fixture/
    ├── test.sh
    └── <behavioral checks>
```

`instruction.md` is the only task instruction the agent receives. `solution/solve.sh` is available only to the oracle. The verifier runs from `tests/` in a separate environment with no network access. Harbor transfers the agent's patch into that environment for grading.

The minimal `docker-compose.yaml` files select Harbor's Vercel Compose path. The linked Vercel project is named `next.js`, while Vercel Container Registry rejects the dot in that legacy project slug. Harbor's native single-container path therefore fails before the task starts. Compose builds the same Dockerfiles inside Vercel Sandbox and avoids that registry path. Keep both files until the runner or project namespace changes.

## Install Harbor

Install the pinned Harbor revision in a local virtual environment:

```bash
python -m venv .harbor
.harbor/bin/pip install \
  'harbor[vercel] @ git+https://github.com/harbor-framework/harbor.git@e77a18bfeed53f907f335b9132d87006e01b3dfd'
```

## Configure credentials

Use an approved measurement project's `VERCEL_OIDC_TOKEN` for Vercel Sandbox. Use a dedicated, spend-limited `AI_GATEWAY_API_KEY` for model calls. Store both in an ignored local file. Never add credentials to a task or result artifact.

The OIDC token must be scoped to the Vercel project used for the run. A failed token exchange is an authentication failure. A VCR `NAME_INVALID` error for the `next.js` project means the Compose files are missing or were not detected.

## Validate a task

Run Harbor's static checks, task review, untouched fixture, and reference repair:

```bash
.harbor/bin/harbor lint --select ALL evals/agent-build/<task>
.harbor/bin/harbor check evals/agent-build/<task> \
  --agent codex \
  --model openai/gpt-6.1-sol \
  --env vercel
.harbor/bin/harbor run \
  --path evals/agent-build/<task> \
  --agent nop \
  --env vercel \
  --env-file /path/to/local.env
.harbor/bin/harbor run \
  --path evals/agent-build/<task> \
  --agent oracle \
  --env vercel \
  --env-file /path/to/local.env
```

The `nop` run must execute the verifier against the untouched fixture and fail for the intended reason. The `oracle` run must pass the same verifier. Inspect the logs before treating either reward as valid.

## Calibrate models

Run each model once for pass@1 and store the complete Harbor job outside the task definition:

```bash
.harbor/bin/harbor run \
  --path evals/agent-build/<task> \
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

Retry infrastructure failures. Keep a scored model failure at 0/1 when confirmation attempts later pass, and record those confirmations separately.
