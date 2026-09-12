# Deopt Explorer tooling for Next.js — Plan

Goal: a repeatable tool that catches V8 deoptimization scenarios (deopts,
polymorphic/megamorphic inline caches) in Next.js runtime code, with the
segment cache (`packages/next/src/client/components/segment-cache/`) as the
first target, but usable against any part of the codebase.

Guiding principle (per review): **accuracy over speed**. Client code runs in
an actual headless Chrome against a real built app — no stubs, no fake
environments, no coupling to internal module structure. This is not a
per-PR check; it's a tool you run deliberately when working on a hot path.

## Research findings (verified locally)

### The Deopt Explorer pipeline

[Deopt Explorer](https://devblogs.microsoft.com/typescript/introducing-deopt-explorer/)
is a VS Code extension that analyzes a `v8.log` produced by V8's logging
flags. The companion `dexnode` CLI simply picks flags per V8 version; for every
modern V8 the set is static, so our runner inlines it (no dependency):

```
--log-deopt --log-ic --log-maps --log-maps-details --log-code
--log-source-code --prof --detailed-line-info --logfile=<out>
```

### Verified: V8 logging works in headless Chromium via Playwright

Spike (Playwright `chromium.launch` with `--no-sandbox` and
`--js-flags=<the flags above>`, planted megamorphic-access page):

- Each Chrome process/isolate writes its own log
  (`isolate-<addr>-<pid>-v8-<pid>.log`; V8 expands `%p` in `--logfile` to the
  pid and prefixes the isolate id). The right log is trivially identified:
  it's the one whose `script-source`/`code-deopt` entries reference the app's
  URLs — the spike renderer log had 51k lines including all 5 planted deopt
  events; the other isolate had none.
- `code-deopt` events carry exact `url:line:col` + reason: the planted shape
  hazard reported `deopt-eager ... <page.html:2:29>, wrong map` — precisely
  the `return o.x` property access. ~10k IC transition events also present.
- `script-source` entries are captured (`--log-source-code`), so Deopt
  Explorer can display the code for served chunks.

Repo already has `playwright-core` + Chromium installs (used by the e2e
suite), so browser mode adds no new heavy dependency.

### Headless analysis (for repeatability)

Deopt Explorer itself is VS Code-only. For a _repeatable_ check the tool
parses the log itself:

- **`code-deopt` lines are trivially parseable in-house** (CSV-ish with
  inline position + reason). Primary signal, zero dependencies.
- **`v8-deopt-parser`** (0.4.3, from `v8-deopt-viewer`) still parses modern
  logs despite noisy per-line errors on some IC entries: it correctly
  returned all planted deopts and attributed the megamorphic IC site to the
  right function/file/line. Usable (stderr suppressed) for IC summaries;
  in-house IC parsing is the fallback if it degrades further.
- `deoptkit` (npm, v0.1.0, July 2026) claims to do all of this but is brand
  new with a single maintainer — noted as an option, not a dependency.

The VS Code extension remains the deep-dive UI: the tool's primary artifact
**is** the renderer `v8.log`, opened via "Deopt Explorer: Open V8 Log" (map
evolution views, IC decorations, hover details come for free).

### Node mode (verified, secondary)

The same flag set on plain `node` produces the same events (verified on
v20.19.2). Kept as a secondary mode so the tool also covers server-side code
(`--entry <script>` under `next start`-style workloads, jest-free) — but
client code always goes through real Chrome.

## Design

New private package: **`bench/deopt/`** (follows `bench/` conventions; root
script `pnpm bench:deopt`).

```
bench/deopt/
├── package.json          # private; deps: playwright-core, v8-deopt-parser
├── README.md
├── run.mjs               # CLI entry
├── src/
│   ├── chrome.mjs        # launch headless Chrome w/ --js-flags, pick renderer log
│   ├── node-host.mjs     # secondary: spawn node w/ same flags
│   ├── app.mjs           # build fixture (next build) + start server (next start)
│   └── report.mjs        # parse v8.log → summary.{json,md}; filter, sourcemap remap
├── scenarios/
│   ├── demo-deopt/                # planted deopt page; self-test for the pipeline
│   └── segment-cache/
│       ├── app/                   # real Next.js fixture app
│       └── drive.mjs              # Playwright interaction script
└── artifacts/<scenario>-<timestamp>/   # v8 logs + summaries (gitignored)
```

### How a browser scenario runs

1. **Build**: `next build` the scenario's fixture app (prod — dev mode would
   distort the profile with HMR and unoptimized React). Build is cached keyed
   on fixture hash + next version. `productionBrowserSourceMaps: true` in the
   fixture config so served chunks have adjacent `.map` files.
2. **Serve**: `next start` in a child process (not V8-logged).
3. **Drive**: launch headless Chromium via Playwright with
   `--no-sandbox --js-flags=<v8 logging flags>` and run the scenario's
   `drive.mjs` — a plain Playwright script (navigate, reveal links to trigger
   segment-cache prefetches, client-side navigations, back/forward, repeat).
   The driver is pure user-level interaction: zero coupling to Next.js
   internals. Warmup loop first (deopts only occur in _optimized_ code), then
   the measured workload.
4. **Collect**: pick the renderer isolate log (the one referencing
   `localhost:<port>/_next/` scripts); archive it as the run artifact.
