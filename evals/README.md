# Evals

Agent evals for Next.js. Each eval is a small Next.js app + a prompt + assertions. We run the prompt through a coding agent in a sandbox and check what it wrote.

The point: find places where agents get Next.js wrong because their training data is stale, then fix it by shipping better docs in the `next` package itself.

## How it works

The runner is [`@vercel/agent-eval`](https://github.com/vercel-labs/agent-eval). It spins up a sandbox (Vercel or local Docker), copies the fixture in, runs the coding agent against `PROMPT.md`, then executes `EVAL.ts` as a vitest file against whatever the agent wrote. The `PROMPT.md` / `EVAL.ts` / fixture-dir convention you'll see below is that package's convention — see its README for the full spec.

`run-evals.js` is a thin wrapper around it: pack the local `next` build into a tarball, generate the configured experiments, then invoke `agent-eval`. The two default experiments (`baseline` and `agents-md`) differ only in whether they drop an `AGENTS.md` pointing at the bundled docs. Everything from "spawn sandbox" onward is `@vercel/agent-eval`'s job.

## One-time setup

Vercel employees: request access to the `vercel-labs` team in Lumos, then:

```bash
# Vercel CLI, if you don't have it: npm i -g vercel
vc link       # at repo root, pick vercel-labs team
vc env pull   # writes .env.local to repo root
```

External contributors can run the same evals in local Docker with their own API key — see [Running without Vercel sandbox access](#running-without-vercel-sandbox-access).

## Writing an eval

Copy an existing fixture. Take the next free number — gaps are fine.

```bash
cp -r evals/evals/agent-034-async-cookies evals/evals/agent-042-your-thing
```

Then edit three files:

**`PROMPT.md`** — what you'd type into the agent. Write it like a real user would: describe the symptom or goal, not the API. "Navigating from `/a` to `/b` is slow, fix it" is a good prompt. "Use `instant`" is not — you're testing whether the agent understands the feature well enough to reach for it, not whether it can pattern-match a name you handed it.

**`EVAL.ts`** — vitest assertions against the app the agent wrote. Check source
for API contracts and use runtime assertions to verify rendered behavior.

```ts
import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf-8')

test('exports instant', () => {
  expect(page).toMatch(/export const instant\b/)
})
```

Runtime assertions can import `buildNextApp` and `startNextServer` from
`./__agent_eval__/next-test-utils.mjs`, which the runner copies into the sandbox.
Assertions run before the configured build script, so call `buildNextApp()` before
starting a production server. `startNextServer()` waits for a successful HTTP
response and returns `{ url, stop }`; call `stop()` in a `finally` block. Fixture
setup can use `{ mode: 'dev', port: 3100, detached: true, logFile: '/tmp/next-dev.log' }`
to leave a development server running for the agent.

Type-check the runner and assertions locally:

```bash
pnpm typescript --project evals/tsconfig.json
```

`evals/types` resolves sandbox-injected helpers to their source types. Each
fixture's application is checked separately during its build.

**`app/`** (or `pages/`) — the starting state. Give the agent something to edit, not a blank slate.

`package.json` needs a `build` script. `next.config.ts` and `tsconfig.json` stay unless your feature requires specific config.

If the agent needs prepared runtime state, add an `eval:setup` script. It runs after Next.js is installed and before the agent starts.

## Running

```bash
pnpm eval agent-042-your-thing
```

This runs the two default variants in parallel and prints pass/fail for each:

```
✗ baseline/agent-042-your-thing   (81s)
✓ agents-md/agent-042-your-thing  (200s)
```

`agents-md` drops an AGENTS.md into the sandbox telling the agent to check `node_modules/next/dist/docs/` first. `baseline` doesn't. That's the whole difference — same prompt, same model, one extra file. If `agents-md` passes and `baseline` doesn't, the bundled docs are doing their job.

### Evaluating a local skill

Docs can link to a canonical skill, but an unmerged skill revision isn't part of the `next` package tarball. To compare the current checkout's skill with the baseline and bundled-docs variants, add the fixture to `evals/eval.config.json`:

```json filename="evals/eval.config.json"
{
  "agent-046-adopt-partial-prefetching": {
    "skills": ["next-partial-prefetching-adoption"],
    "timeout": 1800
  }
}
```

The runner then adds a third `skills` variant for that fixture. It installs the listed directories from the local `skills/` folder before the coding agent starts, while keeping the prompt, app, and assertions identical. It does not also inject the `agents-md` instruction: the skill treatment measures whether the skill itself leads the agent to the canonical bundled guide. The optional timeout lets end-to-end workflows run longer than the 12-minute default. Fixtures without an entry continue to run only `baseline` and `agents-md`.

Browser-dependent fixtures declare `@playwright/test` in `dependencies` or
`devDependencies` in their `package.json`. The runner detects that dependency
and installs Chromium and its system libraries before the agent starts.

Fixtures opt into before/after JavaScript measurements with `"browserJs": true`
in `eval.config.json`. The runner adds measurement hooks only to experiments
containing those fixtures.

The dynamic-editor bundle-optimizer fixture measures cold Turbopack production
loads in headless Chromium before and after the agent runs. It uses
plain `next build`, disabled browser caching, and fresh browser contexts. Passing
requires fewer compressed JavaScript response-body bytes than the baseline and a
rounded byte budget of 200,000 bytes.

The editor must stay unloaded until interaction, preload on pointer hover, and
remain editable. CodeMirror responses are identified by its
`cm-content` runtime class.

`lib/next-test-utils.mjs` owns production builds and server cleanup.
Shared utilities in `lib/bundle-optimizer/browser-js.ts` handle browser cleanup,
cold-page measurement, byte summaries, and before/after eval results.
Content and interaction checks stay in each fixture's
`__eval__/measure-browser-js.ts`. `lib/bundle-optimizer/hooks.ts` runs the same assertions
before the agent starts and records their outcomes under `analysis.browserJs.before.checks`.
Expected optimization failures allow the agent run to proceed; build, browser,
and content failures stop setup. Per-request compressed and decoded sizes,
before/after totals, and bytes saved are recorded under `analysis.browserJs` in
`result.json`.

The SDK withholds `__eval__/` resources and `EVAL.ts` before creating the sandbox's
initial Git commit. The runner bundles the eval and its measurement imports into
one grader. Setup returns that grader and the baseline through validation-only
files and environment values; neither reaches the coding agent. The SDK restores
the grader after the agent completes, so app edits do not change validation.

A run takes ~2–5 min. To validate a fixture without executing:

```bash
pnpm eval agent-042-your-thing --dry
```

Use repeated runs when measuring behavior that may vary between agent runs:

```bash
pnpm eval agent-057-agent-feedback-anonymization \
  --variant agent-feedback \
  --runs 10
```

The runner sets `earlyExit: false` whenever `--runs` is greater than one, so
the result records a real pass rate. `--variant` isolates one generated
treatment when a full baseline comparison would add unnecessary cost.

Agent-feedback fixtures opt into an `agent-feedback` treatment in
`eval.config.json`. That treatment installs the managed block from the packed
Next.js build and uses the bundled reporting protocol. It makes only the remote
kill-switch result deterministic, keeping eval results independent from the
live rollout. Each run records the number of valid review payloads and their
trigger reasons in `result.json` under `analysis.agentFeedback`.

Full transcripts land in `evals/results/<variant>/<timestamp>/<eval>/run-1/`. Grep `transcript-raw.jsonl` to see exactly what the agent did.

## When to rebuild

`pnpm eval` packs `packages/next/dist/` into a tarball and ships that to the sandbox. It does not build. If you changed `packages/next/src/**` or `docs/**`, run `pnpm --filter=next build` first or the sandbox will see stale code. If you only changed fixture files, no rebuild is needed.

## Workflow

1. **Write the fixture.** `PROMPT.md` describes a user-facing problem. `EVAL.ts` asserts the API you expect the agent to reach for.

2. **Build Next.js.** `pnpm build`. The eval runner packs whatever is already in `dist/` — it won't build for you.

3. **Run it.** `pnpm eval <name>`. If the feature isn't in the agent's training data and isn't documented in `dist/docs/`, both variants fail. That's the expected starting point for a new feature.

4. **Write the doc.** Add an `.mdx` under `docs/`. Use `version: draft` in the frontmatter to keep it off nextjs.org while still bundling it into the package.

5. **Build again.** New doc needs to land in `dist/docs/` before the next pack sees it.

6. **Run it again.** `baseline` should still fail; `agents-md` should find the new doc and pass. Baseline staying red while agents-md flips green tells you the doc did it, not run-to-run noise.

7. **Commit the eval and the doc together.** The full suite gets pulled by the external benchmark runner and published to nextjs.org/evals. Keeping the fixture alongside the doc it validates means that score tracks over time as both the docs and the models change.

## Layout

```
evals/
├── eval.config.json # optional skill and timeout settings by fixture
├── evals/agent-*/   # fixtures
├── lib/bundle-optimizer/ # optimizer measurement and transcript hooks
├── lib/setup.ts     # uploads tarball, writes AGENTS.md (shared by all evals)
├── experiments/     # generated per-run, gitignored
├── .tarballs/       # packed next, gitignored
└── results/         # transcripts + outputs, gitignored
```

Sandbox tokens live in `.env.local` at the repo root (from `vc env pull`).

## Running without Vercel sandbox access

If you don't have Vercel credentials, `@vercel/agent-eval` falls back to local Docker — see [its direct API keys docs](https://github.com/vercel-labs/agent-eval#direct-api-keys-no-vercel-account-required) for the full list of supported env vars. Have Docker running and provide your own model key in `.env.local` at the repo root:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Then run `pnpm eval <name>` as normal. Docker pulls `node:24-slim` on first run. Tarball packing, both variants, and the results layout are identical to the remote path — `run-evals.js` doesn't know or care which sandbox backend got picked.
