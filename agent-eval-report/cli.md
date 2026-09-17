# Analyzer CLI bundle-size evaluation

## Analyzer-only findings

The analyzer snapshot contains four routes. `/dashboard` is the largest at **5,296,420 raw / 1,939,446 estimated compressed bytes**. Client-only package grouping isolates four dashboard-specific third-party candidates totaling **1,262,878 raw / 460,417 compressed bytes**; none appears in the `/` client package list.

| Candidate      | Client raw | Client compressed | Confidence  | Opportunity                                                                                                                                                                          |
| -------------- | ---------: | ----------------: | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `highlight.js` |    939,555 |           351,248 | High        | Use core plus only required languages and/or defer highlighting. Many named language modules are present; `mathematica.js` alone is 248,576 / 71,014 bytes in the total environment. |
| `chart.js`     |    192,225 |            64,893 | Medium-high | Prefer selective controller/element/scale/plugin registration and consider loading charts dynamically.                                                                               |
| `lodash`       |     69,770 |            24,943 | High        | The analyzer identifies monolithic `lodash/lodash.js`; use per-method imports, modularization, or native equivalents.                                                                |
| `moment`       |     61,328 |            19,333 | Medium-high | Use `Intl`, a smaller library, server-side formatting, and/or narrow locale material.                                                                                                |

### Why these are concrete

- `highlight.js`, `chart.js`, `lodash`, and `moment` all occupy the same dashboard app-client/app-ssr chunk and are absent from the root route's client package list.
- Source-level explanations identify broad distribution files for Chart.js, Lodash, and Moment rather than only tiny helpers.
- Highlight.js source ranking exposes a long tail of languages (`mathematica`, `isbl`, `gml`, `sqf`, `maxima`, `1c`, and more), which is strong evidence of over-broad language inclusion.
- Client-only totals avoid relying on the larger `environment=total` figures, which mix client and server attribution.

## Missed or unclear areas

- There is only one snapshot, so no meaningful historical comparison is possible.
- The CLI does not show application import/parent chains or export-level usage, so it cannot state the exact import to change.
- Compressed source sizes are estimates because sources are compressed independently.
- The dashboard page source is 30,138 raw client-attributed bytes but only 505 compressed bytes; the raw anomaly is not clearly actionable without source context.
- The analyzer cannot infer interaction frequency, so dynamic-loading recommendations need product/runtime validation.
- The overview reports `/favicon.ico` as 1,810,570 raw bytes, but does not make the split between route output, traced server files, and browser-delivered assets obvious.

## Query log

All commands used the requested executable and analyze directory.

|   # | Tool                    | Input                                                                  | Result                                                                                                    |
| --: | ----------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
|   1 | `get_bundle_overview`   | `{}`                                                                   | Success: four routes; dashboard is largest.                                                               |
|   2 | `query_bundle_sources`  | `{"route":"/dashboard","limit":50}`                                    | Success: top 50/830 sources; large language modules and broad third-party files visible.                  |
|   3 | `explain_bundle_source` | dashboard + highlight.js `mathematica.js` path                         | Success: 248,576 raw / 71,014 compressed, app-client and app-ssr candidates.                              |
|   4 | `query_bundle_sources`  | dashboard, `groupBy=package`, limit 50                                 | Success: total-environment package ranking.                                                               |
|   5 | `query_bundle_sources`  | dashboard, `environment=client`, `groupBy=package`, limit 50           | Success: browser-relevant package ranking used by findings.                                               |
|   6 | `compare_bundles`       | `{}`                                                                   | **Failed:** `baselineSnapshot` is required.                                                               |
|   7 | `compare_bundles`       | sole snapshot as baseline, dashboard route, package grouping, limit 20 | Success but only an identical self-comparison; output remained route-granularity and included all routes. |
|   8 | `explain_bundle_source` | dashboard + `lodash/lodash.js` path                                    | Success: 139,540 raw / 49,953 compressed total source attribution.                                        |
|   9 | `explain_bundle_source` | dashboard + `moment/moment.js` path                                    | Success: 122,656 raw / 38,705 compressed total source attribution.                                        |
|  10 | `explain_bundle_source` | dashboard + `chart.js/dist/chart.js` path                              | Success: 320,435 raw / 105,046 compressed total source attribution.                                       |
|  11 | `query_bundle_sources`  | root route, `environment=client`, `groupBy=package`, limit 30          | Success: none of the four dashboard candidates is present.                                                |

