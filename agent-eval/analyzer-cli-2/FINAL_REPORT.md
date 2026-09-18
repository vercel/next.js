# Source-reveal evaluation of the bundle-analyzer CLI

## Reveal integrity and source inspected

`FIRST_REPORT.md` was committed as `b0f10fc9` before source reveal. Only afterward were these fixture files inspected:

- `app/package.json`
- `app/src/app/page.tsx`
- `app/src/app/reports/page.tsx`

No fixture application file was modified.

## Executive assessment

The analyzer found every deliberately broad dependency import and correctly exposed the route-level client boundary and Monaco's async edge. All four blind byte findings were **true positives as bundle composition findings**. However, source revealed an important distinction the analyzer could not provide: the page intentionally renders registry cardinalities with `Object.keys(...)`. Therefore, narrowing the ECharts, Font Awesome, or locale namespaces is **not behavior-preserving unless that diagnostic copy is removed or changed**. The blind report anticipated runtime namespace lookup as a safety check for Font Awesome and locales, but it did not rank this possibility as likely.

The safest high-value change is to remove the “Loaded registries” diagnostic and narrow three imports. Separately, split the route-level Client Component into a Server Component shell plus a focused chart/editor Client Component. Monaco is already loaded only by a button click; advice to “dynamic import Monaco” would have been wrong and redundant.

## Blind findings evaluated

| Rank | Blind finding                                   | Verdict                                 | Source-backed evaluation                                                                                                                                                                                                                                                                                                     |
| ---: | ----------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | Use modular ECharts imports                     | **True positive, conditionally safe**   | `reports/page.tsx:4` imports `* as echarts`; lines 17–22 need only initialization, a bar series, category/value axes, and their renderer. But lines 45–46 display `Object.keys(echarts).length`, so narrowing the namespace changes visible output. Remove/change that diagnostic first.                                     |
|    2 | Avoid the Font Awesome solid-icons barrel       | **True positive, conditionally safe**   | Line 6 imports `fas`; line 40 uses only `fas.faChartBar`, while line 44 displays the full registry count. A direct `faChartBar` import removes most catalog bytes only if the count is removed or changed. The blind warning to verify runtime lookup was necessary and material.                                            |
|    3 | Avoid `date-fns/locale` all-locales barrel      | **True positive, conditionally safe**   | Line 8 imports all locales; line 42 only formats with `locales.enUS`, while line 45 displays locale count. Direct `enUS` import is exact for formatting but changes the diagnostic count.                                                                                                                                    |
|    4 | Reduce Monaco features; preserve async boundary | **True positive and safe in principle** | Line 28 already uses `await import('monaco-editor')`, and it runs only from the button handler on line 49. The blind deferred classification was correct. Line 31 needs JavaScript language support only, so a targeted editor API/language setup or a smaller editor can be evaluated. Do not add another dynamic boundary. |

### False positives

There were **no composition false positives**: each package and importer path reported by the analyzer corresponds exactly to source imports. There were, however, two possible recommendation false positives if the blind actions were applied mechanically:

1. Direct icon/locale imports would alter the intentionally rendered registry counts.
2. Modular ECharts imports would also alter the rendered ECharts export count.

These are not reasons to retain roughly 964 kB estimated compressed client attribution; they are reasons to change/remove the diagnostic UI as part of the optimization and confirm that the count is not a requirement.

## Misses in the blind report

1. **The broad imports are intentionally made observable.** Analyzer data cannot show `Object.keys(fas/locales/echarts)` or distinguish accidental barrels from deliberate namespace enumeration. The blind report noted runtime lookup ambiguity for icons/locales but did not infer the same hazard for ECharts.
2. **Monaco is definitely interaction-deferred, not merely chunk-deferred.** The importer graph proved async edges but could not show that `loadEditor` is called only by the “Open formula editor” button (`reports/page.tsx:26–35,49`).
3. **The exact chart surface is tiny.** Source proves one bar chart with category/value axes and no tooltip (`reports/page.tsx:17–22`), making modularization higher-confidence than the blind report's medium-high estimate.
4. **Static route content need not be client code.** The analyzer identified the route page as a client boundary, and the blind report recommended checking a split, but source proves only chart setup, editor loading, and editor state require client execution. The heading/date/shell can be server-rendered.
5. **The home route is already lean and server-rendered.** `app/src/app/page.tsx` contains only static content and `next/link`; deprioritizing it from analyzer route totals was correct, but the blind report did not source-confirm it.

