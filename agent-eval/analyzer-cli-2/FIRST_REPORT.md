# Blind bundle-analyzer report

## Scope and method

This report was produced **without inspecting or listing anything under `agent-eval/analyzer-cli-2/app`**. Evidence comes only from the saved analyzer data at `agent-eval/analyzer-cli-2/analyze`, queried through `node packages/next/dist/bin/next experimental-analyze`.

The snapshot is `20260918-192313-9376f40` (Next.js `16.4.0-canary.34`) and contains four routes. Client attribution ranks `/reports` overwhelmingly highest at **16,603,304 raw bytes / 4,827,672 estimated compressed bytes**, versus **751,856 / 388,159** for `/` and **743,243 / 383,864** for `/_not-found`. Thus the opportunities below focus on `/reports`.

> “Compressed” source and package values are estimates because attributed parts are compressed independently. Route attribution includes chunks associated with a route and does not itself prove which bytes are fetched on initial navigation. Initial/deferred classifications below therefore use importer-edge and chunk evidence and are explicitly confidence-rated.

## Ranked findings

### 1. Replace the broad ECharts entrypoint with modular ECharts imports

- **Analyzer evidence:** `/reports` attributes **898,928 raw / 386,283 estimated compressed bytes** to `echarts`, plus **219,081 / 88,315** to its renderer dependency `zrender`: **1,118,009 raw / 474,598 compressed combined** (about **9.8%** of all compressed client bytes attributed to the route).
- **Breadth evidence:** source results contain unrelated-looking chart and component implementations together (for example line, bar, treemap, data zoom, tooltip, and visual map). The package query reports 487 ECharts sources.
- **Importer evidence:** `echarts/lib/core/echarts.js` traces synchronously through `echarts/lib/export/core.js` and `echarts/index.js` directly to `[project]/src/app/reports/page.tsx`. All sampled ECharts and zrender sources share client chunk `00171iktqm9ed.js` with the route page.
- **Client impact:** this is a large parsing/execution candidate as well as roughly **474.6 kB estimated transfer**. Unlike Monaco below, it is in the route page’s synchronous import chain.
- **Initial or deferred:** **probably initial route JS**. The chain is synchronous to the route entry and shares the page chunk; the analyzer does not expose an explicit initial-chunk flag, so this remains an inference.
- **Confidence:** **high** that the broad `echarts` entrypoint is used and expensive; **medium-high** that only a subset of chart types/components is needed.
- **Proposed action:** import from `echarts/core`, register only the actual chart types, components, features, and renderer with `use(...)`, and measure a new analyzer snapshot. If charts are below the fold or behind interaction, additionally isolate the chart component behind a client-side dynamic boundary—but only after checking render/SEO requirements.

### 2. Avoid the Font Awesome free-solid barrel

- **Analyzer evidence:** `@fortawesome/free-solid-svg-icons` contributes **882,557 raw / 275,646 estimated compressed bytes** (**5.7%** of `/reports` compressed client attribution). The entire contribution is one source, `@fortawesome/free-solid-svg-icons/index.mjs`.
- **Importer evidence:** the barrel traces **synchronously and directly** to `[project]/src/app/reports/page.tsx`; it is in the same client chunk `00171iktqm9ed.js` as the page.
- **Client impact:** up to **275.6 kB estimated transfer**, plus parsing a catalog of icons when the page likely renders only a few.
- **Initial or deferred:** **probably initial route JS**, based on the direct synchronous importer edge and shared route chunk.
- **Confidence:** **very high** that a broad barrel is bundled; **high** that direct per-icon entrypoints can remove most of it.
- **Proposed action:** replace namespace/barrel usage with direct icon-module imports for only the icons rendered (or use a small local SVG/component set). Verify that no runtime icon lookup requires the full catalog.

### 3. Stop importing the all-locales `date-fns/locale` barrel

