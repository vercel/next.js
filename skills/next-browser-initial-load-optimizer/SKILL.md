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

Use this skill to investigate *why* a route ships code. Unlike the CLI-based
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
2. Decode bytes `[4, 4+n)` as UTF-8 JSON (not a JSON file on disk).
3. The rest, starting at `4+n`, is the **binary section**. Each JSON
   `EdgesDataReference` has `{offset, length}` in **bytes relative to this
   section**, not to the beginning of the file. `length` is the serialized
   section length, not the number of edges.
4. At `binary_start + offset`, read a BE u32 `count` of cumulative offset
   entries. Read `count` BE u32 cumulative offsets, then the BE u32 edge-index
   array. For node index `i < count`, its edges are
   `edges[offsets[i-1] : offsets[i]]`, with previous offset `0` at `i=0`.
   An empty neighbor list can have the same cumulative offset as the previous
   one. Each array is a separate adjacency index; do not interpret the offset
   table itself as edges. Validate bounds, increasing offsets, and referenced
   index ranges before using results.

The `analyze.data` JSON header contains:

| Field | Interpretation |
| --- | --- |
| `sources[]` | `{parent_source_index: number \| null, path: string}`. Concatenate ancestor `path` strings to reconstruct a full source path; a parent may be a directory, not a module. |
| `chunk_parts[]` | `{source_index, output_file_index, size, compressed_size}`; sizes are bytes attributed to an emitted part, not package install sizes. |
| `output_files[]` | `{filename}` of each emitted output. |
| `source_roots[]` | Indices of source-tree roots. |
| `output_file_chunk_parts`, `source_chunk_parts`, `source_children` | Edge references: output → part indices, source → part indices, source → child source indices. |

`modules.data` contains `modules[]` with `{ident, path}` plus **six** edge
references: `module_dependencies`, `async_module_dependencies`,
`traced_module_dependencies`, and the corresponding `module_dependents`,
`async_module_dependents`, `traced_module_dependents`. For an importer `i`,
`*_dependencies[i]` points toward what it imports; `*_dependents[j]` points
back to its importers. Ordinary dependency edges are synchronous; async edges
mark async boundaries; traced edges describe file-tracing relationships and
should not be treated as browser imports. Module indices are local to
`modules.data`; source indices and chunk-part indices are local to one route's
`analyze.data`. **Never join by index across files.** `ident` distinguishes
module variants; `path` is not unique, and a source path is not necessarily an
exact module identity. Where a path maps to multiple `ident`s, keep the
ambiguity rather than guessing which importer owns a source contribution.

Sanity checks: the reference occupies `4 + 4*count + 4*offsets[-1]` bytes;
`count` should match the owning array length for these files; each part's
`source_index` and `output_file_index` should be in bounds; each decoded edge
should index the relevant array. Stop and inspect the writer if these fail.

### Small, disposable decoding example

In an ad hoc Python session, this reads one route and the corresponding global
module graph. It is an illustration to adapt to the question, **not** a shipped
parser or a prescribed CLI:

```python
import json
import struct
from pathlib import Path

root = Path('.next/diagnostics/analyze/data')

def u32(buf, pos):
    return struct.unpack_from('>I', buf, pos)[0]

def open_data(path):
    raw = path.read_bytes()
    n = u32(raw, 0)
    header = json.loads(raw[4:4+n].decode('utf-8'))
    return header, memoryview(raw)[4+n:]

def neighbors(binary, ref, i):
    start, length = ref['offset'], ref['length']
    if not length:
        return []
    count = u32(binary, start)
    assert i < count and start + length <= len(binary)
    before = 0 if i == 0 else u32(binary, start + 4 + 4*(i-1))
    end = u32(binary, start + 4 + 4*i)
    assert before <= end and 4 + 4*count + 4*end <= length
    base = start + 4 + 4*count
    return [u32(binary, base + 4*j) for j in range(before, end)]

route, route_edges = open_data(root / 'dashboard/analyze.data')
modules, module_edges = open_data(root / 'modules.data')
part_ids = neighbors(route_edges, route['source_chunk_parts'], 0)
imports = neighbors(module_edges, modules['module_dependencies'], 0)
print('source 0 part IDs:', part_ids, 'module 0 imports:', imports)
```

Use the exact `routes.json` entry and route file in your app (for `/`, use
`root / 'analyze.data'`). Check other indices, reverse edges, and zero-degree
nodes before drawing conclusions. Stream or index large files rather than
printing entire headers to a model context.

