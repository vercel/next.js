---
name: next-browser-initial-load-optimizer
description: >
  Reduce browser initial-load JavaScript, CSS, fonts, and assets in Next.js
  applications using the experimental-analyze CLI. Use for bundle-size audits,
  slow initial routes, interaction-gated lazy loading, duplicate React or npm
  packages, oversized Client Component boundaries, browser-side Markdown/MDX
  parsing, broad imports, locales, icons, editors, charts, and polyfills.
---

# Browser initial-load optimizer

Use this skill to reduce what the browser must load for a route before the user
needs it. Work one route and one measured candidate at a time. Establish a
production-analysis baseline, inspect why the code is present, make the smallest
behavior-preserving change, regenerate analyzer data, and keep only changes that
improve the intended signal.

Run the workflow autonomously. Ask the user only when optimization requires a
product decision: changing visible behavior, interaction timing, supported
locales/languages, offline behavior, trust boundaries, or dependency
compatibility.

## Guardrails

- Optimize **initial browser work**, not total package size in isolation.
- Treat analyzer compressed sizes as independently compressed attribution
  estimates, not network-transfer measurements.
- `loadScopes` are graph reachability, using exact route entries when the
  artifact provides them and an explicitly labeled heuristic fallback for older
  artifacts. They do not prove request timing; source and browser behavior do.
- Never move code behind a dynamic boundary when it is already `async`.
- Inspect source before narrowing a namespace or moving work server-side.
  Runtime lookup, enumeration, live editing, or local-only data may require it.
- Preserve accessibility, loading and error states, authorization, sanitization,
  direct visits, and interaction behavior.
- Do not force dependency overrides across incompatible ranges or peer
  dependencies merely to remove a duplicate.
- Do not manufacture work when no material candidate exists.
- Source-level cleanup, including changing a value import to `import type`, may
  have **zero bundle impact** when the bundler already removes it. Never claim a
  win from the source diff; compare analyzer output.

## 1. Establish the baseline in output mode

Use the project's package manager. The examples use pnpm; translate
`pnpm exec next` to `npx next`, `yarn next`, or `bunx next` as appropriate.

Confirm that the installed Next.js exposes the required analyzer fields:

```bash
pnpm exec next experimental-analyze --help
pnpm exec next experimental-analyze query --help
```

Stop and report the version prerequisite if `query --help` or the
`get_route_modules.loadScopes` input is absent. Do not approximate this
workflow with the analyzer HTML alone.

For an automated agent, **always default to `--output`**:

```bash
pnpm exec next experimental-analyze --output \
  --baseline-name initial-load-before
```

This performs the production analysis, writes queryable artifacts under
`.next/diagnostics/analyze`, and exits cleanly. It does not start a server, so
there is no port to coordinate and no file server to shut down.

Run `pnpm exec next experimental-analyze` without `--output` only when a human
or browser-driving agent explicitly needs interactive visual exploration. That
optional server mode stays open by design; it is not the automated workflow.

## 2. Query cookbook

### Route totals

Rank client route totals and save the baseline snapshot ID returned by
`get_app_overview`:

```bash
pnpm exec next experimental-analyze \
  query get_app_overview \
  --input '{"environment":"client","metric":"compressed","limit":500}'
```

If the user named routes, optimize those. Otherwise start with the largest
meaningful application route. Asset-like and framework routes are evidence to
understand, not automatic targets.

### Initial-scope modules and package attribution

For each target route, begin with package grouping restricted to initial client
reachability:

```bash
pnpm exec next experimental-analyze \
  query get_route_modules \
  --input '{
    "route":"/dashboard",
    "environment":"client",
    "loadScopes":["initial"],
    "groupBy":"package",
    "metric":"compressed",
    "limit":500
  }'
```

Change `groupBy` to `source` to list individual initial-scope modules. Use
`--all` for the complete bounded result and `--fields` when only a few row facts
are needed; do not manually loop offsets:

```bash
pnpm exec next experimental-analyze \
  query get_route_modules \
  --all \
  --fields key,compressedSize,loadScopes,chunkCount \
  --input '{
    "route":"/dashboard",
    "environment":"client",
    "loadScopes":["initial"],
    "groupBy":"source",
    "metric":"compressed"
  }'
```

