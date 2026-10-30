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
finished interaction by hand as well. These checks do not measure visual
quality, field performance, or Vercel serving costs.

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
before the coding agent starts. A setup failure is not a model result.
