# Eval metrics

Run an eval with `--metrics` to keep its generated app and collect effort and
page measurements alongside the normal pass/fail result:

```bash
pnpm eval agent-062-pokedex-dev-loop \
  --variant baseline --variant skills --metrics \
  --agent vercel-ai-gateway/codex \
  --model 'openai/gpt-6-sol?reasoningEffort=high' \
  --pricing /path/to/sol-pricing.json
```

Both variants use the same model, prompt, tools, and grader. Browser use is
optional for the baseline. Only `skills` installs Next Dev Loop. The fixture
pins Next.js 16.4.2 with Cache Components and Partial Prefetching enabled.
This measures explicit Skill use, not discovery.

`--metrics` currently supports one fixture with a collector configured in
`eval.config.json`. Unrelated evals keep their existing behavior. The Pokédex
collector uses Vercel Sandbox and needs short-lived Sandbox credentials. Run
through the [normal eval setup](../README.md#one-time-setup).

## Results

The runner saves its usual result, transcript, and generated `project/` under
`evals/results/<variant>/<timestamp>/<eval>/run-<n>/`. Metrics add:

| File                 | Contents                                                                               |
| -------------------- | -------------------------------------------------------------------------------------- |
| `metrics.json`       | Success, tokens, coding time, runner time, estimated model cost, and page measurements |
| `measurements.json`  | Every Lighthouse sample and page median                                                |
| `measurement.tgz`    | Full page reports                                                                      |
| `metrics-error.json` | Collection failure, when present                                                       |

Input tokens include cached reads. Supply the matching model's Gateway
`pricing` object in `--pricing` to estimate cost. Without prices, cost stays
empty. Estimates exclude Sandbox and serving costs. Coding time excludes
setup, grading, and page collection; runner time includes setup and grading.
Missing evidence stays empty. Failed attempts retain their effort and score.

The Pokédex collector measures six production URLs behind HTTPS and compression,
with warm server caches and three mobile Lighthouse samples per URL. It records
LCP, CLS, main-thread blocking, JavaScript and total transfer, and automated
accessibility. No deployment is needed. These are lab samples, not field Core
Web Vitals or a complete UX review. Review the finished apps and transcripts.

## Retry measurements

Retry a collector against a saved normal run without another coding attempt:

```bash
node --env-file=/path/to/sandbox.env --import=tsx \
  evals/metrics/report.mjs collect \
  evals/results/skills/<timestamp>/agent-062-pokedex-dev-loop/run-1 \
  pokedex /path/to/sol-pricing.json
```

The fresh Sandbox receives the saved app and public task data, without model
credentials. Collection errors do not change the eval's pass/fail result.

Export a combined report:

```bash
node evals/metrics/report.mjs report evals/results
```

Historical comparisons in the PR used the earlier runner. Keep those results
and their recorded settings; they do not measure this revised integration.

## Add a collector

Add a module exporting `collect(runDirectory)` under `evals/metrics/` and set
the fixture's `metrics` field to its filename without `.mjs`. Read the saved
`project/` and write measurements beside `result.json`. Keep the normal grader
responsible for pass/fail. The shared effort parser and report command can be
reused across collectors.