## Exact source-backed optimization plan

### 1. Remove or rewrite the registry-count diagnostic

`reports/page.tsx:43–47` is the blocker for all three likely-initial import reductions. Remove this development/demo copy, or replace it with stable product text that does not enumerate entire module namespaces. If the counts are a real product requirement, compute literal/build-time metadata outside the client bundle rather than importing every implementation to count exports.

### 2. Narrow Font Awesome to one icon

Replace the `fas` namespace import at line 6 with the package's direct `faChartBar` entrypoint/export and pass `faChartBar` at line 40. If preserving a single icon is not worth the Font Awesome runtime (**88,467 / 21,562** for core plus **4,992 / 2,247** for the React wrapper), render a small local SVG instead. Analyzer attribution suggests the catalog change alone can target most of **882,557 raw / 275,646 compressed** bytes.

### 3. Import only `enUS`

Replace `import * as locales from 'date-fns/locale'` (line 8) with an exact `enUS` locale import and pass `enUS` on line 42. `format` itself can remain a named import if a follow-up analyzer snapshot confirms tree shaking; the current 558-module graph proves the locale barrel, not `format`, is the dominant problem. This targets most of **555,205 raw / 214,096 compressed** bytes.

For this static date, an even smaller option is server-side `Intl.DateTimeFormat('en-US', { dateStyle: 'long' })`, subject to matching the desired output and timezone semantics.

### 4. Register only the ECharts surface used

Replace `import * as echarts from 'echarts'` with ECharts core modular imports, registering only:

- bar chart support,
- grid/axis support required by the category/value axes,
- the chosen canvas or SVG renderer.

Then call the imported `init` directly. No tooltip, data zoom, line chart, treemap, or visual-map implementation is used by lines 17–22. A follow-up snapshot should quantify savings from the current **1,118,009 raw / 474,598 compressed** ECharts+zrender attribution rather than assuming all of it disappears.

### 5. Shrink the client boundary

Turn `reports/page.tsx` into a Server Component and move only these concerns into a small Client Component:

- chart `ref` and setup effect,
- editor `ref`/loaded state,
- click-triggered Monaco import.

Keep the heading and formatted date in the server page. This prevents future server-safe presentation imports from silently entering the browser graph and can move date formatting—and potentially icon rendering—out of client JS. ECharts and Monaco must remain in the client island.

### 6. Keep Monaco click-deferred, then constrain it

The current loading trigger is good: `import('monaco-editor')` executes only inside `loadEditor`, called by the button. Preserve that boundary. Since the editor creates only a JavaScript model and disables the minimap, test a targeted Monaco editor API plus only JavaScript/TypeScript worker/language contributions, or a smaller editor appropriate for a one-line formula. Validate worker URLs and language services in production; deep Monaco entrypoints can be version-sensitive.

The analyzer's **3,286,293 estimated compressed bytes** is the largest eventual pool, but optimizing it affects users who click the editor, not initial route users. Measure initial navigation and post-click loading separately.

## Client-boundary conclusions

The blind importer chain ending in an `[app-client]` page and `[app-rsc] (client reference proxy)` accurately predicted line 1's `'use client'`. Because that directive is at route-page scope, every synchronous import on lines 3–8 participates in the browser graph. The analyzer makes this structural problem visible, but it cannot distinguish which statements actually need a client boundary. Source reveals the boundary can be pushed down substantially.

A useful analyzer enhancement would identify the nearest explicit client-boundary source and report the synchronous bytes introduced beneath it, rather than exposing only internal proxy identifiers in the importer chain.

## CLI discovery and query friction

### What worked well

