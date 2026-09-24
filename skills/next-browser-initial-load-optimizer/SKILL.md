---
name: next-browser-initial-load-optimizer
description: >
  Investigate and reduce browser initial-load work in Next.js applications using
  raw experimental-analyze data, without an analyzer query CLI. Use for bundle
  audits, slow routes, dependency/import graphs, lazy-loading candidates,
  duplicate packages, large Client Component boundaries, and graph cut or
  community-clustering explorations.
---

# Browser initial-load optimizer (raw-data prototype)

Use this skill to investigate _why_ a route ships code. Unlike the CLI-based
version, this prototype gives you the on-disk schema and leaves parsing, graph
algorithms, and judgment to you. Write small **disposable analysis snippets**
for the question at hand; do not assume there is a supported query command or
turn an exploratory result into a claim about request timing.

## Choose a mode

- **Audit (default):** Read-only with respect to the application. Generate or
  inspect analyzer artifacts, investigate route and graph evidence, and report
  prioritized candidates with assumptions and verification gaps. Do **not**
  change application source, dependencies, or lockfiles. Running
  `experimental-analyze --output` generates build artifacts; its `--output`
  flag does **not** opt into fix mode. Stop after the report unless the user
  explicitly asks for a fix.
- **Fix (only on explicit request):** Audit the requested scope first, then
  follow [Make one safe change and measure it](#4-make-one-safe-change-and-measure-it).
  Change one behavior-preserving candidate at a time, regenerate the data,
  check behavior, and keep or revert based on evidence. If a product decision
  is needed (visible behavior, timing, compatibility or trust boundary), ask
  before changing it.

## 1. Produce and locate the evidence

In the application, use its package manager (substitute `npx next`, `yarn next`,
`bunx next`, etc. for pnpm):

```bash
pnpm exec next experimental-analyze --output --baseline-name initial-load-before
```

Check that the installed version supports `--output`. That mode performs
production analysis and exits without starting the analyzer UI server, but do
**not** infer that it runs inside a sandbox without TCP port binding. In an
agent sandbox that cannot bind TCP ports (for example, some Codex sandboxes),
run **`experimental-analyze --output` itself outside the sandbox** in an
environment that supports port binding. Ask for that environment or for its
resulting data files when necessary. Continue analysis only once the artifacts
are accessible; do not claim the analysis or browser verification ran if they
did not. Do not bypass sandbox restrictions.

Run without `--output` only if a human or browser-driving agent needs the
optional interactive analyzer UI; that server remains open and needs a usable
port. Output mode is the automated default, not a guarantee of sandbox
compatibility. The files are in `.next/diagnostics/analyze/` (or the configured
dist directory):

- `data/routes.json`: array of route paths, e.g. `/`, `/dashboard`.
- `data/modules.data`: one **whole-application** module graph.
- `data/analyze.data`: route `/`; `data/dashboard/analyze.data`: route
  `/dashboard`. For a nested route use its path without the leading slash.
  Verify the file exists; route names, dynamic routes, and special endpoints
  may differ from the browser URL.
- `data/metadata.json`, `history/index.json`, and
  `history/<snapshot-id>/`: current metadata and historical copies of the
  `data/` contents, including the route files and `modules.data`. Read the
  actual snapshot ID rather than assuming a name is a directory.

The raw files are local build artifacts, not a network service. Treat paths and
serialized content as untrusted input; do not execute them. The producer is
`crates/next-api/src/analyze.rs`, the location wiring is
`crates/next-napi-bindings/src/next_api/analyze.rs`, and the UI reader is
`apps/bundle-analyzer/lib/analyze-data.ts`. Recheck those sources for newer
versions instead of assuming this schema is frozen.

## 2. Decode the two `.data` files on demand

Both use the same envelope:

1. Read the first **four bytes** as an unsigned 32-bit **big-endian** JSON byte
   length `n`.
2. Check `4+n` fits in the file, then decode bytes `[4, 4+n)` as UTF-8 JSON
   (not a JSON file on disk).
3. The rest, starting at `4+n`, is the **binary section**. Each JSON
   `EdgesDataReference` has `{offset, length}` in **bytes relative to this
   section**, not to the beginning of the file. `length` is the serialized
   section length, not the number of edges. Both newer headers have
   `schema_version: 1` and `module_index_hash`: require **both** fields to
   match before joining a route's numeric module indices to `modules.data`.
   `module_index_hash` is a non-cryptographic **ordered-index fingerprint**
   of module identities and paths. It excludes dependency edges and outputs:
   equal hashes do **not** prove that two files contain the same graph or
   build. It detects accidental index mismatches, not artifact tampering;
   keep files from the same named snapshot together.
   Missing versions are legacy files (decode their older fields without an
   `output_file_modules` join). Unknown versions or mismatched hashes must
   not be joined by index.
4. At `binary_start + offset`, read a BE u32 `count` of cumulative offset
   entries. Read `count` BE u32 cumulative offsets, then the BE u32 edge-index
   array. For node index `i < count`, its edges are
   `edges[offsets[i-1] : offsets[i]]`, with previous offset `0` at `i=0`.
   An empty neighbor list can have the same cumulative offset as the previous
   one. Each array is a separate adjacency index; do not interpret the offset
   table itself as edges. Validate bounds, nondecreasing offsets, and referenced
   index ranges before using results.

The `analyze.data` JSON header contains:

- `sources[]`: `{parent_source_index: number | null, path: string}`. Concatenate ancestor `path` strings to reconstruct a full source path; a parent may be a directory, not a module.
- `chunk_parts[]`: `{source_index, output_file_index, size, compressed_size}`; sizes are bytes attributed to an emitted part, not package install sizes.
- `output_files[]`: `{filename}` of each emitted output.
- `route_entries[]` (newer artifacts only): Endpoint graph roots with `route_entry_id`, exact `module_ident`, `module_path`, `role` (`route` or `shared`) and optional `runtime`. `entry_kind` is `server` or `client_bootstrap` only when verified from the endpoint's build inputs; if absent, the kind is unknown. An App RSC root can contain `client_references[]` with `module_ident`, `module_path` and `reference_kind` (`ecmascript` or `css`). These nested references are **not** endpoint graph roots or proven initial browser requests. Some API artifacts include shared Pages roots because output files are merged; unannotated shared roots do not imply browser work for that API.
- `source_roots[]`: Indices of source-tree roots.
- `output_file_chunk_parts`, `source_chunk_parts`, `source_children`: Edge references: output → part indices, source → part indices, source → child source indices.
- `output_file_modules` (v1): binary adjacency with **one row per `output_files[]` item**, containing indices into that snapshot's `modules.data.modules[]`. `output_file_module_coverage[]` has the same length: `exact` means all enumerated JS/CSS chunk items joined; `unsupported` means the row might be partial or empty because the output wrapper or member cannot be enumerated/joined; `not_a_chunk` means it has no module-chunk membership. Check `unjoined_modules[]` for `{output_file_index, module_ident, reason}`; an unsupported row does not prove there are no modules. These are **module contents of a chunk**, not source-part attribution or an initial-load verdict.
- This version has no route-specific chunk-load groups or typed output-load edges; output membership is not a label for initial, async, worker or prefetched requests.

`modules.data` contains `modules[]` with `{ident, path}` plus **six** edge
references: `module_dependencies`, `async_module_dependencies`,
`traced_module_dependencies`, and the corresponding `module_dependents`,
`async_module_dependents`, `traced_module_dependents`. For an importer `i`,
`*_dependencies[i]` points toward what it imports; `*_dependents[j]` points
back to its importers. Ordinary dependency edges are synchronous; async edges
mark async boundaries; traced edges describe file-tracing relationships and
should not be treated as browser imports. Before v1, module indices were local
to `modules.data` and could **never** be joined to route indices; v1 alone
explicitly permits the `output_file_modules` join after checking matching
version and ordered-index hash. Numeric indices are not stable across
builds. Source indices and chunk-part indices are local to one route's
`analyze.data`. `ident` distinguishes module variants; `path` is not unique,
and a source path is not necessarily an exact module identity. **The new
output-file membership does not create a stable source-to-module ID.** Where a
path maps to multiple `ident`s, keep the ambiguity rather than guessing which
importer owns a source contribution.

Sanity checks: the reference occupies `4 + 4*count + 4*offsets[-1]` bytes;
`count` should match the owning array length for these files; each part's
`source_index` and `output_file_index` should be in bounds; each decoded edge
should index the relevant array. Stop and inspect the writer if these fail.

Choose the exact route from `data/routes.json` and decode its `analyze.data`
and the same snapshot's `modules.data` separately (route `/` uses
`data/analyze.data`). Inspect zero-degree rows and reverse edges before drawing
conclusions. Stream or index large files rather than printing entire headers
to a model context.