5. **Report**: parse deopts + ICs, remap chunk `url:line:col` →
   `packages/next/src/**/*.ts:line:col` through the served sourcemaps, filter
   to `--filter` (default for this scenario: `segment-cache`), group by
   function, order by severity.

### CLI

```bash
pnpm bench:deopt --scenario segment-cache
pnpm bench:deopt --scenario segment-cache --filter client/components
pnpm bench:deopt --scenario <name> --fail-on deopt --fail-on megamorphic
pnpm bench:deopt --entry ./some-server-script.mjs        # node mode
```

- `--filter <substring|glob>`: restrict findings by _original source_ path
  (post-remap), so "only segment-cache" or "only server/app-render" is one
  flag. Unfiltered report is always written too.
- `--fail-on deopt|megamorphic|polymorphic`: non-zero exit on matching
  findings — makes runs usable as a deliberate regression check (not wired
  to per-PR CI; accuracy > speed).
- Prints the artifact path + "open with Deopt Explorer: Open V8 Log" hint.

### Report content

Grouped by (original) function, ordered by severity:

1. **Eager deopts** (`wrong map`, `wrong call target`…) in optimized code —
   the "you built a shape hazard" signal.
2. **Megamorphic ICs** (sites that saw 4+ shapes).
3. Soft/lazy deopts and polymorphic ICs as informational.

Known-benign categories (e.g. lazy deopts from map deprecation during GC,
one-shot `Insufficient type feedback` during warmup) are documented in the
README and de-emphasized in the report so they don't get chased.

### Minified names caveat

Prod chunks are minified; raw findings say `function t at chunk-abc.js:1:812`.
The reporter remaps positions _and names_ through sourcemaps (`names` array),
so the summary reads `readSegmentCacheEntry at segment-cache/cache.ts:…`.
Inside the Deopt Explorer UI itself you're looking at chunk sources; the
reporter's remapped findings are authoritative.

### One configuration per fixture

The tool does not take bundler/env-flag variant switches. Each fixture is a
real app that explicitly declares its own configuration (`next.config.js`,
env in a fixture-level manifest if ever needed). If we later care about a
different configuration (webpack build, `__NEXT_CACHE_COMPONENTS`, etc.),
that's a new fixture — not a runner flag.

### The segment-cache fixture + driver

Fixture app: an app-router app with enough route-tree variety to exercise the
cache realistically — static + dynamic segments, parallel routes/slots,
interception routes (`nextUrl`), varied param shapes, `loading.js` PPR-ish
boundaries — and index pages containing many `<Link>`s (mix of
`prefetch={true}`/default/`false`).

Driver workload (all through the real UI):

- Reveal batches of links to enqueue many prefetch tasks (scheduler churn,
  cache-key creation, LRU inserts).
- Client-side navigations across the prefetched routes (cache reads,
  route-tree conversion), including repeat visits (cache hits) and
  back/forward (bfcache path).
- Enough distinct routes/params to force LRU eviction cycles.
- Loop the above; warmup pass first.

## Future workflow integration (out of scope for v1, shapes the output design)

Once the tool has been tried against the existing codebase, the likely
integration is a **checked-in snapshot of known deopt cases**: a text file in
the repo listing current findings. A PR that introduces a new deopt/megamorphic
site fails the check until the author updates the snapshot — so known/
intentional cases get recorded explicitly, and everything else is incentivized
to be fixed. Complemented by an **allowlist/denylist of modules** whose deopts
we care about (e.g. segment-cache, router, app-render hot paths) vs ones we
don't (dev-only code, error paths).

v1 doesn't build the check, but the reporter's output is designed for it:
alongside the human-readable `summary.md`, it writes `findings.txt` — a
stable, diffable representation deduped by
`(severity, kind, source module, function, reason)` with **no positions,
counts, or timestamps** (those churn across runs and unrelated edits). That
file is what a future snapshot workflow would check in, and the module
allow/denylist maps directly onto the existing `--filter` machinery.

## Implementation steps (each independently verifiable)

1. **Scaffold + Chrome host + demo scenario.** Verify: `pnpm bench:deopt
--scenario demo-deopt` finds the renderer log and the summary shows the
   planted deopt with correct file/line/reason; log opens in Deopt Explorer.
2. **Reporter: severity grouping, sourcemap remap, `--filter`, `--fail-on`.**
   Verify against demo scenario (remap through a minified+sourcemapped
   variant of the demo; `--fail-on deopt` exits 1).
3. **Fixture app + build/serve plumbing.** Verify: scenario builds, serves,
   and a trivial driver produces a renderer log referencing `_next/` chunks
   that remaps to `packages/next/src/**` locations.
4. **Segment-cache driver workload.** Verify the workload actually exercises
   the cache (assert via `window.next` router instrumentation or network
   assertions that N prefetches + M navigations occurred), then review the
   report + a Deopt Explorer pass over real findings.
5. **Docs + wiring.** `bench/deopt/README.md`, pointer from
   `bench/BENCHMARKING.md`, root `package.json` script, prettier/eslint
   pre-validation.

## Open questions

- Chromium source: reuse the repo's Playwright browser installs (spike used
  `chromium-1228` via `executablePath`) vs pinning a version in
  `bench/deopt`. Proposal: reuse repo installs; record the browser version in
  the run summary since V8 version affects findings.
- CI/snapshot integration explicitly out of scope for v1 (see "Future
  workflow integration"); `--fail-on` and `findings.txt` keep it possible.