- `experimental-analyze --help` clearly surfaced `--query`, `--list-queries`, `--analyze-dir`, and `--input` without source inspection.
- `--list-queries` returned machine-readable descriptions, schemas, enums, limits, and examples.
- `get_bundle_overview` immediately isolated `/reports` as the target route.
- Package grouping exposed the dominant dependencies in one query.
- `explain_bundle_source` supplied edge kinds, allowing the report to distinguish synchronous ECharts/icons/locales from async Monaco.
- Caveats about independent compression estimates and heuristic route entries were included in responses.

### Friction encountered

1. **No initial/deferred classification.** Route totals mix synchronous route JS, async chunks, workers, fonts, and other assets. Inferring load timing required individual importer chains and remained uncertain until source reveal.
2. **No package-level explanation query.** To explain a package, the workflow was package ranking → source search → choose a representative source → explain it. This is especially awkward for a 1,335-source package.
3. **Very large JSON responses.** Package results include long chunk arrays, and a Monaco source query returned 100 verbose records. This consumes agent context while often adding little ranking value.
4. **Ambiguous module candidates require a retry.** ECharts explanation returned two candidates and no chain. A second call had to copy an exact `moduleIdent`; candidate selection could be integrated or a preferred chain returned alongside ambiguity.
5. **Environment flags are confusing.** In an `environment: "client"` query, records can say both `client: true` and `server: true` and list server chunks. These flags describe global presence, not bytes included in the selected environment, but that distinction is not explicit in field names.
6. **No direct aggregate/percentage fields.** Route percentage calculations and combined package totals had to be computed separately.
7. **Search is path-oriented and low-level.** Finding exact package sources required knowledge of pnpm paths and generated identifiers rather than a `packageName` filter.
8. **No request/load reason.** An async edge does not show whether a chunk is loaded on mount, viewport, navigation, or interaction; source was essential for Monaco safety.
9. **Raw project-source attribution can be misleading.** The page source appeared as **80,386 raw / 645 compressed** bytes, a ratio that deserves explanation (for example repeated/generated representations) before users treat source raw size as authored-code size.

## Concrete CLI improvements

1. Add `initial`, `async`, `worker`, and `asset` scopes to overview/source queries, backed by chunk-graph reachability from route entrypoints; return both initial and eventual totals.
2. Add `explain_bundle_package` with total bytes, top sources, direct project importers, first async boundary, and one representative chain per distinct importer.
3. Add a compact response mode that omits chunk lists/module identifiers by default and returns them only with `includeChunks`/`includeCandidates`.
4. For ambiguous source candidates, return a best-effort chain for each bounded candidate or accept a candidate index; include ready-to-use next-query input.
5. Rename presence flags to `presentInClientGraph` / `presentInServerGraph`, and keep selected-environment chunk lists separate.
6. Support exact `packageName` filters and package allow/deny lists rather than requiring path substring searches.
7. Return `percentOfRoute`, package-family totals (for example ECharts + zrender), and optional cumulative percentages.
8. Surface nearest project importer and nearest explicit client boundary directly in package/source ranking results.
9. Distinguish “chunk is async-reachable” from actual trigger timing and state clearly that interaction timing requires runtime trace or source evidence. Optionally ingest a browser trace to report requested-on-initial-navigation versus requested-after-interaction.
10. Add a recommendation-safety hint when an imported namespace is retained as a namespace object; this would flag that tree-shaking may be blocked but should avoid claiming direct imports are behavior-preserving.
11. Explain anomalous size attribution (such as large raw/tiny compressed project sources) in a `sizeMethod` field or per-record caveat.

## Final prioritization

1. Remove/rewrite registry-count text, then narrow Font Awesome and locales: high confidence, low implementation risk, roughly **489.7 kB** combined estimated compressed attribution available to target.
2. Modularize the one-bar ECharts setup: high confidence after source reveal, up to **474.6 kB** combined ECharts/zrender attribution to target, with actual savings to be measured.
3. Split the page-level client boundary: architectural guardrail plus reduced client execution; quantify with a new snapshot.
4. Preserve Monaco's click deferral and prototype a JavaScript-only Monaco surface or smaller editor: largest eventual payoff but higher integration/testing risk and no initial-navigation benefit.

After each step, generate a fresh analyzer snapshot and compare package and route results. Because the saved data has only one dirty snapshot, the current CLI cannot provide a baseline comparison for this evaluation.
