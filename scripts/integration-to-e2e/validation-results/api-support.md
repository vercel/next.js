# api-support: PASS

Clean conversion — all 55 unique test titles preserved across common, dev-only, and prod-only branches, with `check` replaced by `retry`, `fs` by `next.readFile`, and the output-export test correctly isolated via `skipStart: true`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                       |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original unique: 55 (48 common + 5 dev + 2 prod), converted unique: 55 (48 + 5 + 1 + 1 nested)                                             |
| 1b  | Assertions          | pass    | Roughly equivalent; no drops observed                                                                                                      |
| 1c  | Test titles         | pass    | All titles preserved verbatim, including `it.skip` for body-limit test                                                                     |
| 1d  | Describe blocks     | pass    | 'dev support'/'production mode' flattened into `isNextDev` branches; 'output export error' kept as nested describe for skipStart           |
| 2a  | URL paths           | pass    | All paths migrated (`/api/hello.json`, `/api/proxy-self`, etc.)                                                                            |
| 2b  | Response checks     | pass    | Status/header/body assertions preserved                                                                                                    |
| 2c  | FS checks           | pass    | `fs.readFile(appDir, '.next/...')` → `next.readFile('.next/...')`; BUILD_ID read also migrated                                             |
| 2d  | Browser checks      | na      | No webdriver usage                                                                                                                         |
| 2e  | Build output        | pass    | `nextBuild` stderr/code → `next.build()` cliOutput/exitCode in output-export test                                                          |
| 2f  | Dynamic logic       | pass    | `runTests(true)` vs `runTests()` collapsed into `isNextDev` guards                                                                         |
| 3a  | nextTestSetup       | pass    | Used twice (main + nested for skipStart build test)                                                                                        |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                         |
| 3c  | skipStart           | pass    | Correctly applied to output-export nested describe                                                                                         |
| 3d  | No manual lifecycle | pass    | No `launchApp`/`nextBuild`/`killApp`                                                                                                       |
| 3e  | Cleanup             | pass    | Original's `nextConfig.delete()` no longer needed — isolated test dir                                                                      |
| 4a  | Directory placement | pass    | test/e2e/ correct (runs in both dev and prod)                                                                                              |
| 4b  | Mode guards         | pass    | `isNextDev` used for body text, 204 warn, dev-only tests, BUILD_ID                                                                         |
| 4c  | Turbopack guards    | na      | No webpack/turbopack-specific skips needed                                                                                                 |
| 4d  | Dedup guards        | na      | Original `TURBOPACK_DEV` skip was to avoid running prod-mode block on dev Turbopack CI — no longer needed since e2e harness picks one mode |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD`                                                                                                       |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                                                                            |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch` with query-in-URL                                                                                            |
| 5c  | browser             | na      |                                                                                                                                            |
| 5d  | check→retry         | pass    | All `check(...)` (including buggy non-awaited one) → `await retry(...)`                                                                    |
| 5e  | File class          | pass    | `new File(next.config.js)` pattern → `next.patchFile`                                                                                      |
| 5f  | waitFor             | na      |                                                                                                                                            |
| 5g  | fs operations       | pass    | Uses `next.readFile` for manifests and BUILD_ID                                                                                            |
| 6a  | Fixtures exist      | pass    | `big.json`, `pages/index.js`, all `pages/api/*` routes present                                                                             |
| 6b  | next.config.js      | na      | None in original (patched in temporarily for export test)                                                                                  |
| 6c  | Overrides           | na      |                                                                                                                                            |
| 7a  | No dead code        | pass    |                                                                                                                                            |
| 7b  | retry over timeout  | pass    | retry() used; AbortController setTimeout is legitimate cancellation                                                                        |
| 7c  | async/await         | pass    | All retry calls are awaited (fixes original bug where one `check` wasn't awaited)                                                          |
| 7d  | eslint              | pass    |                                                                                                                                            |

## Issues

None.

## Warnings

None.