- **Analyzer evidence:** `date-fns` contributes **555,205 raw / 214,096 estimated compressed bytes** (**4.4%** of `/reports` compressed client attribution). The source query finds **558 date-fns modules**, prominently many locale implementations (for example Slovenian, Belarusian, Czech, Russian, Ukrainian, Kazakh, Tamil, and Kannada).
- **Importer evidence:** a sampled Slovenian locale source traces synchronously through `date-fns/locale/sl.js`, then `date-fns/locale.js`, then directly to `[project]/src/app/reports/page.tsx`. These sources share route client chunk `00171iktqm9ed.js`.
- **Client impact:** about **214.1 kB estimated transfer** plus parsing hundreds of locale modules.
- **Initial or deferred:** **probably initial route JS**, from the fully synchronous chain to the page and shared route chunk.
- **Confidence:** **very high** that the all-locales barrel is imported. The exact locale(s) actually needed cannot be determined from analyzer data alone.
- **Proposed action:** import only required locale modules from exact subpaths (for example `date-fns/locale/en-US`) and import date functions from specific supported entrypoints if the current style also defeats tree shaking. If locale selection is user-driven, map only supported locales to bounded dynamic imports rather than importing the global locale namespace.

### 4. Reduce Monaco’s feature/language surface; do not merely add another dynamic import

- **Analyzer evidence:** `monaco-editor` dominates route attribution at **12,909,068 raw / 3,286,293 estimated compressed bytes** (**68.1%** of `/reports` compressed client attribution), spread across **1,335 sources** and 196 reported chunks (chunk list truncated). A codicon font adds **140,956 bytes**. Largest sources include TypeScript services (**3,424,864 / 968,516**) and TypeScript libraries (**3,177,198 / 428,768**), plus CSS/HTML language-service datasets and many language definitions.
- **Importer evidence:** TypeScript services trace through the TypeScript worker and mode; the analyzer marks an **async** edge at `register.js`. The broader Monaco chain reaches `monaco-editor/esm/vs/index.js`, then reaches `[project]/src/app/reports/page.tsx` through another **async** edge.
- **Client impact:** very large eventual transfer and worker/parse cost for users who activate the editor. It is the largest byte pool but apparently not initial route code.
- **Initial or deferred:** **deferred with high confidence**, because the importer chain explicitly contains async edges and the bytes are split among many chunks/workers. The analyzer cannot show whether the page immediately triggers the dynamic import after mount, on viewport entry, or only on interaction, so “deferred” does not guarantee “late”.
- **Confidence:** **high** that Monaco is already dynamically split and ships an extremely broad feature/language set; **medium** that large reductions are possible without knowing editor requirements.
- **Proposed action:** preserve the existing async boundary. Audit which languages and editor contributions are actually required; prefer a constrained Monaco/editor-core setup and explicitly register only required languages/workers/features. If the editor is not immediately visible, trigger its existing async load on interaction or viewport entry. **Do not recommend wrapping the route/page in another dynamic import based on these bytes alone**: the analyzer already proves an async edge, and an extra boundary may not change when the application requests it.

## Aggregate priority

The three likely-initial package findings total **2,555,771 raw / 964,340 estimated compressed bytes**, approximately **20.0%** of all compressed client bytes attributed to `/reports`. They are safer first targets than Monaco because their importer chains are synchronous and their remedies can reduce code rather than merely move it. Monaco has the largest eventual cost and warrants a feature-surface audit, but its loading behavior must be source-validated before changing deferral.

## Client-boundary observation

Every direct route-page chain ends at an `[app-client]` module and then an `[app-rsc] (client reference proxy)` for the same `src/app/reports/page.tsx`. This strongly suggests the route page itself is a client boundary. Consequently, every synchronous package imported by that page is eligible for the browser graph. A source-backed follow-up should determine whether static layout/content and data preparation can remain in a Server Component while only charts/editor controls live in smaller Client Components.

## Ambiguities and limitations

- Route and compressed-source attribution are not equivalent to browser network transfer for the initial navigation.
- The query API exposes sync/async importer edges but no explicit initial/requested-on-load classification, entry-chunk membership, duplicate-byte accounting, or load-order timeline.
- Package totals may include deferred chunks and workers; summing packages describes attributed bytes, not guaranteed simultaneous transfer.
- The snapshot is marked `gitDirty: true`; no baseline snapshot exists for before/after comparison.
- Importer-chain route-entry detection is explicitly heuristic.
- `explain_bundle_source` may return multiple module candidates; ECharts required a second query with an exact `moduleIdent` before a chain was available.
- Source evidence can identify package entrypoints and generated project paths, but not UI visibility, supported locales/languages, runtime lookup behavior, or product requirements.

## Complete analyzer command/input log

All analyzer invocations made during the blind phase are listed below in chronological order. Bootstrap/install/build commands are not analyzer commands and are outside this query log.

1. **Failed before build artifacts existed**
   ```sh
   node packages/next/dist/bin/next experimental-analyze --help
   ```
   Result: Node `MODULE_NOT_FOUND` for `packages/next/dist/bin/next`; no analyzer data was read.
