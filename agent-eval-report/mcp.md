# Bundle Analyzer MCP Evaluation

## Controlled interface

This analyzer-only section was written **before** inspecting fixture `src/`, `package.json`, lockfiles, git history/diff, or application source.

- Command: `experimental-analyze --port 0`
- Discovered endpoint: `http://127.0.0.1:35569/mcp`
- Interface: raw HTTP `POST` requests using JSON-RPC `tools/call`
- Response transport: Streamable HTTP as `text/event-stream`
- Snapshot: `20260917-221933-e214873`
- Client route total: `/dashboard` is 2,042,870 raw / 847,909 estimated compressed bytes (request 14), versus `/` at 751,259 / 387,655 (request 14).

## Analyzer-only findings

| Priority | Package/source | Client raw | Client compressed | Confidence |
| -------- | -------------- | ---------: | ----------------: | ---------- |
| 1        | `highlight.js` |  939,581 B |         351,287 B | High       |
| 2        | `chart.js`     |  192,225 B |          64,893 B | Medium     |
| 3        | `lodash`       |   69,770 B |          24,943 B | High       |
| 4        | `moment`       |   61,328 B |          19,333 B | High       |

### 1. Restrict or defer `highlight.js`

**Evidence:** Request 10 attributes 939,581 raw / 351,287 estimated compressed client bytes on `/dashboard` to `highlight.js`, making it the largest application-controlled package. Request 5 confirms that `lib/languages/mathematica.js` alone contributes 248,576 raw / 71,013 compressed bytes across the client and SSR views. Request 3 lists many other large language modules—such as ISBL, GML, SQF, Maxima, 1C, x86 assembly, PostgreSQL, Stata, MEL, SCSS, Less, and CSS—in the same dashboard chunks.

**Opportunity:** Import `highlight.js` core and register only required languages rather than retaining a broad language set. If highlighting is not needed at first paint, lazy-load the highlighter. The analyzer cannot name the importing statement, but the language-module pattern makes this opportunity high-confidence.

### 2. Narrow or defer `chart.js`

**Evidence:** Request 10 attributes 192,225 raw / 64,893 compressed client bytes to `chart.js`. Request 8 resolves the contribution to `chart.js/dist/chart.js` in both the dashboard client and SSR chunks (320,435 raw / 105,046 compressed across total environments). Request 11 shows no `chart.js` on `/`, making it dashboard-specific.

**Opportunity:** Register only the controllers, elements, scales, and plugins the dashboard chart needs. If the chart is below the fold or non-critical, a client-only dynamic import can move it out of initial route code. Confidence is medium because the MCP interface does not expose used chart types or exports.

### 3. Avoid the monolithic `lodash` build

**Evidence:** Request 10 attributes 69,770 raw / 24,943 compressed client bytes to `lodash`. Request 6 resolves this to `lodash/lodash.js` in both dashboard client and SSR chunks (139,540 raw / 49,952 compressed across total environments). Request 11 shows no lodash on `/`.

**Opportunity:** Use per-method imports, a tree-shakeable ESM alternative, or small native equivalents. The monolithic CommonJS path makes this a high-confidence optimization target.

### 4. Replace or relocate `moment`

**Evidence:** Request 10 attributes 61,328 raw / 19,333 compressed client bytes to `moment`. Request 7 resolves this to `moment/moment.js` in both dashboard client and SSR chunks (122,655 raw / 38,704 compressed across total environments). Request 11 shows no moment on `/`.

**Opportunity:** Depending on behavior, use `Intl.DateTimeFormat`, a smaller modular date library, or server-side formatting to remove most/all dashboard-specific client cost.

## Missed or unclear areas

- `explain_bundle_source` returns module candidates and heuristic route-entry caveats, but no importer chain, used exports, or source symbol. The analyzer demonstrates presence and size, not the exact application statement responsible.
- `src/app/dashboard/page.tsx` contributes 30,138 raw but only 505 compressed client bytes in request 10 (96,489 / 1,008 across total environments in request 9). The extreme compression ratio suggests repetitive content, but the interface cannot establish whether it is generated, necessary, or safely removable, so it is not promoted to a finding.
- Multiple WOFF2 files are route-attributed. Unicode-range assets may not all transfer to one browser, and the interface does not expose declarations or network behavior, so aggregating them as savings would be misleading.
- Package-grouped client sizes differ from total source-level sizes because total includes both client and server contributions. Finding byte values use request 10's client grouping.
- The interface does not estimate savings from selective imports or dynamic loading.
- Request 13 found only a +38 raw-byte `/dashboard` client delta against the available previous snapshot. These opportunities are existing composition choices, not a meaningful branch regression.

## Request log

All 14 HTTP MCP requests are listed below in sequence. Full arguments and outcomes are also recorded in `mcp.json`.

