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

### What Harbor expects

These tasks follow the published Harbor task format exactly, so they can move to the shared `vercel/evals` repository and be handed to partners unchanged. The rules that matter:

- The five parts are `instruction.md`, `task.toml`, `environment/`, `solution/solve.sh`, and `tests/test.sh`. Nothing else is required, and nothing else is read by Harbor.
- `tests/test.sh` must write a numeric reward to `/logs/verifier/reward.json` (a JSON object of labeled numbers) or `/logs/verifier/reward.txt` (one number). Our tasks write `{"reward": 1}` or `{"reward": 0}` and always exit 0, so a crashed check reads as a failed task rather than a runner error.
- With a separate verifier (`[verifier] environment_mode = "separate"`), Harbor does not upload `tests/` at run time. `tests/Dockerfile` must copy every check it runs, and the agent's changes only reach it through the paths listed in `artifacts`. Our tasks collect `/tmp/agent.patch` from the agent container and apply it to a clean copy of the fixture.
- Harbor copies `solution/` to `/solution` and runs `solve.sh` from the task working directory (`/app`). Keep the reference repair as files under `solution/files/` and have `solve.sh` copy them; large heredocs are hard to review and easy to break.
- Pin everything: base images by digest, npm dependencies through the committed lockfiles, and the verifier's browser through `tests/package-lock.json`. `harbor lint --select ALL` enforces the pins.
- Run `harbor lint --select ALL <task>` before opening a pull request. Only the compose rules need the Docker CLI; every other rule runs anywhere.

Two conventions are ours, not Harbor's. `tests/bad-solutions/` holds known incorrect repairs with a README that names the check that rejects each one; they are review material and never run during a trial. `tests/fixture/` is a byte-identical copy of `environment/fixture/`, because the separate verifier image needs the baseline too. Copy it again after every fixture edit.

The minimal `docker-compose.yaml` files select Harbor's Vercel Compose path. The linked Vercel project is named `next.js`, while Vercel Container Registry does not accept the dot in that legacy project slug. Harbor's native single-container path therefore fails before the task starts. Compose builds the same Dockerfiles inside Vercel Sandbox and avoids that registry path. Keep both files until the runner or project namespace changes.

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

## Validate a task locally

`evals/agent-build/tools/run-local.sh` runs a task's verifier on this machine without Docker or Harbor. It copies the fixture, creates the git baseline, applies a solution script the way the oracle does, collects the patch, and runs the task's checks in the same order as `tests/test.sh`. Dependencies install into `/tmp/agent-build-local` on the first run.

```bash
# The untouched fixture must score 0.
evals/agent-build/tools/run-local.sh evals/agent-build/<task>

# The reference repair must score 1.
evals/agent-build/tools/run-local.sh evals/agent-build/<task> evals/agent-build/<task>/solution/solve.sh

# Every known incorrect repair must score 0, at the check its header names.
for bad in evals/agent-build/<task>/tests/bad-solutions/*.sh; do
  evals/agent-build/tools/run-local.sh evals/agent-build/<task> "$bad"
done
```

The runner knows nothing about the framework under test. It recreates the layout Harbor gives a separate verifier and executes the task's own `tests/test.sh`, so the task stays the single source of truth for grading. A `test.sh` that wants to run locally reads these variables and falls back to Harbor's paths:

| Variable         | Local meaning                              | Harbor default       |
| ---------------- | ------------------------------------------ | -------------------- |
| `EVAL_APP_ROOT`  | Fixture copy the patch is applied to       | `/app`               |
| `EVAL_TESTS_DIR` | Tests copy with the verifier dependencies  | `/tests`             |
| `EVAL_LOGS_DIR`  | Where `reward.json` and logs are written   | `/logs/verifier`     |
| `EVAL_PATCH`     | The collected patch                        | `/tmp/agent.patch`   |
| `EVAL_BASE_GIT`  | Bare baseline repository                   | `/opt/eval/base.git` |
| `EVAL_PORT`      | Port the verifier may bind                 | `3010`               |
| `EVAL_LOCAL`     | Set: run commands directly, not as `agent` | unset                |

Scripts in `tests/bad-solutions/` locate their helpers relative to themselves and the reference files through `SOLUTION_DIR` (Harbor's `/solution`), so they run anywhere too.

## Validate a task in Harbor

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

`evals/agent-build/tools/calibrate.sh` runs the cohort defined at the top of the script, one Harbor job per task, agent, and model, with one attempt each. Jobs land outside the task definition so a cell can be rerun or regraded alone:

```bash
HARBOR=.harbor/bin/harbor evals/agent-build/tools/calibrate.sh \
  /path/to/local.env /path/to/jobs evals/agent-build/<task> ...

evals/agent-build/tools/calibrate.sh --summary /path/to/jobs
```

The script passes `--max-retries 2`, which retries runner exceptions such as sandbox allocation or transport failures and never reruns a completed attempt whose verifier returned `0`. A scored failure stays `0/1`; run confirmations as separate jobs and record them separately.

## Run optional context treatments

Harbor runs the base task as committed. Context treatments belong to the suite adapter and are optional.

For a Next.js bundled-docs experiment, run the same task twice. The base run uses the committed fixture. The treated run uses a generated copy that adds the standard `AGENTS.md` instruction and matching `CLAUDE.md` reference before Harbor starts the agent. Keep the prompt, application, verifier, model, effort, and runtime identical.

Do not commit the generated copy as a second task. Store `base` or `agents-md` with each result. Suites for other frameworks can omit this comparison or define a treatment that matches their own documentation system.
