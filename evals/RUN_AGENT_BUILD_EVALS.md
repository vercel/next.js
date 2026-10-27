# Run Next.js Agent Build evals

Run the first Next.js Agent Build eval candidates with Harbor on Vercel Sandbox. The authoring and grading contract lives in [Curate Next.js Agent Build evals](./AGENT_BUILD_EVALS.md); this file documents temporary pilot plumbing and can change or be replaced by the shared Vercel Bench / `vercel/evals` layer without redefining the tasks.

## Old and new side by side

The existing `agent-eval` fixtures and the Harbor tasks answer the same question with different plumbing. Use this table to translate between them; the `agent-eval` column is documented in [`evals/README.md`](./README.md).

| Concern            | `agent-eval` fixture (`evals/evals/*`)           | Harbor task (`evals/agent-build/*`)                                              |
| ------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| Prompt             | `PROMPT.md`                                      | `instruction.md`                                                                 |
| Starting app       | Fixture root                                     | `environment/fixture/`, built by `environment/Dockerfile` with a git baseline    |
| Checks             | `EVAL.ts`, Vitest in the agent's sandbox         | `tests/test.sh` plus Node and Playwright checks in a separate verifier container |
| Semantic criteria  | `toSatisfyCriterion` with a pinned judge model   | None yet; see the authoring guide for when a judge is justified                  |
| Settings           | `eval.config.json`, `eval.suites.json`           | `task.toml`                                                                      |
| Reference solution | None                                             | `solution/solve.sh` copying `solution/files/`                                    |
| Known-bad repairs  | None                                             | `tests/bad-solutions/`                                                           |
| Runner             | `run-evals.js` over `@vercel/agent-eval`         | Pilot: `harbor run` on Vercel Sandbox; `tools/calibrate.sh` for cohorts          |
| Context treatment  | `baseline` and `agents-md` variants, always both | Optional, defined by the runner, off by default                                  |
| Local validation   | `pnpm eval <name> --dry`                         | `tools/run-local.sh`                                                             |
| Publication        | `next-evals-oss` and nextjs.org/evals            | Not published; a separate decision after calibration                             |

## Harbor task layout

Tasks use the published [Harbor task format](https://docs.harborframework.com/tasks/overview); its references for the [instruction](https://docs.harborframework.com/tasks/instruction), [configuration](https://docs.harborframework.com/tasks/configuration), [environment](https://docs.harborframework.com/tasks/environment), [solution](https://docs.harborframework.com/tasks/solution), and [verifier](https://docs.harborframework.com/tasks/verifier) are the source of truth. This section covers only what our tasks add.

### How to read a task

1. `README.md`: why the task is hard and how each gate verifies it.
2. `instruction.md`: the only thing the agent sees.
3. `task.toml`: the `version`, the source findings under `[metadata]`, and the network and isolation settings.
4. `environment/fixture/`: the broken app. `environment/Dockerfile` installs it from the lockfile and commits a git baseline the patch is diffed against.
5. `tests/test.sh`: the gates in order: `check-source.mjs` for the stated constraints, typecheck and build, the behavioral checks, then the server log.
6. `solution/`: the reference repair as files under `solution/files/`, copied by `solve.sh`. Read it after the verifier, so the checks are judged on their own.
7. `tests/bad-solutions/`: one script per shortcut, with the gate that catches it in the header and a README table.

### What our tasks add to Harbor

- **A separate, offline verifier.** `[verifier] environment_mode = "separate"` with `network_mode = "no-network"`, so the agent cannot read or edit the checks. The agent's work reaches the verifier only as `/tmp/agent.patch`, collected by `[[verifier.collect]]` and applied to a clean copy of the fixture. Because the verifier installs the committed lockfile offline, every instruction says not to change dependencies, and `check-source.mjs` fails a dependency change before anything else.
- **`tests/fixture/`** is a byte-identical copy of `environment/fixture/`, because the verifier image needs the baseline too. Copy it again after every fixture edit.
- **`tests/bad-solutions/`** holds known incorrect repairs. They are review material and never run during a trial.
- **Compose files on Vercel.** The minimal `docker-compose.yaml` files select Harbor's Vercel Compose path, because Vercel Container Registry rejects the dot in the `next.js` project slug. On Vercel, Compose supports `public` and `no-network`, not `allowlist`.
- **Pins.** Base images by digest, dependencies through committed lockfiles, and the verifier's browser through `tests/package-lock.json`. `harbor lint --select ALL` enforces them.

See also [running Harbor on Vercel Sandbox](https://vercel.com/kb/guide/run-terminal-bench-harbor-benchmarks-vercel-sandbox), [HarborHub](https://hub.harborframework.com/), and `harbor agent schema <agent>` for each harness's options.

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

Agent harnesses differ in how they build the inference URL. Codex and OpenCode take the gateway's OpenAI-compatible base `https://ai-gateway.vercel.sh/v1`; Claude Code's SDK appends `/v1/messages` itself, so its row passes `base_url=https://ai-gateway.vercel.sh` as an agent option, or every call returns a 404 that Claude Code reports as `model_not_found`.

`node evals/agent-build/tools/report.mjs <jobs-dir> <task ...>` prints the Results section for the pull request, in the same shape as the `agent-eval` result pull requests: totals per treatment with average duration and cost, a model table across all tasks with Base, + AGENTS.md, and Delta, a per-task table with cost and duration per run, and an accuracy-against-cost chart in Mermaid that GitHub renders inline. An agent that runs out of time is a failure, as in Harbor's own metrics; any other runner error is discarded and the run is repeated. Transcripts and verifier output stay in the jobs directory.

The script passes `--max-retries 2`, which retries runner exceptions such as sandbox allocation or transport failures and never reruns a completed attempt whose verifier returned `0`. A scored failure stays `0/1`; run confirmations as separate jobs and record them separately.

When only a verifier changed after runs were scored, regrade instead of rerunning: `calibrate.sh --regrade <env-file> <jobs-dir> <task-dir>...` runs Harbor's [`harbor job regrade`](https://docs.harborframework.com/jobs/regrade) on each finished job with the current verifier, on the recorded patch and without agent cost, and writes the results under `<jobs-dir>/_regraded`, which the report prefers. A change to the instruction or fixture needs new runs.

## Run optional context treatments

Harbor runs the base task as committed. `TREATMENT=agents-md evals/agent-build/tools/calibrate.sh ...` runs a generated copy whose fixture also has the standard Next.js `AGENTS.md`, the same text as the `agent-eval` `agents-md` variant, and a `CLAUDE.md` that imports it. The instruction, verifier, model, effort, and runtime stay identical, jobs get an `__agents-md` suffix, and the report labels those rows `· AGENTS.md`. Never commit the generated copy as a second task. Suites for other frameworks can omit the treatment or define one for their own documentation.
