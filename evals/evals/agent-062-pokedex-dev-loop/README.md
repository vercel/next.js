# Build a Pokédex with Next Dev Loop

One eval asks the agent to build the [Pokédex from Nolan Lawson's study](https://github.com/nolanlawson/agent-framework-benchmark/tree/b95ada03930ca3670c8ff6377c3af815df0ac040)
with Next.js 16.4.2, Cache Components, and Partial Prefetching. Compare the
ordinary agent workflow with explicit use of `next-dev-loop`.

## Run

From the repository root, after the [eval setup](../../README.md#one-time-setup):

```bash
pnpm eval agent-062-pokedex-dev-loop --variant baseline --variant skills
```

The fixture uses the standard `PROMPT.md`, `EVAL.ts`, and `eval:setup` workflow.
Setup downloads the pinned specification, API data, and browser tests. It
installs the published Next.js version in `app/`; this comparison does not
use the locally packed framework build. Both conditions receive the same
bundled-docs pointer and browser tools. Only `skills` installs Next Dev Loop.
The baseline chooses whether to use the browser.

## Result

Each agent attempt produces one pass/fail result. Passing requires the pinned
Next.js version, both framework settings, and all 54 browser checks. Those
checks cover search, filters, sorting, pagination, and linked detail pages.
They are assertions within this task, not 54 separate evals.

`EVAL.ts` checks the generated app against a fresh copy of the pinned tests
and data. Agent edits to its visible tests do not change the grade. One helper
waits for streamed table headers before choosing the sort button.

The fixture has `publish: false`. It can be merged and run for Skill research
without exporting it to `next-evals-oss` or publishing leaderboard scores.

## Additional measurements

The [metrics comparison](../../studies/next-dev-loop-ux/README.md) uses this
same prompt and starting app to record tokens, time, model cost, and production
page measurements. These sit alongside the pass/fail result. Lighthouse
values are repeated lab samples, not pass thresholds. Review the finished
app and transcripts where visual quality or the agent's approach matters.