## 3. Answer the question before choosing an algorithm

1. Record the route, snapshot, environment (client vs server/traced), target
   source/module, metric (`size` or `compressed_size`), and whether the user
   means _initial requests_, _all route outputs_, or _global dependencies_.
2. For route attribution, join `source_chunk_parts[source]` to `chunk_parts`
   and `output_files`. Sum **parts** once for the requested route and set of
   outputs; do not sum directory and descendant totals together. Use
   `output_file_chunk_parts` to inspect the composition of an actual output.
   The UI reader classifies `[client-fs]/` output filenames as client,
   `[project]/` as traced/server, and other outputs as server. Verify these
   conventions against the artifact before filtering; a source can appear in
   multiple files. Compressed sizes are per-part estimates, **not** measured
   transfer bytes or necessarily additive gzip of the entire output.
3. For an import explanation, if available select the route's
   `route_entries[]`, joining each `module_ident` (including nested client
   references) to exactly one `modules[].ident` in the same snapshot. Treat a
   missing/ambiguous join as an error or uncertainty, not a path-based match.
   Otherwise search `modules[]` by `path` **and** `ident`. Traverse relevant
   `module_dependents` backward from a candidate, and `module_dependencies`
   forward from a known importer. Track visited indices to handle cycles;
   label async/traced edges. Nested references are separate client graph inputs,
   **not** additional synchronous roots of the server endpoint. The graph is
   whole-app; intersect candidate paths with route output sources and inspect
   application source. A source path can map to multiple module identities.
