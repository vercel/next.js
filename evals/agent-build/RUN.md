# Run Agent Build tasks

Run Agent Build tasks with Harbor on Vercel Sandbox, and validate them locally without Docker. The commands use the temporary pilot scripts in `evals/agent-build/tools`, which can change or be replaced by the shared Vercel Bench / `vercel/evals` layer without redefining the tasks. [Create a task](./CREATE.md) explains when each command is used.

## Install Harbor

Install the pinned Harbor revision in a local virtual environment:

```bash
python -m venv .harbor
.harbor/bin/pip install \
  'harbor[vercel] @ git+https://github.com/harbor-framework/harbor.git@e77a18bfeed53f907f335b9132d87006e01b3dfd'
```

## Configure credentials

Set `HARBOR_TELEMETRY=0` for every run, which `calibrate.sh` does itself. Otherwise Harbor sends a usage event per job with the model names, cost, and mean reward. Never pass `--upload`, which streams results to the Harbor Hub.

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
.harbor/bin/harbor lint --select ALL evals/agent-build/<task>  # needs the Docker CLI
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

The temporary `evals/agent-build/tools/calibrate.sh` adapter runs the cohort defined at the top of the script, one Harbor job per task, agent, and model, with one attempt each. Jobs land outside the task definition so a cell can be rerun or regraded alone:

```bash
HARBOR=.harbor/bin/harbor evals/agent-build/tools/calibrate.sh \
  /path/to/local.env /path/to/jobs evals/agent-build/<task> ...

evals/agent-build/tools/calibrate.sh --summary /path/to/jobs
```

Two variables narrow or speed up a run. `MODELS=<model>,<model>` keeps only those cohort rows, for example one frontier and one weaker model when screening a draft. `PARALLEL=<n>` runs up to `n` jobs at once instead of one after another. Each job is its own Harbor run in its own sandbox, so the limit protects the gateway budget and the sandbox quota, not the local machine:

```bash
MODELS=anthropic/claude-opus-5.5,openai/gpt-6-luna PARALLEL=2 \
  evals/agent-build/tools/calibrate.sh /path/to/local.env /path/to/jobs evals/agent-build/<task>
```

Agent harnesses differ in how they build the inference URL. Codex and OpenCode take the gateway's OpenAI-compatible base `https://ai-gateway.vercel.sh/v1`. Claude Code's SDK appends `/v1/messages` itself, so its row passes `base_url=https://ai-gateway.vercel.sh` as an agent option, or every call returns a 404 that Claude Code reports as `model_not_found`.

`node evals/agent-build/tools/report.mjs <jobs-dir> <task ...>` prints the Results section for the pull request, in the same shape as the `agent-eval` result pull requests. It has one dense table with a row per model and treatment, a cell per task, the runs passed out of runs scored, the price per million tokens (the effective rate, cached input included), tokens, cost, and time per run. Under it, a Mermaid chart that GitHub renders inline plots pass@1 against cost per run. An agent that runs out of time is scored on the work it left when the limit hit, as Harbor scores it, and any other runner error is discarded and the run repeated.

The script passes `--max-retries 2`, which retries runner exceptions such as sandbox allocation or transport failures and never reruns a completed attempt whose verifier returned `0`. A scored failure stays `0/1`, so run confirmations as separate jobs and record them separately.

When only a verifier changed after runs were scored, regrade instead of rerunning: `calibrate.sh --regrade <env-file> <jobs-dir> <task-dir>...` runs Harbor's [`harbor job regrade`](https://docs.harborframework.com/jobs/regrade) on each finished job with the current verifier, on the recorded patch and without agent cost, and writes the results under `<jobs-dir>/_regraded`, which the report prefers. A change to the instruction or fixture needs new runs.

To learn whether a failure is stable, `calibrate.sh --confirm <env-file> <jobs-dir> <task-dir>...` reruns every valid failure twice under `<jobs-dir>/_confirm`. Confirmations never change the pass@1 score, and the report shows how many repeated next to each failure.

## Read transcripts

Every run keeps its transcript next to its result in the jobs directory. The agent's trajectory is `<job>/<trial>/agent/trajectory.json` in Harbor's trajectory format, next to the harness's own log, and the verifier's output and reward are under `<job>/<trial>/verifier/`. Browse them with Harbor's viewer:

```bash
.harbor/bin/harbor view /path/to/jobs
```

Transcripts stay local for now. They are not uploaded to Harbor Hub or linked from the pull request, because they show how each task is solved and the harder set may be held out. Read the transcript behind every failure before trusting it, and share specific ones directly when a reviewer needs them. Revisit this when the publishing decision for the harder set is made.

## Run optional context treatments

Harbor runs the base task as committed. `TREATMENT=agents-md evals/agent-build/tools/calibrate.sh ...` runs a generated copy whose fixture also has the standard Next.js `AGENTS.md`, the same text as the `agent-eval` `agents-md` variant, and a `CLAUDE.md` that imports it. The instruction, verifier, model, effort, and runtime stay identical, jobs get an `__agents-md` suffix, and the report labels those rows `· AGENTS.md`. Never commit the generated copy as a second task. Suites for other frameworks can omit the treatment or define one for their own documentation.