## 3. Answer the question before choosing an algorithm

1. Record the route, snapshot, environment (client vs server/traced), target
   source/module, metric (`size` or `compressed_size`), and whether the user
   means *initial requests*, *all route outputs*, or *global dependencies*.
2. For route attribution, join `source_chunk_parts[source]` to `chunk_parts`
   and `output_files`. Sum **parts** once for the requested route and set of
   outputs; do not sum directory and descendant totals together. Use
   `output_file_chunk_parts` to inspect the composition of an actual output.
   The UI reader classifies `[client-fs]/` output filenames as client,
   `[project]/` as traced/server, and other outputs as server. Verify these
   conventions against the artifact before filtering; a source can appear in
   multiple files. Compressed sizes are per-part estimates, **not** measured
   transfer bytes or necessarily additive gzip of the entire output.
3. For an import explanation, search `modules[]` by `path` **and** `ident`,
   traverse relevant `module_dependents` backward from a candidate, and
   `module_dependencies` forward from a known importer. Track visited indices
   to handle cycles. Include async/traced edges only when the question calls
   for them, labeling each type. The module graph is whole-app; intersect
   candidate paths with route output sources and inspect application source
   before asserting a route-specific cause. Mapping a source to more than one
   module identity is ambiguous, not proof of an exact path.
4. **Initial load requires more evidence.** The raw schema above does not
   contain route entry IDs, exact initial/async `loadScopes`, request timing,
   nearest client boundaries, or edge-cut counterfactuals. Do not claim that
   `analyze.data` alone proves a module is initially requested. Identify entry
   imports from application source or an independently verified entry map;
   inspect emitted chunk references and, when timing matters, capture a cold
   browser network trace. Mark any fallback entry/initial classification as a
   heuristic. An already-async edge is not a candidate for another dynamic
   split merely because its target appears in route data.

### Rank a useful candidate

Start with routes the user named. Otherwise rank meaningful application routes
by measured client-output contributions, not framework or asset-like route
names alone. For each candidate, consider estimated route share and repetition
across routes, likely parse/execute cost, whether the feature is needed before
interaction, and correctness risk (for example a duplicate runtime). The raw
route outputs alone cannot establish *initial* reachability: confirm that
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

- **Min cut:** For a known client entry set and a target heavy subgraph, start
  with the directed *synchronous* module dependency graph. Add a super-source
  connecting **all** verified initial entries and a sink connecting targets;
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
  *suggest* cohesive feature groups and low-crossing boundaries. Decide how
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

These are *procedures*, not precomputed answers; run them against the selected
route and report actual paths and values:

| Question | Ad hoc analysis and honest answer |
| --- | --- |
| "What contributes most to `/dashboard` client output?" | Decode that route's `analyze.data`; filter output filenames after verifying the client convention; group `chunk_parts` by reconstructed source path or package; sum each part once. Report the largest paths, uncompressed/compressed attribution and the selected output files. This ranks **route output**, not proven initial requests. |
| "Why is a large editor included?" | Find its source path in route parts and matching `modules.data` paths; choose an exact `ident` if possible. Traverse synchronous `module_dependents` toward project importers (mark async and traced importers separately), inspect those import statements, and state if variants prevent a unique chain. A browser trace is needed before calling it initially loaded. |
| "Where might a lazy boundary isolate the editor?" | Only after establishing real client entry nodes, search for **all** synchronous paths to the editor; run a min cut on that scoped graph. For instance, two independent entry→editor paths need both severed, not just the visually obvious import. Inspect each proposed edge for a safe interaction gate and rebuild; a cut alone does not measure saved bytes. Cluster nearby features separately if a cohesive split is unclear. |

As a toy sanity check, imagine a folder source 0 with no direct parts and a
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
  avoid a universal byte threshold or a generic package blacklist.
- For interaction-gated editors/charts/dialogs, confirm the code is genuinely
  needed only after interaction and is not already async. Introduce one
  conditional lazy boundary, keeping the trigger and a stable placeholder in
  initial UI; avoid layout shift. Use `ssr: false` only in a Client Component
  when browser APIs require it, not automatically for every dynamic import.
  Preserve loading/error states, direct visits, focus, keyboard access and the
  feature's behavior. After the split works, consider preload on hover/focus
  when intent strongly predicts use. Idle preloading is more speculative:
  account for Save-Data, slow connections, battery/data cost and contention
  with important requests. Do not eagerly preload the work you just deferred.
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
**heuristics** (especially entry detection and cuts). Compressed source parts
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