Rank candidates using
all of:

- estimated initial client contribution;
- share of the route and repetition across routes;
- parse/execute cost, not bytes alone;
- whether the feature is visible or usable before interaction;
- correctness risk, especially duplicate runtimes.

There is no universal byte threshold. Ignore trivial churn unless a duplicate
creates correctness risk or repeats across many routes.

Drill from package to source paths, then explain a representative large source:

```bash
pnpm exec next experimental-analyze \
  query get_route_modules \
  --input '{
    "route":"/dashboard",
    "environment":"client",
    "loadScopes":["initial"],
    "groupBy":"source",
    "search":"node_modules/<package>",
    "limit":500
  }'

pnpm exec next experimental-analyze \
  query explain_route_module \
  --input '{
    "route":"/dashboard",
    "environment":"client",
    "sourcePath":"<exact sourcePath from the prior result>",
    "maxDepth":25
  }'
```

When `chunkCount` matters, enumerate the selected source's exact emitted outputs
instead of expecting chunk names inline on every module row:

```bash
pnpm exec next experimental-analyze \
  query get_source_chunks \
  --all \
  --input '{
    "route":"/dashboard",
    "sourcePath":"<exact sourcePath>"
  }'
```

### Reverse import edges and counterfactuals

Run reverse-edge analysis **before editing**. Start with
`explain_route_module` to select an exact `moduleIdent` and, when relevant, a
`routeEntryId`. Use its project importer and client-boundary evidence to find
the source that must be inspected; do not choose a boundary from package name
or size alone.

Then ask the CLI for the complete synchronous predecessor graph. This graph is
the factual representation of every synchronous path keeping the selected
module initial; SCCs represent cycles without enumerating path arrays:

```bash
pnpm exec next experimental-analyze \
  query get_initial_import_graph \
  --input '{
    "route":"/dashboard",
    "environment":"client",
    "sourcePath":"<exact sourcePath>",
    "moduleIdent":"<selected moduleIdent>",
    "routeEntryId":"<selected routeEntryId>"
  }'
```

Use each edge's `targetRemainsInitial` and `leavingInitial*` fields to rule out
false positives caused by alternate synchronous paths. Before editing a
promising edge, request its full source/package impact:

```bash
pnpm exec next experimental-analyze \
  query analyze_import_edge \
  --all \
  --input '{
    "route":"/dashboard",
    "sourcePath":"<exact sourcePath>",
    "moduleIdent":"<selected moduleIdent>",
    "routeEntryId":"<selected routeEntryId>",
    "edgeId":"<edgeId from get_initial_import_graph>",
    "granularity":"source"
  }'
```

The CLI owns reachability, SCC, edge-cut, and byte calculations. The agent owns
the judgment about whether the reported edge is an appropriate product and
source boundary to change.

### Baseline comparisons

After generating an `initial-load-after-*` snapshot, compare route totals:

```bash
pnpm exec next experimental-analyze \
  query compare_bundles \
  --input '{
    "baselineSnapshot":"<saved baseline snapshot ID>",
    "comparisonSnapshot":"current",
    "granularity":"route",
    "environment":"client",
    "metric":"compressed",
    "limit":500
  }'
```

For package or source attribution, set `granularity` to `package` or `source`
and pass the target `route`. For lazy-loading proof, query source granularity
with `"scopeTransition":"initial-to-async"`; do not manually compare two scope
lists:

```bash
pnpm exec next experimental-analyze \
  query compare_bundles \
  --all \
  --input '{
    "baselineSnapshot":"<saved baseline snapshot ID>",
    "comparisonSnapshot":"current",
    "granularity":"source",
    "route":"/dashboard",
    "environment":"client",
    "scopeTransition":"initial-to-async"
  }'
```

The CLI returns the transition and aggregate totals directly.

## 3. Evaluate opportunities

### A. Interaction-gated heavy code

Candidate shape:

- a large editor, chart configurator, map, PDF viewer, media tool, or dialog is
  `initial`;
- source shows it is rendered only after click, focus, expansion, or another
  explicit interaction;
- the initial UI does not need the implementation to preserve layout or meaning.

Move the implementation behind a conditional dynamic boundary. Keep the trigger
and stable placeholder in the initial chunk:

