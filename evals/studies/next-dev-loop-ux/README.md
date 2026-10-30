# Compare Next Dev Loop on Pokédex

Compare the effort and app quality produced with and without
[`next-dev-loop`](../../../skills/next-dev-loop/SKILL.md), using the
[Pokédex task from Nolan Lawson's study](https://github.com/nolanlawson/agent-framework-benchmark/tree/b95ada03930ca3670c8ff6377c3af815df0ac040).
The task asks agents to build search, filters, pagination, and linked detail
pages from a specification and pinned local API data.

Keep the upstream source and data in a separate checkout. This study adds a
report exporter, not a fixture for `pnpm eval` or the published leaderboard.

## Compare the two conditions

Both conditions receive the same specification, acceptance tests, bundled-docs
pointer, browser tools, model, Next.js version, and coding time limit. Only the
treatment installs Next Dev Loop and asks the agent to use it. The baseline
chooses whether to use the browser. This measures explicit use of the Skill,
not whether an agent discovers it.

The recorded comparison uses GPT-6 Luna with high reasoning effort, Next.js
16.4.2, React 19.2.0, Codex 0.166.0, and agent-browser 0.31.1. Each condition has
one attempt with a 30-minute coding limit, using `@vercel/agent-eval` on Vercel
Sandbox. The shared prompt is:

> Implement the app described in SPEC.md using Next.js 16.4.2. Work autonomously
> until npm test passes. Keep the pinned Next.js version. All rendering, data
> fetching, routing and styling choices are yours within the specification.
> Start the local API with npm run api and the development server with npm
> --prefix app run dev at http://localhost:3100. Browser tools are installed.
> If the next-dev-loop Skill is installed, use it for this task. Otherwise use
> your usual workflow. Do not install additional Skills.

Prepare each agent workspace from upstream `template/`, without its Git
history, reference app, or performance collector. Download the pinned API data
and install dependencies before timing the agent. Use a spend-limited model
key. Keep infrastructure failures separate from scored attempts.

## Verify the saved apps

Copy only each generated `app/` into a fresh Sandbox containing the original
template, data, and tests. Run the upstream `npm test`: all 54 Playwright checks
must pass. Changes the agent made to tests or data must not replace the
independent checks. Validate the upstream reference app with the same tests.

Use upstream `bench/measure.mjs` to measure each production app, with three
mobile Lighthouse samples per URL across its six pages. Keep HTTPS,
compression, and warmed server caches consistent. In Sandbox, use `localhost`
on separate ports for the app and API because `/etc/hosts` is read-only. The
recorded runs use Lighthouse 13.5.0, Playwright 1.64.1, Caddy 2.11.7, and
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

Save each attempt in its own directory under `evals/results/pokedex-dev-loop/`:

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
  evals/results/pokedex-dev-loop pricing.json
```

The optional pricing file contains the selected model's `pricing` object from
the [Gateway models endpoint](https://ai-gateway.vercel.sh/v1/models). Cached
input is included in the input total and priced separately. Codex CLI streams
aggregate API requests, so their cost uses base-rate estimates rather than
per-request pricing tiers. These estimates exclude Sandbox and serving costs.
Missing usage, timing, or measurements remain empty rather than zero.
