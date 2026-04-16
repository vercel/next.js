# i18n-support-base-path: WARN

Conversion looks functionally equivalent, but the original dev/prod dedup guards were dropped and there's a minor import hygiene issue.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                           |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | 3 inline `it` in both; `runTests` shared helper has 73 it() in both integration/shared.ts and e2e/shared.ts                                                                    |
| 1b  | Assertions          | pass    | 548 expects in orig shared vs 551 in converted shared; inline tests identical                                                                                                  |
| 1c  | Test titles         | pass    | All three inner describe titles preserved                                                                                                                                      |
| 1d  | Describe blocks     | pass    | Dev/prod outer describes collapsed into single nextTestSetup (acceptable flattening)                                                                                           |
| 2a  | URL paths           | pass    | Same paths preserved (ctx.basePath usage identical)                                                                                                                            |
| 2b  | Response checks     | pass    | Same cheerio/header/status assertions                                                                                                                                          |
| 2c  | FS checks           | pass    | `fs.readFile(.next/routes-manifest.json)` → `next.readFile('.next/routes-manifest.json')`; `buildId` via `next.readFile`                                                       |
| 2d  | Browser checks      | na      | None in inline portion                                                                                                                                                         |
| 2e  | Build output        | na      | Build success only via `next.build()`                                                                                                                                          |
| 2f  | Dynamic logic       | pass    | `isNextDev` used to gate build step and inner describe                                                                                                                         |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from 'e2e-utils'                                                                                                                                            |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                             |
| 3c  | skipStart           | pass    | `skipStart: true` + manual `next.build()` / `next.start()` to allow patching next.config.js before build                                                                       |
| 3d  | No manual lifecycle | warn    | Still imports `findPort` and `fetchViaHTTP` from next-test-utils (findPort needed for external server; fetchViaHTTP could use `next.fetch`). Not in the forbidden list per se. |
| 3e  | Cleanup             | pass    | externalServer closed in afterAll                                                                                                                                              |
| 4a  | Directory placement | pass    | `test/e2e/` is correct — runs in both dev and prod                                                                                                                             |
| 4b  | Mode guards         | pass    | Inner `localeDetection disabled` describe gated with `if (!isNextDev)` (prod-only, matches original)                                                                           |
| 4c  | Turbopack guards    | na      | Original had no turbopack-specific skip                                                                                                                                        |
| 4d  | Dedup guards        | warn    | Original had `process.env.TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup guards on dev/prod describes; converted has none. May cause redundant CI runs                                 |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD env guards in converted                                                                                                                                 |
| 5a  | render              | na      |                                                                                                                                                                                |
| 5b  | fetch               | warn    | Uses `fetchViaHTTP(ctx.appPort, ...)` instead of `next.fetch()` (but valid — ctx.appPort pulled from `next.url`)                                                               |
| 5c  | browser             | na      |                                                                                                                                                                                |
| 5d  | check→retry         | na      |                                                                                                                                                                                |
| 5e  | File class          | pass    | Replaced with `next.patchFile()`                                                                                                                                               |
| 5f  | waitFor             | na      |                                                                                                                                                                                |
| 5g  | fs operations       | pass    | Routes manifest/BUILD_ID read via `next.readFile()`                                                                                                                            |
| 6a  | Fixtures exist      | pass    | pages/\*, public/files/texts/file.txt, next.config.js all present                                                                                                              |
| 6b  | next.config.js      | pass    | Present at test/e2e/i18n-support-base-path/next.config.js                                                                                                                      |
| 6c  | Overrides           | na      |                                                                                                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                                                                                                |
| 7b  | retry over timeout  | na      |                                                                                                                                                                                |
| 7c  | async/await         | pass    |                                                                                                                                                                                |
| 7d  | eslint              | pass    |                                                                                                                                                                                |

## Issues

None

## Warnings

- **4d dedup guards missing**: Original used `(TURBOPACK_BUILD ? describe.skip : describe)` for dev and `(TURBOPACK_DEV ? describe.skip : describe)` for prod. Converted doesn't replicate this with `(isNextDev && TURBOPACK_BUILD) || (isNextStart && TURBOPACK_DEV)` dedup. Consider adding to avoid running the suite redundantly across turbopack/webpack matrix.
- **3d/5b**: Still uses `fetchViaHTTP` and `findPort` from next-test-utils. `findPort` is required for the external HTTP server (fine, outside Next's allowlist concerns). `fetchViaHTTP` could be swapped for `next.fetch()` for consistency.