4. In v1, verify the **version and module-index hash** before reading
   `output_file_modules`. Traverse output → module rows to find exact chunk
   membership; check coverage and unmatched identities before using an empty
   row. An `unsupported` empty row never proves that a chunk contains no
   modules. A client reference is not itself an endpoint graph root, and
   output membership does not tell you whether its chunk loads initially.
   Continue to use `chunk_parts` for size attribution; membership is **not**
   a byte-saving estimate. Older artifacts have no route-output → module join.
5. **Initial browser requests still require more evidence.** The module graph
   and output membership identify possible import paths and emitted contents,
   not route-specific initial/async/worker chunk loads. Use a verified client
   root set and cold browser network trace when request timing matters; neither
   a synchronous path nor chunk membership alone proves initial loading or
   exact savings. An already-async module edge is not a candidate for another
   dynamic split merely because its target appears in route data.

### Rank a useful candidate

Start with routes the user named. Otherwise rank meaningful application routes
by measured client-output contributions, not framework or asset-like route
names alone. For each candidate, consider estimated route share and repetition
across routes, likely parse/execute cost, whether the feature is needed before
interaction, and correctness risk (for example a duplicate runtime). The raw
route outputs alone cannot establish _initial_ reachability: confirm that
separately before claiming an initial-load saving. There is no universal byte
threshold; ignore trivial churn unless it recurs or poses a correctness risk.
Do not invent work when no material candidate exists.

Before choosing a lazy boundary, identify the exact importer and inspect
application source. A large package name alone is not an actionable import.
Verify alternate synchronous paths and cycles; estimate affected sources and
outputs, but do not claim a cut's bytes are automatically removable. Source
cleanup, including `import type` conversions, may already be eliminated by the
bundler: only a measured artifact delta supports a bundle win.

### When a graph strategy helps

