# Harbor format for Agent Build tasks

Tasks use the published [Harbor task format](https://docs.harborframework.com/tasks/overview), and its references for the [instruction](https://docs.harborframework.com/tasks/instruction), [configuration](https://docs.harborframework.com/tasks/configuration), [environment](https://docs.harborframework.com/tasks/environment), [solution](https://docs.harborframework.com/tasks/solution), and [verifier](https://docs.harborframework.com/tasks/verifier) are the source of truth. This file covers only what our tasks add on top of them.

Terminal-Bench, Harbor's own benchmark, sets the bar these steps follow in its [task rubric](https://github.com/harbor-framework/terminal-bench/blob/main/docs/prompts/task-proposal.md) and [contribution guide](https://github.com/harbor-framework/terminal-bench/blob/main/CONTRIBUTING.md). Read both before writing a task. The steps below add only what is specific to Next.js.

## Task layout

### How to read a task

1. `README.md`: why the task is hard and how each gate verifies it.
2. `instruction.md`: the only thing the agent sees.
3. `task.toml`: the `version`, the source findings under `[metadata]`, and the network and isolation settings.
4. `environment/fixture/`: the working app the agent starts from. `environment/Dockerfile` installs it from the lockfile and commits a git baseline the patch is diffed against.
5. `tests/test.sh`: the gates in order, starting with `check-source.mjs` for the stated constraints, then typecheck and build, the behavioral checks, and the server log.
6. `solution/`: the reference repair as files under `solution/files/`, copied by `solve.sh`. Read it after the verifier, so the checks are judged on their own.
7. `tests/bad-solutions/`: one script per shortcut, with the gate that catches it in the header and a README table.
8. `tests/known-good/`: reviewed passing solutions from screening and earlier runs, shaped differently from the reference.

### What our tasks add to Harbor

- **A separate, offline verifier.** `[verifier] environment_mode = "separate"` with `network_mode = "no-network"`, so the agent cannot read or edit the checks. The agent's work reaches the verifier only as `/tmp/agent.patch`, collected by `[[verifier.collect]]` and applied to a clean copy of the fixture. Because the verifier installs the committed lockfile offline, every instruction says not to change dependencies, and `check-source.mjs` fails a dependency change before anything else.
- **`tests/fixture/`** is a byte-identical copy of `environment/fixture/`, because the verifier image needs the baseline too. Copy it again after every fixture edit.
- **`tests/bad-solutions/` and `tests/known-good/`** hold known incorrect and known correct repairs. They are review material and never run during a trial.
- **Later changes.** When the instruction says the app changes after the agent is done, such as new content, `tests/before-build.sh` makes that change in the verifier before the build.
- **Compose files on Vercel.** The minimal `docker-compose.yaml` files select Harbor's Vercel Compose path, because Vercel Container Registry does not accept the dot in the `next.js` project slug. On Vercel, Compose supports `public` and `no-network`, not `allowlist`.
- **Pins.** Base images by digest, dependencies through committed lockfiles, and the verifier's browser through `tests/package-lock.json`. `harbor lint --select ALL` enforces them.

See also [running Harbor on Vercel Sandbox](https://vercel.com/kb/guide/run-terminal-bench-harbor-benchmarks-vercel-sandbox), [HarborHub](https://hub.harborframework.com/), and `harbor agent schema <agent>` for each harness's options.

## Versions

Bump the `version` in `task.toml` whenever the instruction, fixture, or verifier changes, so older trials are never compared with newer ones.

## How Harbor tasks map to agent-eval fixtures

The existing `agent-eval` fixtures and the Harbor tasks answer the same question with different plumbing. Use this table to translate between them. The `agent-eval` column is documented in [`evals/README.md`](../README.md).

| Concern            | `agent-eval` fixture (`evals/evals/*`)           | Harbor task (`evals/agent-build/*`)                                              |
| ------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| Prompt             | `PROMPT.md`                                      | `instruction.md`                                                                 |
| Starting app       | Fixture root                                     | `environment/fixture/`, built by `environment/Dockerfile` with a git baseline    |
| Checks             | `EVAL.ts`, Vitest in the agent's sandbox         | `tests/test.sh` plus Node and Playwright checks in a separate verifier container |
| Semantic criteria  | `toSatisfyCriterion` with a pinned judge model   | None yet; [Create a task](./CREATE.md#5-grade-behavior) covers when a judge fits |
| Settings           | `eval.config.json`, `eval.suites.json`           | `task.toml`                                                                      |
| Reference solution | None                                             | `solution/solve.sh` copying `solution/files/`                                    |
| Known-bad repairs  | None                                             | `tests/bad-solutions/`                                                           |
| Runner             | `run-evals.js` over `@vercel/agent-eval`         | Pilot: `harbor run` on Vercel Sandbox; `tools/calibrate.sh` for cohorts          |
| Context treatment  | `baseline` and `agents-md` variants, always both | Optional, defined by the runner, off by default                                  |
| Local validation   | `pnpm eval <name> --dry`                         | `tools/run-local.sh`                                                             |
| Publication        | `next-evals-oss` and nextjs.org/evals            | Not published; a separate decision after calibration                             |
