# middleware-src: PASS

Clean conversion that preserves all test coverage using `isNextDev` / `!isNextDev` guards in place of the original's dev/prod describe blocks with dedup env guards.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                     |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3 `it()` decls × 2 via describe.each = 4 runs; converted: 4 `it()` decls (2 dev + 2 prod)                                                      |
| 1b  | Assertions          | pass    | original: 8 total; converted: 8                                                                                                                          |
| 1c  | Test titles         | pass    | All preserved ("loads and runs src middleware", "loads and runs only root middleware", "should warn about middleware on export")                         |
| 1d  | Describe blocks     | pass    | 2 describe.each entries preserved as two explicit describes                                                                                              |
| 2a  | URL paths           | pass    | `/post-1` preserved                                                                                                                                      |
| 2b  | Response checks     | pass    | All header presence checks preserved                                                                                                                     |
| 2c  | FS checks           | pass    | Replaced direct fs with `next.readFile` / `next.patchFile` / `next.deleteFile`                                                                           |
| 2d  | Browser checks      | na      | No browser interaction in original                                                                                                                       |
| 2e  | Build output        | pass    | `next.cliOutput` used for the export-warning assertion                                                                                                   |
| 2f  | Dynamic logic       | pass    | `runTests()` helpers inlined into `isNextDev` / `!isNextDev` branches                                                                                    |
| 3a  | nextTestSetup       | pass    | Used with `files: __dirname`                                                                                                                             |
| 3b  | files param         | pass    | `__dirname`                                                                                                                                              |
| 3c  | skipStart           | pass    | `skipStart: true` with explicit `next.start()` in dev and explicit `next.build()` in prod tests                                                          |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/nextBuild imports                                                                                                                  |
| 3e  | Cleanup             | pass    | afterAll uses `next.deleteFile` for patched files                                                                                                        |
| 4a  | Directory placement | pass    | test/e2e/ correct since both dev and prod assertions exist                                                                                               |
| 4b  | Mode guards         | pass    | `isNextDev` / `!isNextDev` used                                                                                                                          |
| 4c  | Turbopack guards    | na      | Original had no Turbopack skip (only dedup)                                                                                                              |
| 4d  | Dedup guards        | warn    | Original's `TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup guards are not preserved — acceptable per 4e and e2e mode separation, but may cause redundant CI runs |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD in converted                                                                                                                      |
| 5a  | render              | na      | Not used                                                                                                                                                 |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch`                                                                                                                            |
| 5c  | browser             | na      |                                                                                                                                                          |
| 5d  | check→retry         | pass    | `retry()` used for root middleware response                                                                                                              |
| 5e  | File class          | pass    | `new File(...)` replaced with `next.patchFile` / `next.deleteFile`                                                                                       |
| 5f  | waitFor             | na      | Not used                                                                                                                                                 |
| 5g  | fs operations       | pass    | fs-extra replaced with `next.*` helpers                                                                                                                  |
| 6a  | Fixtures exist      | pass    | src/middleware.ts, src/middleware.js, src/pages/index.js present                                                                                         |
| 6b  | next.config.js      | pass    | Not needed at setup; written dynamically via `next.patchFile` in prod tests, matching original                                                           |
| 6c  | Overrides           | na      |                                                                                                                                                          |
| 7a  | No dead code        | pass    |                                                                                                                                                          |
| 7b  | retry over timeout  | pass    |                                                                                                                                                          |
| 7c  | async/await         | pass    |                                                                                                                                                          |
| 7d  | eslint              | pass    | Duplicate "should warn about middleware on export" title appears in two different describes (acceptable, mirrors original)                               |

## Issues

None

## Warnings

- 4d: Original dedup guards (`TURBOPACK_BUILD`/`TURBOPACK_DEV`) were intentionally removed per 4e guidance. This may cause the same test to run in both Turbopack dev and build CI jobs; consider whether a top-level `IS_TURBOPACK_TEST` dedup is needed.