- **Min cut:** Select a route, render scenario, verified client entry roots and
  target, then traverse the directed _synchronous_ module graph. Matching v1
  output→module rows can check emitted membership, not when chunks load.
  **Completeness gate:** Inspect all known alternate root→target paths, unknown
  roots, `unsupported` membership and unjoined modules. Route-specific
  bootstrap/render scopes and output load edges are not provided, so refuse a
  definitive initial-load or exhaustive emitted-chunk cut. A cut of the **known
  module subgraph** may still be useful if labeled _provisional_ with
  missing evidence and how to verify it. Do not make unrelated unsupported
  outputs elsewhere in the snapshot a blanket blocker. Verify actual requested
  entry/chunk sets with a cold network trace before claiming an initial-load
  cut. Add a super-source
  connecting **all** selected client entries and a sink connecting targets;
  find a separating set of import edges (or use node splitting if boundaries
  are modules). Define capacity deliberately: a unit cut minimizes edge count;
  a byte-weighted or source-edit cost answers a different question. Condense
  strongly connected components first if cycles obscure candidate boundaries.
  Verify the result removes **every** synchronous path; check async and shared
  routes separately. A mathematical cut is not automatically a feasible
  dynamic `import()`: inspect the importer, side effects, runtime behavior,
  client boundary, and lazy trigger. Never claim exact saved bytes by summing
  shared or duplicated target sizes; rebuild and measure.
- **Community detection / clustering:** On a scoped, deduplicated graph of
  relevant client modules (typically symmetrize ordinary import edges for an
  undirected algorithm), try Louvain/Leiden or another available method to
  _suggest_ cohesive feature groups and low-crossing boundaries. Decide how
  to weight nodes/edges, record the resolution and random seed, and check
  stability. A detected community is neither a natural chunk nor a valid
  server/client boundary; compare it with source ownership, async imports,
  route overlap, and actual emitted chunks. Directed, async and traced edges
  must not silently become equivalent undirected browser edges.
- Start simpler when appropriate: rank attributed parts, trace a few reverse
  import paths, and inspect source before reaching for graph algorithms. The
  skill supplies no fixed graph solver or precomputed result; choose and run
  a suitable on-demand algorithm only if the question warrants it.

### Representative questions to rehearse

These are _procedures_, not precomputed answers; run them against the selected
route and report actual paths and values:

- **What contributes most to `/dashboard` client output?** Decode that route's `analyze.data`; filter output filenames after verifying the client convention; group `chunk_parts` by reconstructed source path or package; sum each part once. Report the largest paths, uncompressed/compressed attribution and the selected output files. This ranks **route output**, not proven initial requests.
- **Why is a large editor included?** Find it in v1 output→module rows (or use source paths as ambiguous leads in legacy artifacts); check the containing chunk's membership coverage. Traverse synchronous `module_dependents` toward project importers (mark async and traced importers separately), inspect those import statements, and state if variants prevent a unique chain. A browser trace is needed to verify requests.
- **Where might a lazy boundary isolate the editor?** Select client entry nodes and a conditional render scenario (or observe a real initial-request set), check the available module/output coverage, then search for **all** synchronous paths to the editor. If an unknown reference or unsupported chunk might supply another path, report only a provisional cut of the known graph and the evidence needed to complete it. For instance, two independent entry→editor paths need both severed, not only the apparent import. Inspect each proposed edge for a safe interaction gate and rebuild; a cut alone does not measure saved bytes. Cluster nearby features separately if a cohesive split is unclear.

As a small validation example, imagine a folder source 0 with no direct parts and a
child source 1 owning one 100-byte part (40 attributed compressed bytes). The
folder's recursive total is 100, not 100 + 100. If whole-app module 0 imports
module 1, that edge alone says nothing about when `/dashboard` requests either
module. On real data, record the actual numbers instead of substituting this
illustrative case.

## 4. Make one safe change and measure it

**Fix mode only.** An audit ends with measured candidates and recommendations;
it does not authorize the edits below. In fix mode, reuse the original
optimization loop's judgment, not its CLI calls:

- Prioritize material, route-relevant browser costs and actual user behavior;
  avoid a universal byte threshold or a generic package deny list.
- For interaction-gated editors/charts/dialogs, confirm the code is genuinely
  needed only after interaction and is not already async. Introduce one
  conditional lazy boundary, keeping the trigger and a stable placeholder in
  initial UI; avoid layout shift. Use `ssr: false` only in a Client Component
  when browser APIs require it, not automatically for every dynamic import.
  Preserve loading/error states, direct visits, focus, keyboard access and the
  feature's behavior. After the split works, consider preload on hover/focus
  when intent strongly predicts use. Idle preloading is more speculative:
  account for Save-Data, slow connections, battery/data cost and contention
  with important requests. Do not eagerly preload the deferred work.