**Query count:** 11. **Failed queries:** 1 (query 6), followed by a schema-correct but analytically unhelpful self-comparison.

## Interface friction

1. Query-specific schemas are not surfaced before execution; the required `baselineSnapshot` was learned from a failed call.
2. `compare_bundles` accepted `route` and `groupBy` but returned route granularity and all routes, making effective inputs unclear.
3. `query_bundle_sources` defaults to `environment=total`; a second client-only query is needed to avoid overstating browser impact.
4. Exact pnpm virtual-store source paths are cumbersome inputs to `explain_bundle_source`.
5. Source explanations identify ambiguous app-client/app-ssr candidates but provide no parent/import chain.

## Overall assessment

The analyzer CLI efficiently converts a large route into a short, quantitatively ranked optimization list. It is strongest at detecting broad package inclusion—especially the Highlight.js language set and monolithic Lodash—and weaker at identifying the precise source edit. A productive sequence is **overview → client package grouping → source ranking/explanation → source validation**.

## Ground-truth comparison

After the analyzer-only findings above were persisted, I inspected `src/app/dashboard/page.tsx` and the fixture manifest.

### Correct hits

| Analyzer hit                            | Source ground truth                                                                                                           | Verdict                                                                                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broad `highlight.js` language inclusion | The page imports root `highlight.js` but highlights one constant snippet with only `language: 'javascript'` (lines 7, 20–22). | **Correct.** Use `highlight.js/lib/core`, register JavaScript only, and keep the required theme CSS. This directly addresses the largest candidate.                          |
| Broad/eager `chart.js` entry            | The page imports `chart.js/auto` but constructs only one `bar` chart (lines 6, 24–33).                                        | **Correct.** Selectively register the bar controller, elements, scales, and needed plugins. Dynamic loading is plausible, though its UX benefit depends on chart prominence. |
| Monolithic Lodash                       | Root `lodash` is imported solely for `_.groupBy` over four static records (lines 5, 10–19).                                   | **Correct.** A per-method import is smaller; a short native reduction can remove the dependency entirely.                                                                    |
| Moment for simple formatting            | `moment` is used only as `moment().format('LLLL')` (lines 4, 39).                                                             | **Correct.** `Intl.DateTimeFormat` can remove this client dependency; server formatting is another option if freshness/hydration behavior is chosen deliberately.            |

### Misses

1. **Coarse client boundary.** The entire dashboard begins with `'use client'`. Static grouping, syntax highlighting, timestamp formatting, and the imperative chart canvas are combined in one client component. The CLI shows client/server flags and common chunks but does not explain that only a small extracted chart component fundamentally needs the effect/ref client boundary. Splitting that boundary could keep static work and markup server-side and make client dependency removal easier.
2. **Removal is stronger than modularization for trivial usage.** Source semantics show that Lodash groups four constants, Moment formats one timestamp, and Highlight.js processes one constant snippet. The analyzer correctly suggested narrowing packages but could not reveal that native or server-side code can potentially eliminate all three from the client.

### False positives

**None among the four package findings.** Every reported package is directly imported by the dashboard and used in an inefficiently broad way. The conditional Chart.js dynamic-loading suggestion is not considered a false positive, but the analyzer and source alone cannot establish whether deferral improves this page's user experience.

### Ground-truth assessment

The CLI achieved **four correct package hits, two missed higher-level refinements, and zero package false positives**. Source inspection converted good package-level leads into exact fixes. The key limitation is architectural context: the interface cannot show the import parent/boundary or determine when complete dependency removal is more appropriate than narrower imports.
