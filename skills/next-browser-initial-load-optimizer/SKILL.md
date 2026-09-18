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
- `loadScopes` are graph-reachability heuristics. They do not prove request
  timing; source and browser behavior settle that.
- Never move code behind a dynamic boundary when it is already `async`.
- Inspect source before narrowing a namespace or moving work server-side.
  Runtime lookup, enumeration, live editing, or local-only data may require it.
- Preserve accessibility, loading and error states, authorization, sanitization,
  direct visits, and interaction behavior.
- Do not force dependency overrides across incompatible ranges or peer
  dependencies merely to remove a duplicate.
- Do not manufacture work when no material candidate exists.

## 1. Establish the baseline

Use the project's package manager. The examples use pnpm; translate `pnpm next`
to `npx next`, `yarn next`, or `bunx next` as appropriate.

Confirm that the installed Next.js exposes the required analyzer fields:

```bash
pnpm next experimental-analyze --help
pnpm next experimental-analyze --list-queries
```

Stop and report the version prerequisite if `--list-queries` or the
`query_bundle_sources.loadScopes` input is absent. Do not approximate this
workflow with the analyzer HTML alone.

Generate a named baseline from the application root:

```bash
pnpm next experimental-analyze --output \
  --baseline-name initial-load-before
```

Query client route totals and save the snapshot ID:

```bash
pnpm next experimental-analyze \
  --query get_bundle_overview \
  --input '{"environment":"client","metric":"compressed","limit":100}'
```

If the user named routes, optimize those. Otherwise start with the largest
meaningful application route. Asset-like and framework routes are evidence to
understand, not automatic targets.

## 2. Rank initial browser candidates

For each target route, begin with package grouping restricted to initial client
reachability:

```bash
pnpm next experimental-analyze \
  --query query_bundle_sources \
  --input '{
    "route":"/dashboard",
    "environment":"client",
    "loadScopes":["initial"],
    "groupBy":"package",
    "metric":"compressed",
    "limit":100
  }'
```

Page through every result when `pagination.truncated` is true. Rank candidates
using all of:

- estimated initial client contribution;
- share of the route and repetition across routes;
- parse/execute cost, not bytes alone;
- whether the feature is visible or usable before interaction;
- correctness risk, especially duplicate runtimes.

There is no universal byte threshold. Ignore trivial churn unless a duplicate
creates correctness risk or repeats across many routes.

Drill from package to source paths, then explain a representative large source:

```bash
pnpm next experimental-analyze \
  --query query_bundle_sources \
  --input '{
    "route":"/dashboard",
    "environment":"client",
    "loadScopes":["initial"],
    "groupBy":"source",
    "search":"node_modules/<package>",
    "limit":100
  }'

pnpm next experimental-analyze \
  --query explain_bundle_source \
  --input '{
    "route":"/dashboard",
    "environment":"client",
    "sourcePath":"<exact sourcePath from the prior result>",
    "maxDepth":25
  }'
```

Use `nearestProjectImporter`, `nearestClientBoundary`, `firstAsyncBoundary`,
and both chain orientations to find the application source to inspect. When an
explanation is ambiguous, select a returned `moduleIdent`; do not guess one.

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
`initial` and gain `async`. Total route attribution may remain unchanged because
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
remain correct.

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

Assets need a separate pass because they may not carry module reachability:

```bash
pnpm next experimental-analyze \
  --query query_bundle_sources \
  --input '{
    "route":"/dashboard",
    "environment":"client",
    "fileTypes":["css","asset"],
    "groupBy":"source",
    "metric":"compressed",
    "limit":100
  }'
```

Use this as route attribution only. Whether a font/image/CSS file was actually
requested during cold initial navigation requires browser network evidence.

Do not maintain a generic package blacklist. Tie every recommendation to
measured route evidence and inspected source behavior.

## 4. Change one thing and prove it

For each candidate:

1. Record route, snapshot ID, package/source, initial scope, estimated bytes,
   project importer, client boundary, and source reason.
2. Add or identify behavior coverage for the affected route and interaction.
3. Make one minimal change.
4. Regenerate with a new baseline name:

   ```bash
   pnpm next experimental-analyze --output \
     --baseline-name initial-load-after-<change>
   ```

5. Query the affected route/source again.
6. For removal, server migration, narrowing, or deduplication, require a client
   byte reduction. For lazy loading, require `initial` → `async` and verify the
   trigger.
7. When two distinct snapshots exist, use `compare_bundles` for route/package
   byte deltas; use source queries for scope changes.
8. Run the project's production build and focused behavior/browser tests.
9. Revert the change if the intended signal does not improve or behavior is not
   preserved.

Avoid combining candidates before measurement; otherwise attribution is lost.
After each accepted change, use its output as the next baseline.

## 5. Report

Report only accepted changes and remaining material opportunities. For each
accepted change include:

- route and user-visible feature;
- measured analyzer evidence and inspected source reason;
- change made;
- before/after client bytes or load-scope transition;
- behavior verification;
- caveats and confidence.

Separate **measurements** (bytes/scopes), **source facts** (interaction and
imports), and **heuristics** (entry/worker detection). Say explicitly when real
network transfer needs a cold-browser trace or HAR rather than analyzer
attribution.

## Completion checklist

- [ ] The CLI exposes `--list-queries` and `loadScopes`.
- [ ] A named production-analysis baseline exists.
- [ ] Target routes were queried with `environment: client` and `initial` scope.
- [ ] Every changed candidate has a project importer and source-backed reason.
- [ ] Already-async code was not wrapped in another dynamic boundary.
- [ ] Duplicate versions were confirmed in browser-initial paths and the package
      graph before consolidation.
- [ ] Server migration preserved live/local-only behavior and trust boundaries.
- [ ] Each change was measured independently and ineffective changes reverted.
- [ ] Production build and focused behavior tests pass.
- [ ] Final report distinguishes attribution estimates from observed transfer.

## Related skills

- `next-dev-loop` — browser-driven development feedback while changing the app.
- `next-cache-components-optimizer` — static App Shell and instant-navigation
  optimization; complementary to browser bundle reduction.
- `next-partial-prefetching-optimizer` — optimize what navigation prefetches
  before interaction.