```tsx
'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

const Editor = dynamic(() => import('./editor'), {
  ssr: false,
  loading: () => <EditorSkeleton />,
})
const preloadEditor = () => import('./editor')

export function EditControl() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open editor</button>
      {open ? <Editor /> : null}
    </>
  )
}
```

Use `ssr: false` only in a Client Component and only when the implementation
requires browser APIs. Omit it when server rendering is supported and useful.
Keep a stable loading surface to avoid layout shift.

Consider intent preloading only after the lazy boundary is correct:

```tsx
<button
  onPointerEnter={() => void preloadEditor()}
  onFocus={() => void preloadEditor()}
  onClick={() => setOpen(true)}
>
  Open editor
</button>
```

Hover/focus preload is appropriate when intent strongly predicts activation.
Idle preload is more speculative: account for Save-Data, slow connections,
battery/data cost, and competition with more important work. Do not preload so
eagerly that the optimization becomes an initial request again.

**Verification:** regenerate output and require the heavy sources to lose
`initial` and gain `async`. Total route attribution may stay unchanged because
the code still exists eventually; that is not a failed lazy-loading change.
Drive the trigger and verify loading, focus, keyboard access, error handling, and
feature behavior.

### B. Duplicate browser package versions

Package grouping intentionally combines versions, so inspect source paths and
the package manager graph. pnpm virtual-store paths contain versions; for npm or
Yarn, pair analyzer paths with the lockfile/package manager:

```bash
pnpm why <package> -r
# or: npm ls <package> --all
# or: yarn why <package>
```

Prioritize:

1. multiple browser-initial copies of `react`, `react-dom`, styling runtimes, or
   state singletons that can cause correctness failures;
2. duplicate versions in the same semver major, where parent upgrades or range
   alignment are often low risk;
3. large repeated libraries across initial chunks.

Before changing anything, prove that distinct versions are present in
`loadScopes: ["initial"]`; repeated module identities, client/server variants,
or conditional exports are not automatically duplicate shipped bytes.

Prefer, in order:

1. align direct dependency ranges;
2. upgrade the parent dependency that pins the older version;
3. fix an incorrect dependency versus peerDependency declaration when you own
   the package;
4. use package-manager dedupe;
5. use an override/resolution only after confirming API and peer compatibility.

For React, also verify framework compatibility and hooks/hydration behavior.
Never force a cross-major consolidation merely because the names match.

**Verification:** regenerate output, confirm one intended version remains in
initial client source paths, confirm client bytes decrease, run the relevant
unit/integration/browser suite, and inspect the lockfile diff for unrelated
churn.

### C. Server-capable work inside a client boundary

Look for heavy pure computation pulled through `nearestClientBoundary`, notably:

- Markdown/MDX parsing, syntax highlighting, and sanitization;
- date/number formatting with locale registries;
- CSV, PDF, document, or diagram parsing;
- schema validation and code generation;
- search indexing and large static-data normalization;
- HTML generation that does not depend on browser state.

For display-only Markdown, strongly prefer parsing/rendering in a Server
Component or server function and send rendered React/serialized sanitized
output to the interactive island. Keep sanitizer policy on the trusted side of
the boundary. Do not send unsafe HTML merely to remove parser JavaScript.

Do **not** blindly move live editor preview, offline/local-only files, private
browser data, or per-keystroke computation to the server. Instead consider:

- server-rendering the initial/display view;
- lazy-loading a client parser only when edit mode opens;
- choosing a smaller client parser or constrained language set;
- splitting static chrome from the interactive island.

**Verification:** require the package to disappear or materially shrink in
client results, while server rendering, sanitization, hydration, and interaction
continue to work correctly.

### D. Other high-value patterns

Inspect these only when analyzer evidence ranks them materially:

- route/page/layout-level `'use client'` boundaries that can move to a leaf;
- root/barrel/namespace imports of icon, locale, language, chart, or editor
  registries when runtime enumeration is not required;
- large static JSON/data imported into client modules;
- Node polyfills or compatibility shims caused by a browser import;
- route-specific code imported by a shared layout;
- global CSS, fonts, images, WASM, and other assets loaded before the route needs
  them;
