# bench/deopt — catch V8 deopt scenarios in Next.js runtime code

Runs a real built Next.js app in an actual headless Chrome with V8 logging
enabled, then reports deoptimizations and polymorphic/megamorphic inline
caches in the code you care about — remapped to the TypeScript sources in
`packages/next/src`. The raw `v8.log` artifact opens in the
[Deopt Explorer](https://devblogs.microsoft.com/typescript/introducing-deopt-explorer/)
VS Code extension for interactive deep analysis (map evolution, IC decorations).

Accuracy over speed: no stubs, no synthetic environments. Scenarios drive the
real UI of a real app, so findings reflect the object shapes production
actually sees. This is a deliberate tool for hot-path work, not a per-PR
check.

## Quick start

```bash
pnpm build   # the fixture builds against packages/next/dist

pnpm bench:deopt --scenario segment-cache
```

Sample output:

```
Findings (112 matching filters, 439 total):
  deopt-eager: 7
  ic-megamorphic: 1
  ...

Artifacts: bench/deopt/artifacts/segment-cache-20260724-111323
  summary.md    human-readable report
  findings.txt  stable snapshot-style list
  v8.log        open in VS Code: "Deopt Explorer: Open V8 Log"
```

## CLI

```bash
pnpm bench:deopt --scenario <name> [options]      # run bench/deopt/scenarios/<name>
pnpm bench:deopt --entry <script.mjs> [options]   # run any Node script under V8 logging
```

| Option            | Meaning                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `--filter <s>`    | Only report findings whose source path contains `<s>` (repeatable; defaults to the scenario's filter list)  |
| `--all`           | Ignore filters, report everything                                                                            |
| `--fail-on <c>`   | Exit non-zero on a matching finding: `deopt`, `megamorphic`, `polymorphic`, `soft-deopt`, `lazy-deopt`       |
| `--chrome <path>` | Chromium executable (defaults to Playwright's install; `CHROME_PATH` also works)                             |
| `--force-build`   | Rebuild the fixture app even when the build cache is fresh                                                   |
| `--out <dir>`     | Artifacts directory (default `bench/deopt/artifacts/<scenario>-<time>`)                                      |

Browser mode is for client code (its real environment is Chrome). `--entry`
node mode is for server-side code (its real environment is Node) — same
flags, same report.

## How it works

1. `next build` the scenario's fixture app (cached on fixture hash + next
   version + a fingerprint of `packages/next/dist`, so rebuilding Next.js
   invalidates it), `next start` it in a child process.
2. Launch headless Chromium via Playwright with
   `--no-sandbox --js-flags="--log-deopt --log-ic --log-maps ..."` — the same
   flag set `dexnode` uses. Every Chrome isolate writes its own log; a
   sentinel script injected into the page identifies the renderer that ran
   the scenario.
3. Run the scenario's `drive()` — a plain Playwright interaction script.
4. Parse the renderer log: `code-deopt` events are parsed in-house
   (dependency-free); IC analysis uses `v8-deopt-parser` best-effort.
5. Remap positions and function names to original sources via the served
   chunk sourcemaps (`productionBrowserSourceMaps: true` in the fixture) —
   minified `e`/`d` names come back as `isValueExpired` etc. via the
   function's definition position.

## Writing a scenario

A scenario is a directory under `scenarios/` with a `scenario.mjs`:

```js
export default {
  type: 'browser',
  app: 'app', // optional: a Next.js fixture app to build + serve
  filter: ['client/components/segment-cache'], // default report filters
  async drive({ page, baseURL, scenarioDir }) {
    // Plain Playwright. Interact through the UI only — never reach into
    // Next.js internals; the fixture + driver should survive any refactor.
  },
}
```

Guidelines:

- **Warm up first.** Deopts only happen in *optimized* code; run the workload
  once before the iterations that matter so functions tier up.
- **Assert the workload worked** (e.g. count prefetch requests via
  `page.on('request')`). A workload that silently stops exercising the target
  code reports a misleading zero.
- **One configuration per fixture.** Want webpack, different flags, etc.?
  That's a new fixture, not a runner option.
- The fixture must set `productionBrowserSourceMaps: true` for remapping.

## Interpreting findings

Ordered by severity in `summary.md`:

- **`deopt-eager` / `wrong map`, `wrong call target`** — optimized code
  observed an object shape it didn't expect. The classic fixable hazard:
  same-looking objects constructed with different hidden classes.
- **`ic-megamorphic`** — a property access site saw 4+ shapes and fell off
  the IC fast path permanently. Fixable by making the objects monomorphic.
- **`deopt-eager` / `Insufficient type feedback ...`** — a one-shot warmup
  artifact (optimized before enough feedback existed), and the run-to-run
  unstable class of findings. The reporter classifies these as `info`, not
  `high`, for exactly that reason.
- **`ic-polymorphic`**, **`deopt-lazy`**, **`deopt-dependency-change`**, OSR
  deopts — informational. Lazy/dependency-change deopts are often GC/map-
  deprecation mechanics, not something you fix directly.

Run-to-run variance is real (GC timing, tiering heuristics): treat the union
of a couple of runs as the finding set, and confirm a fix by the specific
finding disappearing, not by counts.

For deeper analysis, open `artifacts/<run>/v8.log` in VS Code via the Deopt
Explorer extension ("Deopt Explorer: Open V8 Log"). Note it shows positions
in the served (minified) chunks; `summary.md` is the source-mapped view.

## The triage loop

The repeatable fix workflow lives in the `$deopt-triage` skill
(`.agents/skills/deopt-triage/SKILL.md`): run the tool, group findings into
root-cause tasks in `bench/deopt/triage/<scenario>.md`, fix the mechanical
ones (draft PR with before/after findings diff), write analysis +
recommendation for the non-trivial ones. The triage file is the durable
state — any future session resumes from it.

Measured stability of `findings.txt` (the basis for that loop): 94 of 95
lines identical across three independent runs; the flaky class is
`Insufficient type feedback` warmup deopts. It's deliberately stable and
diffable — deduped by `(severity, category, module, function, detail)` with
no positions, counts, or timestamps — so it can also serve as a checked-in
snapshot of known deopt cases later: a PR that introduces a new one must
update the snapshot or fix it. Module allow/denylists map onto `--filter`.
