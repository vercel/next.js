# Compare Next Dev Loop on Pokédex

Compare the effort and app quality produced with and without
[`next-dev-loop`](../../../skills/next-dev-loop/SKILL.md), using the
[Pokédex task from Nolan Lawson's study](https://github.com/nolanlawson/agent-framework-benchmark/tree/b95ada03930ca3670c8ff6377c3af815df0ac040).
The task asks agents to build search, filters, pagination, and linked detail
pages from a specification and pinned local API data.

The task uses the existing `@vercel/agent-eval` runner on Vercel Sandbox.
The source archive is pinned and checked before preparing each workspace.
The large upstream specification, data, and tests stay outside this repository.
This comparison is separate from `pnpm eval` and the published leaderboard.

## Task files

- `task/PROMPT.md`: the request sent to the agent.
- `task/app/`: the starting package and config, with Cache Components and
  Partial Prefetching enabled.
- `task/AGENTS.md`: the bundled-docs pointer shared by both conditions.
- `task.json`: upstream revision, archive checksum, model, and tool versions.
- `run.mjs`: prepares the task and runs one coding attempt.
- `verify.mjs`: checks the saved app against the original tests, then measures it.
- `report.mjs`: exports success, effort, and page measurements.

The agent receives the pinned upstream `template/` with `task/` overlaid on it.
This includes `SPEC.md`, design references, a local API, and acceptance tests.
The upstream reference app and performance collector stay outside its workspace.

## Compare the two conditions

Both conditions receive the same specification, acceptance tests, bundled-docs
pointer, browser tools, model, Next.js version, and coding time limit. Only the
treatment installs Next Dev Loop and asks the agent to use it. The baseline
chooses whether to use the browser. This measures explicit use of the Skill,
not whether an agent discovers it.

The comparison uses GPT-6 Luna with high reasoning effort, Next.js 16.4.2,
React 19.2.0, Codex 0.166.0, and agent-browser 0.31.1. Each condition has one
attempt with a 30-minute coding limit. The prompt asks the agent to keep Cache
Components and Partial Prefetching enabled and work until `npm test` passes.

The first recorded pair omitted Cache Components. Keep those results separate
from runs of the current task.

## Run the comparison

Install the repository dependencies with `pnpm install`. Supply a short-lived
`VERCEL_OIDC_TOKEN` for Sandbox and a spend-limited `AI_GATEWAY_API_KEY` in a
local environment file outside the repository. The key is used only by the
coding agent. The independent verifier receives no model credentials.

Run one attempt per condition, using a new output directory each time:

```bash
node --env-file=/path/to/evals.env --import=tsx \
  evals/studies/next-dev-loop-ux/run.mjs baseline \
  evals/results/pokedex-dev-loop-cc/baseline

node --env-file=/path/to/evals.env --import=tsx \
  evals/studies/next-dev-loop-ux/run.mjs skills \
  evals/results/pokedex-dev-loop-cc/skills
```

Each command downloads the pinned source, installs dependencies and API data,
then starts timing the agent. It saves the prompt, task settings, harness,
transcript, and generated app. The runner refuses to overwrite an attempt.
Keep infrastructure failures separate from scored attempts.

## Verify the saved apps

Run verification separately, so a collection failure can be retried without
another paid model attempt:

```bash
node --env-file=/path/to/evals.env --import=tsx \
  evals/studies/next-dev-loop-ux/verify.mjs \
  evals/results/pokedex-dev-loop-cc/baseline

node --env-file=/path/to/evals.env --import=tsx \
  evals/studies/next-dev-loop-ux/verify.mjs \
  evals/results/pokedex-dev-loop-cc/skills
```

The verifier copies only the generated `app/` into a fresh Sandbox with the
original template, data, and tests. It checks the installed Next.js version and
resolved config, then runs the upstream `npm test`: all 54 Playwright checks
must pass, with none skipped. Disabling Cache Components or Partial Prefetching
fails the task. Agent changes to tests and data do not replace these checks.
The upstream reference app was validated against the same 54 tests.

After successful acceptance checks, use `--metrics-only` to retry performance
collection without repeating acceptance tests.

Use upstream `bench/measure.mjs` to measure each production app, with three
mobile Lighthouse samples per URL across its six pages. Keep HTTPS,
compression, and warmed server caches consistent. In Sandbox, use `localhost`
on separate ports for the app and API because `/etc/hosts` is read-only. The
runs use Lighthouse 13.5.0, Playwright 1.64.1, Caddy 2.11.7, and
2-vCPU / 4-GB Sandboxes. No deployment is needed.

| Measurement     | What to report                                                              | Preferred direction           |
| --------------- | --------------------------------------------------------------------------- | ----------------------------- |
| Success         | Acceptance checks passed                                                    | Higher                        |
| Agent effort    | Input, cached input, output tokens, model cost, and agent time              | Lower for equivalent outcomes |
| App performance | LCP, CLS, TBT, JavaScript transfer bytes, and total transfer bytes per page | Lower                         |
| Accessibility   | Automated score and failed checks, alongside keyboard and human review      | Higher score, fewer failures  |

Run samples serially on comparable machines. Keep failed attempts and their
spending visible. A missing measurement is not zero. These are page-load lab
measurements, not field Core Web Vitals, INP, complete UX quality, or Vercel
serving costs. Small differences can be noise; see
[Lighthouse's guidance on variability](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md).

Read the transcripts and inspect the finished app before attributing a
difference to the Skill. Include the agent's own testing and browser checks in
its effort totals, even after its tests pass. Keep setup and independent
verification time separate. One pair does not establish the Skill's average
effect or reproduce the article's cross-framework rankings.

## Export the report

Each attempt directory contains:

- `result.json`: model, status, `agentSeconds`, and full runner `duration` in seconds.
- `transcript-raw.jsonl`: the Codex transcript and token usage.
- `verification.json`: `acceptanceExitCode` from the independent test run.
- `acceptance.json`: the upstream Playwright JSON report.
- `measurements.json`: upstream `measurement/results.json`, including every sample.

Retain the exact prompt, source revision, resolved tools, generated app, harness,
and full Lighthouse reports alongside them for review. Keep these run artifacts
outside the task definitions.

```bash
node evals/studies/next-dev-loop-ux/report.mjs \
  evals/results/pokedex-dev-loop-cc pricing.json
```

The optional pricing file contains the selected model's `pricing` object from
the [Gateway models endpoint](https://ai-gateway.vercel.sh/v1/models). Cached
input is included in the input total and priced separately. Codex CLI streams
aggregate API requests, so their cost uses base-rate estimates rather than
per-request pricing tiers. These estimates exclude Sandbox and serving costs.
Missing usage, timing, or measurements remain empty rather than zero.
