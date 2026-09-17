# Turbopack bundle analyzer evaluation

## Interface choice

I chose the **CLI first** because the task supplied an exact command and pre-generated analyzer directory, so it could produce evidence without installing or running the fixture. I then used the actual **MCP Streamable HTTP endpoint** with raw JSON-RPC `tools/call` requests.

I prefer the **CLI** for this workflow: it emits direct JSON, is easy to log and reproduce, and keeps the selected analyzer directory explicit. MCP returned equivalent package totals and importer chains and would be convenient through a real tool client, but raw use required a fixture install, a server/build, and decoding SSE-wrapped stringified JSON.

## Analyzer-only findings

`get_bundle_overview` identified `/dashboard` as the largest route at **5,296,420 raw / 1,939,446 compressed bytes** in the supplied snapshot. Because totals mix client, server, and traced assets, the opportunities below use the analyzer's **client, grouped-by-package** view.

| Opportunity    | Analyzer-attributed client bytes (raw / compressed) | Evidence and likely action                                                                                                                                                                                                                            |
| -------------- | --------------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `highlight.js` |                               **939,555 / 351,248** | Largest non-framework client package. `explain_bundle_source` shows a synchronous chain from a 124,288-byte language module through `lib/index.js` and `es/index.js` to the dashboard. Register/import only required languages or defer highlighting. |
| `chart.js`     |                                **192,225 / 64,893** | The selected 161,700-byte main source is synchronously reached through `chart.js/auto/auto.js`. Replace auto-registration with selective controller/element/plugin registration, or dynamically load the chart.                                       |
| `lodash`       |                                 **69,770 / 24,943** | The analyzer selects the monolithic `lodash.js` build and shows a direct synchronous dashboard edge. Use per-method imports, native equivalents, or import optimization.                                                                              |
| `moment`       |                                 **61,328 / 19,333** | The full source has a direct synchronous dashboard edge. For limited date formatting, use a smaller/runtime-native formatter or defer the dependency.                                                                                                 |

The `/` client package view does not contain these four dashboard-only dependencies, reinforcing that this is route-local application cost rather than common framework overhead.

## Limits and unclear areas

- Reachability and bytes do not reveal which exports/features the UI needs; source inspection is deliberately deferred until both analyzer-only reports exist.
- The dashboard page source is **30,138 raw / 505 compressed bytes**. The extreme ratio is unusual, but it is not a compelling transfer-size finding from analyzer evidence alone.
- Compressed source sizes are estimates because attributed parts are compressed independently.
- MCP startup generated a newer snapshot. `compare_bundles` found a nearly uniform ~147 KB raw increase on all four routes, so this looks like snapshot/build variance rather than a route-specific optimization signal.
- Potential savings above are current package contributions, not measured post-change deltas.

## Query record

Fifteen analyzer queries were made: **10 CLI** and **5 MCP**. Full inputs/outcomes are recorded in `both.json`.

Failures (all retained in the JSON record):

1. CLI `query_bundle_sources` with `{}`: `route` required.
2. CLI `explain_bundle_source` using `source` instead of `sourcePath`: `sourcePath` required.
3. MCP `compare_bundles` with `{}`: `baselineSnapshot` required.
4. MCP setup's first frozen fixture install failed on a missing checkout-relative `repo/packages/next-swc`; a temporary checkout self-symlink allowed the retry.

## Overall assessment

The analyzer surfaced four concrete synchronous client dependency costs without reading application source. **Highlight.js is the dominant optimization target**, Chart.js is second, and Lodash/Moment are smaller credible wins. Importer-chain explanations materially improve confidence beyond a size table.

## Ground-truth comparison

After both analyzer-only reports existed, I inspected the fixture source.

**Correct hits:** all four package findings were confirmed.

- The page imports top-level `highlight.js` but highlights only one JavaScript snippet; core + JavaScript-only registration is the direct fix.
- It imports `chart.js/auto` for one bar chart; selective registration is appropriate.
- It imports full Lodash but uses only `groupBy` once on four static items; a method import or native reduction removes the full build.
- It imports Moment only for `format('LLLL')`; `Intl.DateTimeFormat` or a smaller formatter covers the narrow need.

**Miss:** the initial analysis did not explicitly recommend reducing the page-wide `'use client'` boundary. Only the chart lifecycle/canvas requires client execution; a small chart island would allow the remaining static computation/markup to stay server-rendered and could eliminate or relocate more client work.

**False positives:** none. The suggested packages are genuinely over-broad for their observed uses. The report correctly avoided promoting the dashboard source's unusual raw/compressed ratio into a finding; the source itself is concise, so that attribution is not a useful code-size target.