|  ID | Tool                    | Purpose/outcome                                           |
| --: | ----------------------- | --------------------------------------------------------- |
|   1 | `get_bundle_overview`   | Success: total overview for four routes                   |
|   2 | `query_bundle_sources`  | **Failed:** missing required `route`                      |
|   3 | `query_bundle_sources`  | Success: top 50 total sources for `/dashboard`            |
|   4 | `explain_bundle_source` | **Failed:** used `source`; schema requires `sourcePath`   |
|   5 | `explain_bundle_source` | Success: Mathematica highlight language                   |
|   6 | `explain_bundle_source` | Success: `lodash/lodash.js`                               |
|   7 | `explain_bundle_source` | Success: `moment/moment.js`                               |
|   8 | `explain_bundle_source` | Success: `chart.js/dist/chart.js`                         |
|   9 | `explain_bundle_source` | Success: dashboard page source attribution                |
|  10 | `query_bundle_sources`  | Success: complete `/dashboard` client grouping by package |
|  11 | `query_bundle_sources`  | Success: complete `/` client grouping by package          |
|  12 | `compare_bundles`       | **Failed:** missing required `baselineSnapshot`           |
|  13 | `compare_bundles`       | Success: compare available prior snapshot to current      |
|  14 | `get_bundle_overview`   | Success: client-only route overview                       |

A preflight invocation of the local request logger used unavailable `python` rather than `python3`. No HTTP request was sent; it is recorded as a failure in `mcp.json` but excluded from the 14-query count.

## Interface friction

- The printed endpoint and raw POST contract were straightforward once the process was running.
- The permitted workflow did not expose schemas. Validation errors revealed only the immediately missing field, causing three failed queries while discovering `route`, `sourcePath`, and `baselineSnapshot`.
- Responses require SSE parsing, JSON-RPC decoding, then a second JSON decode of the tool's text content.
- Source explanations are ambiguous candidate mappings and do not expose importers or used exports.
- `compare_bundles` accepted package-oriented arguments in request 13 but returned route-granularity rows.
- Compressed attribution is explicitly estimated because sources are compressed independently.

## Overall assessment

The MCP endpoint quickly exposed a highly actionable, dashboard-specific dependency cluster. `highlight.js` dominates client-owned bytes, while `chart.js`, full lodash, and moment provide additional likely reductions. Route and package grouping are effective for prioritization. The main limitation is causal depth: source explanation proves attribution but not the import form, used exports, or attainable savings.

## Ground-truth comparison

Source inspection occurred only after the analyzer-only report above had been persisted.

### Correct hits

All four findings were correct:

1. **`highlight.js` — confirmed.** `src/app/dashboard/page.tsx` imports the broad `highlight.js` entry (lines 7–8) but highlights only one JavaScript snippet (lines 20–22). Core plus the JavaScript language directly addresses the observed language-module bulk.
2. **`chart.js` — confirmed; confidence rises to high.** The fixture imports `chart.js/auto` (line 6), which auto-registers the full component set, but creates only one bar chart (lines 24–34). Selective registration is applicable, and dynamic import is feasible because chart creation already happens in an effect.
3. **`lodash` — confirmed.** Full lodash is imported (line 5) only for `_.groupBy` over a four-item constant (lines 10–19). A per-method import or tiny native grouping/counting operation can remove the package.
4. **`moment` — confirmed.** Moment is imported (line 4) only for `moment().format('LLLL')` (line 39). `Intl.DateTimeFormat` or server-side formatting can replace it.

### Misses

- **Source-size over-attribution:** requests 9 and 10 attributed 96,489 total raw bytes / 30,138 client raw bytes to `src/app/dashboard/page.tsx`, but the file is only 1,280 bytes on disk—roughly a 75× discrepancy for the total/raw figure. The analyzer-only phase correctly treated the extreme compression ratio as unclear, but ground truth shows this value cannot be interpreted as literal source size or standalone potential savings.
- **Client-boundary architecture:** the entire dashboard is marked `'use client'` (line 1). Static grouping, date formatting, and highlighted markup could be rendered in a Server Component, leaving only canvas lifecycle code in a small Client Component. The analyzer exposed client/server flags but did not turn boundary reduction into a concrete recommendation.
- **Exact usage detail:** without importer and used-export data, the MCP interface could not establish that the fixture needs exactly one highlight language, one chart type, one lodash operation over four records, and one date format. It found the right packages but could not tailor the replacements until source inspection.

### False positives

None. The package-presence findings all correspond to broad imports with narrow actual usage. The analyzer appropriately left the highly compressible page source and font files in the unclear category rather than claiming them as savings.

### Ground-truth scorecard

- Correct hits: **4/4 findings**
- False positives: **0**
- Material misses: **source-size over-attribution** and **shrinking the `'use client'` boundary**
- Updated assessment: `chart.js` selective registration is high-confidence rather than medium-confidence after seeing the `chart.js/auto` import and single bar chart.
