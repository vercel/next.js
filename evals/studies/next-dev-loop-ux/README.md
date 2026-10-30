# Compare Next Dev Loop on a browsing task

[`agent-062-catalog-browsing-ux`](../../evals/agent-062-catalog-browsing-ux)
asks an agent to finish a shop's search, filters, and product navigation.
Compare the delivered experience and the effort needed to build it with and
without [`next-dev-loop`](../../../skills/next-dev-loop/SKILL.md).

## Run the comparison

Follow the [eval setup](../../README.md#one-time-setup), then run:

```bash
pnpm eval agent-062-catalog-browsing-ux \
  --variant baseline --variant skills --runs 3
```

For this fixture, **both conditions include the same AGENTS.md docs pointer**,
Playwright, agent-browser 0.31.1, and the same server-start instruction. `skills`
also installs Next Dev Loop from the checkout. The shared prompt asks the agent
to use it when installed. This measures explicit use, rather than discovery.
Skip `agents-md`, which duplicates the control condition here.

Use the same model, Next.js build, limits, and number of attempts. Record the
checkout SHA and resolved agent/model versions with the results. The wrapper
selects the model in `run-evals.js`; check that choice and the run budget before
launching. Use a dedicated, spend-limited model key. Keep infrastructure
failures separate from scored attempts.

`publish: false` keeps this study out of the public model leaderboard.

## Read the results

`EVAL.ts` builds the app separately from the agent's running dev server and
checks the production app in Chromium. It controls catalog responses to check
loading and focus, outdated responses, empty results, retry, and keyboard
navigation back to the selected search and category. It grades behavior, not
the choice of APIs or tools.

Report checks passed alongside input/output/cache tokens, cost, and elapsed
agent time for every attempt. Keep verifier and setup time separate. Use the
[saved transcripts](../../README.md#running) to review whether verification
caught a problem, what needed rework, and what the agent missed. Review the
finished interaction by hand as well, including loading transitions, narrow
layouts, keyboard use, and recovery from errors.

After the behavior checks, the verifier collects three Lighthouse 13.6.0
samples of `/products` in separate Chromium sessions. It uses the production
build, real catalog API, and Lighthouse's simulated mobile profile. The
`CATALOG_UX_METRICS` record in `outputs/eval.txt` retains every sample, browser
version, measurement settings, and any measurement errors.

| Measurement     | What to report                                                            |
| --------------- | ------------------------------------------------------------------------- |
| Agent effort    | Input, cached input, output tokens, model cost, and agent time            |
| App performance | Median LCP, CLS, TBT, JavaScript transfer bytes, and total transfer bytes |
| Accessibility   | Automated score and failed checks, alongside keyboard and human review    |

Run samples serially on comparable machines. Keep failed attempts and their
spending visible. A missing measurement is not zero, and performance numbers
do not change the behavior score. These are page-load lab measurements, not
field Core Web Vitals, INP, interaction quality, or Vercel serving costs. See
[Lighthouse's guidance on variability](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md).

For Codex runs, export a report from the saved results:

```bash
node evals/studies/next-dev-loop-ux/report.mjs <results-directory> [pricing.json]
```

The optional pricing file contains the selected model's `pricing` object from
the [Gateway models endpoint](https://ai-gateway.vercel.sh/v1/models). Cost is
an estimate from per-request tokens and the recorded prices, not a billing
receipt. Cached input is included in the input total and priced separately.
The report uses transcript timestamps for agent time when available and records
full run time separately. Codex CLI streams without timestamps leave agent
time empty. Their aggregated usage uses base-rate cost estimates because
per-request pricing tiers cannot be recovered. Review paired attempts before attributing a difference to
the Skill.

## Validate the task without a model

Run from the repository root. The reference patch stays outside the fixture,
so the coding agent never receives it.

```bash
study="$PWD/evals/studies/next-dev-loop-ux"
fixture="$PWD/evals/evals/agent-062-catalog-browsing-ux"
scratch="$(mktemp -d)"
cp -R "$fixture/." "$scratch/"
cd "$scratch"
npm install
npx playwright install chromium
npx vitest run --config "$study/vitest.config.mjs"
# The starting app should fail the browsing checks.
git apply "$study/reference.patch"
npx vitest run --config "$study/vitest.config.mjs"
# The reference should pass. Remove the scratch directory when finished.
```

This local check uses the fixture's pinned npm version. `pnpm eval` replaces
it with the local Next.js build. The Skill setup checks MCP and browser access
before the coding agent starts. A setup failure is not a model result. Use
Node.js 22.19 or later for Lighthouse. Set `CATALOG_UX_MEASURE=0` when checking
only verifier behavior, so each local test does not repeat the performance
measurement.