2. ```sh
   node packages/next/dist/bin/next experimental-analyze --help
   ```
3. ```sh
   node packages/next/dist/bin/next experimental-analyze --list-queries
   ```
4. ```sh
   node packages/next/dist/bin/next experimental-analyze --query get_bundle_overview --analyze-dir agent-eval/analyzer-cli-2/analyze --input '{"environment":"client","metric":"raw","limit":100}'
   ```
5. ```sh
   node packages/next/dist/bin/next experimental-analyze --query query_bundle_sources --analyze-dir agent-eval/analyzer-cli-2/analyze --input '{"route":"/reports","environment":"client","groupBy":"package","metric":"raw","limit":100}'
   ```
6. ```sh
   node packages/next/dist/bin/next experimental-analyze --query query_bundle_sources --analyze-dir agent-eval/analyzer-cli-2/analyze --input '{"route":"/reports","environment":"client","groupBy":"source","metric":"raw","search":"monaco-editor","limit":100}'
   ```
7. ```sh
   node packages/next/dist/bin/next experimental-analyze --query explain_bundle_source --analyze-dir agent-eval/analyzer-cli-2/analyze --input '{"route":"/reports","environment":"client","sourcePath":"[project]/node_modules/.pnpm/monaco-editor@0.56.0/node_modules/monaco-editor/esm/vs/languages/features/typescript/lib/typescriptServices.js","maxDepth":25}'
   ```
8. ```sh
   node packages/next/dist/bin/next experimental-analyze --query query_bundle_sources --analyze-dir agent-eval/analyzer-cli-2/analyze --input '{"route":"/reports","environment":"client","groupBy":"source","metric":"raw","search":"node_modules/.pnpm/echarts@","limit":10}'
   ```
9. ```sh
   node packages/next/dist/bin/next experimental-analyze --query explain_bundle_source --analyze-dir agent-eval/analyzer-cli-2/analyze --input '{"route":"/reports","environment":"client","sourcePath":"[project]/node_modules/.pnpm/echarts@6.1.0/node_modules/echarts/lib/core/echarts.js","maxDepth":25}'
   ```
10. ```sh
    node packages/next/dist/bin/next experimental-analyze --query explain_bundle_source --analyze-dir agent-eval/analyzer-cli-2/analyze --input '{"route":"/reports","environment":"client","sourcePath":"[project]/node_modules/.pnpm/echarts@6.1.0/node_modules/echarts/lib/core/echarts.js","moduleIdent":"[project]/node_modules/.pnpm/echarts@6.1.0/node_modules/echarts/lib/core/echarts.js [app-client] (ecmascript)","maxDepth":25}'
    ```
11. ```sh
    node packages/next/dist/bin/next experimental-analyze --query query_bundle_sources --analyze-dir agent-eval/analyzer-cli-2/analyze --input '{"route":"/reports","environment":"client","groupBy":"source","metric":"raw","search":"@fortawesome/free-solid-svg-icons","limit":10}'
    ```
12. ```sh
    node packages/next/dist/bin/next experimental-analyze --query explain_bundle_source --analyze-dir agent-eval/analyzer-cli-2/analyze --input '{"route":"/reports","environment":"client","sourcePath":"[project]/node_modules/.pnpm/@fortawesome+free-solid-svg-icons@7.3.1/node_modules/@fortawesome/free-solid-svg-icons/index.mjs","maxDepth":25}'
    ```
13. ```sh
    node packages/next/dist/bin/next experimental-analyze --query query_bundle_sources --analyze-dir agent-eval/analyzer-cli-2/analyze --input '{"route":"/reports","environment":"client","groupBy":"source","metric":"raw","search":"node_modules/.pnpm/date-fns@","limit":10}'
    ```
14. ```sh
    node packages/next/dist/bin/next experimental-analyze --query explain_bundle_source --analyze-dir agent-eval/analyzer-cli-2/analyze --input '{"route":"/reports","environment":"client","sourcePath":"[project]/node_modules/.pnpm/date-fns@4.4.0/node_modules/date-fns/locale/sl/_lib/formatDistance.js","maxDepth":25}'
    ```
15. ```sh
    node packages/next/dist/bin/next experimental-analyze --query get_bundle_overview --analyze-dir agent-eval/analyzer-cli-2/analyze --input '{"environment":"total","metric":"raw","limit":100}'
    ```
