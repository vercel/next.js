# prerender-revalidate: WARN

Conversion preserves test titles and structure, but drops filesystem-level regeneration assertions in favor of HTTP-only checks, reducing total assertions.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                             |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 17 (8+1+8), converted: 17 (8+1+8)                                                                                      |
| 1b  | Assertions          | warn    | original: ~49, converted: ~17. FS-based regeneration checks dropped; behavior still validated via double-render diff             |
| 1c  | Test titles         | pass    | All preserved verbatim                                                                                                           |
| 1d  | Describe blocks     | pass    | Inner `production mode` wrapper collapsed (file is in test/production/)                                                          |
| 2a  | URL paths           | pass    | `/`, `/named`, `/nested`, `/nested/named`, `/static`, `/_next/data/${buildId}/...` all covered                                   |
| 2b  | Response checks     | warn    | Cache-control/ETag checks preserved; HTML/JSON filesystem comparisons dropped but regeneration still asserted via `retry`        |
| 2c  | FS checks           | warn    | Original read `.next/server/*.html` and `.json`; converted only compares HTTP responses. Equivalent behavior verified indirectly |
| 2d  | Browser checks      | na      |                                                                                                                                  |
| 2e  | Build output        | na      |                                                                                                                                  |
| 2f  | Dynamic logic       | na      | Both blocks are prod-only                                                                                                        |
| 3a  | nextTestSetup       | pass    |                                                                                                                                  |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                               |
| 3c  | skipStart           | na      | Server is needed (ISR revalidation)                                                                                              |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/nextBuild imports                                                                                            |
| 3e  | Cleanup             | pass    | nextTestSetup handles cleanup                                                                                                    |
| 4a  | Directory placement | pass    | `test/production/` matches original's prod-only guard                                                                            |
| 4b  | Mode guards         | na      | No dev/prod branching                                                                                                            |
| 4c  | Turbopack guards    | pass    | Original `TURBOPACK_DEV` skip moot for prod dir                                                                                  |
| 4d  | Dedup guards        | na      | Prod-only test                                                                                                                   |
| 4e  | No incorrect env    | pass    |                                                                                                                                  |
| 5a  | render              | pass    | renderViaHTTP → next.render                                                                                                      |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch with headers                                                                                           |
| 5c  | browser             | na      |                                                                                                                                  |
| 5d  | check→retry         | na      | Original didn't use check()                                                                                                      |
| 5e  | File class          | na      |                                                                                                                                  |
| 5f  | waitFor→retry       | pass    | waitFor(1000)/waitFor(500) replaced with retry() polling                                                                         |
| 5g  | fs operations       | warn    | fs.readFile of `.next/server/*` dropped rather than ported; no next.readFile equivalent added                                    |
| 6a  | Fixtures exist      | pass    | pages/index.js, named.js, nested/index.js, nested/named.js, static.js all present                                                |
| 6b  | next.config.js      | na      | Original had none                                                                                                                |
| 6c  | Overrides           | pass    | `env: { __NEXT_TEST_MAX_ISR_CACHE: '1' }` preserved in regression describe                                                       |
| 7a  | No dead code        | pass    |                                                                                                                                  |
| 7b  | retry over timeout  | pass    |                                                                                                                                  |
| 7c  | async/await         | pass    |                                                                                                                                  |
| 7d  | eslint              | pass    | Duplicate titles only across sibling describes (allowed)                                                                         |

## Issues

None — core regeneration behavior is verified, just less thoroughly.

## Warnings

- Assertion count dropped from ~49 to ~17. The filesystem-level checks (reading `.next/server/<page>.html` and `.json` to confirm the generated file actually changed on disk) were replaced with a single "second render differs from first" HTTP check. This still catches regeneration failures but does not verify the on-disk artifact was rewritten.
- Consider restoring the on-disk verification using `next.readFile('.next/server/pages/<page>.html')` to match original coverage.