- side-effectful packages that block tree shaking;
- the same expensive initial dependency repeated across routes instead of being
  removed, narrowed, or deliberately shared.

Assets need a separate factual pass. Query actual emitted outputs rather than
interpreting source-level `asset` attribution as filenames:

```bash
pnpm exec next experimental-analyze \
  query get_route_outputs \
  --all \
  --fields filename,kind,compressedSize,outputCount \
  --input '{
    "route":"/dashboard",
    "kinds":["css","font","image","media"],
    "groupBy":"file",
    "metric":"compressed"
  }'

pnpm exec next experimental-analyze \
  query get_css_assets \
  --all \
  --input '{"route":"/dashboard"}'
```

`emissionEvidence` and CSS output-reference evidence are build facts.
`requestEvidence: "unknown"` means the CLI has not observed a browser request.
Whether a file was requested during cold initial navigation remains separate
browser network evidence, tabled from this workflow.

Do not maintain a generic package deny list. Tie every recommendation to
measured route evidence and inspected source behavior.

## 4. Change one thing and prove it

For each candidate:

1. Record route, snapshot ID, package/source, initial scope, estimated bytes,
   project importer, client boundary, and source reason.
2. Add or identify behavior coverage for the affected route and interaction.
3. Make one minimal change.
4. Regenerate with a new baseline name:

   ```bash
   pnpm exec next experimental-analyze --output \
     --baseline-name initial-load-after-<change>
   ```

5. Query the affected route/source again.
6. For removal, server migration, narrowing, or deduplication, require a client
   byte reduction. For lazy loading, require the CLI's direct
   `initial-to-async` transition and verify the trigger.
7. When two distinct snapshots exist, use `compare_bundles` for route/package
   deltas and source scope transitions. Treat a source-only or
   type-only edit with no analyzer delta as no bundle win.
8. Run targeted behavior tests and the narrowest relevant type-check. The
   analyzer has already performed its own production analysis, so do not start
   another expensive full production build by default. Run one only when the
   change affects behavior the analyzer does not cover or project-specific
   verification requires it.
9. Revert the change if the intended signal does not improve or behavior is not
   preserved.

Avoid combining candidates before measurement; otherwise attribution is lost.
After each accepted change, use its output as the next baseline.

## 5. Report

Use this standard format for every accepted change:

```markdown
### <route> — <user-visible feature>

- Baseline: <snapshot ID; initial client bytes and/or load scope>
- After: <snapshot ID; initial client bytes and/or load scope>
- Delta: <absolute and percentage delta, or initial → async>
- Removed modules: <packages/source paths removed from initial scope, or none>
- Why: <reverse-edge evidence and inspected source reason>
- Change: <smallest behavior-preserving edit>
- Tests: <targeted tests and type-checks run>
- Unrelated blockers: <failures not caused by this change, or none>
```

Report only accepted changes and remaining material opportunities. Separate
**measurements** (bytes/scopes), **source facts** (interaction and imports), and
**heuristics** (entry/worker detection). Compressed attribution bytes estimate
independently compressed source contributions; they are **not observed network
transfer**. Use a cold-browser trace or HAR for actual transfer bytes and exact
request timing.

## Completion checklist

- [ ] The CLI exposes `query --help` and `loadScopes`.
- [ ] A named production-analysis baseline exists.
- [ ] Target routes were queried with `environment: client` and `initial` scope.
- [ ] Reverse import edges were inspected before editing, and every changed
      candidate has a project importer and source-backed reason.
- [ ] Already-async code was not wrapped in another dynamic boundary.
- [ ] Duplicate versions were confirmed in browser-initial paths and the package
      graph before consolidation.
- [ ] Server migration preserved live/local-only behavior and trust boundaries.
- [ ] Each change was measured independently and ineffective changes reverted.
- [ ] Targeted tests and the narrowest relevant type-check pass; any additional
      full production build has a specific justification.
- [ ] Final report distinguishes attribution estimates from observed transfer.

## Related skills

- `next-dev-loop` — browser-driven development feedback while changing the app.
- `next-cache-components-optimizer` — static App Shell and instant-navigation
  optimization; complementary to browser bundle reduction.
- `next-partial-prefetching-optimizer` — optimize what navigation prefetches
  before interaction.