- For duplicate packages, verify distinct versions in client artifacts and
  the package-manager graph (`pnpm why`, `npm ls`, etc.). Do not confuse module
  variants, conditional exports or server/client copies with duplicate shipped
  JS. Prioritize duplicate React, styling/state singletons (correctness risk),
  then same-major or large repeated versions. Try aligning direct ranges,
  upgrading the parent that pins an old version, correcting an owned package's
  dependency-vs-peer declaration, then package-manager dedupe. Consider an
  override only after API and peer compatibility checks; never force a
  cross-major consolidation merely because names match. For React, confirm
  framework compatibility and hooks/hydration behavior. Recheck client output
  and inspect the lockfile diff for unrelated churn.
- For server-capable work inside a Client Component, inspect display-only
  Markdown/MDX and highlighting, locale/date registries, document/CSV/PDF
  parsing, search indexing, schema validation, large static data and broad
  registries. Move only work that does not require live editing, browser-only
  data, offline operation or per-keystroke computation. Prefer a server-rendered
  display with a smaller interactive island, a parser lazy-loaded for edit mode,
  or a smaller client parser where needed. Keep the sanitizer policy on the
  trusted side; never send unsafe HTML to eliminate client JavaScript. Verify
  server rendering, sanitization, authorization, hydration and interaction.
- Also inspect polyfills/shims, route-specific work imported by shared layouts,
  side-effectful packages, static JSON, broad barrels, repeated route deps and
  emitted CSS/fonts/images/media/WASM where evidence warrants it. Enumerate
  actual output filenames and their parts; source-level asset attribution is
  not proof of a requested file. Use a cold-browser trace for request facts.
- Before editing, record route/snapshot, exact source and importer, candidate
  boundary and evidence; add or identify behavior coverage. Make **one** small
  change and take a named `experimental-analyze --output` snapshot after it.
  Compare the same route, output class and metric in raw before/after files.
  Byte removal/server migration/deduplication should reduce relevant client
  attribution; lazy loading may preserve eventual route bytes, so corroborate
  initial-to-async movement with source/chunk evidence **and** a cold browser
  trace. Verify the trigger and behavior; run targeted tests and the narrowest
  relevant type-check. Analysis already performed a production analysis: run
  another full build only if project-specific or uncovered behavior requires
  it. Revert ineffective or behavior-breaking edits. Use the accepted after
  snapshot as the next baseline; never combine candidates before measuring.

## 5. Report and stop

In **audit**, report the ranked opportunities and evidence without edits. In
**fix**, report only accepted changes and remaining material opportunities.
For each accepted change include:

```markdown
### <route> — <feature>

- Baseline / after: <snapshot IDs and measured client output scope>
- Delta: <bytes and %, or separately corroborated initial → async>
- Source / importer: <exact paths/idents and inspected source reason>
- Change: <one behavior-preserving edit>
- Checks: <targeted tests, type-check, browser verification or blocked checks>
- Unrelated blockers: <if any>
```

Always distinguish **attribution measurements**, **source facts**, and
**heuristics** (especially entry detection and cuts). For a cut, state the
selected route/render conditions, roots and target, whether the result covers
only the known subgraph, and any unsupported, unjoined or otherwise unknown
relationships that could alter the paths. If coverage is incomplete, say _provisional_ and name
what would resolve it; do not call the cut exhaustive. Compressed source parts
are estimates, not observed network transfer. Include exact output/module
identifiers, assumptions and uncertainty; use a cold-browser trace/HAR for
actual request timing and transfer bytes. If artifacts or ports are unavailable,
report the blocked step instead of manufacturing a win.

Checklist: verify named baseline and selected route; inspect reverse imports
before any edit; do not re-defer async work; confirm duplicate versions in
browser evidence and package graph; preserve live/offline behavior and trust
boundaries; measure each fix independently and revert ineffective changes;
verify behavior and report observed versus attributed measurements. When raw
data cannot prove initial scope, label it unverified instead of substituting
whole-route output membership.

## Related skills

- `next-dev-loop` — inspect the browser and verify behavior after an edit.
- `next-cache-components-optimizer` — optimize the route's static App Shell.
- `next-partial-prefetching-optimizer` — optimize navigation prefetch work.
