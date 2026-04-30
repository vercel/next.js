# image-optimizer: PASS

High-fidelity conversion — 83 runTests `it`s preserved 1:1 in util.ts, 33 config-check tests preserved via data-driven loop + 8 standalone describes. Minor warnings around residual `check()` / direct fs reads.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                               |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | util.ts: 83/83; index 33 → 25-loop + 8 inline = 33 effective                                                                                                                                       |
| 1b  | Assertions          | pass    | util.ts expects: 394/394; index expects: 45 → 18 literal but loop expands to match                                                                                                                 |
| 1c  | Test titles         | pass    | All 33 config-check titles preserved via name data; all inner runTests titles preserved verbatim                                                                                                   |
| 1d  | Describe blocks     | pass    | Top-level describes preserved; `recursive url is not allowed` nested block kept; setupTests flattened 4→2 (dev/prod selected by NEXT_TEST_MODE)                                                    |
| 2a  | URL paths           | pass    | All `/_next/image`, `/`, `/png-as-octet-stream` accesses converted to `next.fetch`                                                                                                                 |
| 2b  | Response checks     | pass    | status/headers/body/text assertions all preserved                                                                                                                                                  |
| 2c  | FS checks           | pass    | `fsToJson`, `imagesDir` now points to `next.testDir/.next/cache/images`                                                                                                                            |
| 2d  | Browser checks      | na      | Original has no webdriver usage                                                                                                                                                                    |
| 2e  | Build output        | pass    | Config checks now use `next.build()` + `next.cliOutput` instead of launchApp+stderr                                                                                                                |
| 2f  | Dynamic logic       | pass    | `isDev = isNextDev` preserved; `isNextDev`/`isNextStart` guards on mode-specific describes                                                                                                         |
| 3a  | nextTestSetup       | pass    | All converted files use nextTestSetup from 'e2e-utils'                                                                                                                                             |
| 3b  | files param         | pass    | Uses `join(__dirname, 'app')` pointing to real fixture dir                                                                                                                                         |
| 3c  | skipStart           | pass    | Config-checks block uses `skipStart: true` and calls `next.build()`                                                                                                                                |
| 3d  | No manual lifecycle | pass    | No launchApp/nextStart/findPort except serveSlowImage's own HTTP server (allowed)                                                                                                                  |
| 3e  | Cleanup             | pass    | slowImageServer stop preserved; nextTestSetup handles app lifecycle                                                                                                                                |
| 4a  | Directory placement | pass    | test/e2e/ suitable: runs both dev+start via mode guards                                                                                                                                            |
| 4b  | Mode guards         | pass    | isNextDev / isNextStart wrap mode-specific describes correctly                                                                                                                                     |
| 4c  | Turbopack guards    | warn    | `shouldUseTurbopack() && !isNextDev ? describe.skip : describe` used inside setupTests — outside nextTestSetup call, so no app spinup wasted; slightly non-standard vs `IS_TURBOPACK_TEST` pattern |
| 4d  | Dedup guards        | na      | Original had no dedup guards                                                                                                                                                                       |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/TURBOPACK_BUILD references in converted                                                                                                                                           |
| 5a  | render              | na      | Only fetch used                                                                                                                                                                                    |
| 5b  | fetch               | pass    | `fetchViaHTTP(port, path, query, opts)` → `next.fetch(path?query, opts)` via toQueryString helper                                                                                                  |
| 5c  | browser             | na      |                                                                                                                                                                                                    |
| 5d  | check→retry         | warn    | `check()` still used in util.ts and image-optimizer.test.ts (both import from next-test-utils) — carried over from original, not converted                                                         |
| 5e  | File class          | pass    | `new File(nextConfig)` replaced by `next.patchFile('next.config.js', …)`                                                                                                                           |
| 5f  | waitFor             | pass    | Only used for minimumCacheTTL expiration (timing-based), acceptable                                                                                                                                |
| 5g  | fs operations       | warn    | Direct `fs.readFile(join(next.testDir, 'public', 'test.svg'/'test.ico'))` — could use `next.readFile` but works on public fixtures                                                                 |
| 6a  | Fixtures exist      | pass    | test/e2e/image-optimizer/app/{next.config.js, pages, public} present; diff only in `replaceme` placeholder removal                                                                                 |
| 6b  | next.config.js      | pass    | Present; placeholder changed from `{ /* replaceme */ }` to `{}` since patchFile overwrites                                                                                                         |
| 6c  | Overrides           | pass    | `nextConfig` option used correctly to pass headers/rewrites/images config                                                                                                                          |
| 7a  | No dead code        | pass    | No commented tests or orphaned helpers                                                                                                                                                             |
| 7b  | retry over timeout  | warn    | Legacy `check()` + `waitFor` retained; not introduced new                                                                                                                                          |
| 7c  | async/await         | pass    | All awaited properly                                                                                                                                                                               |
| 7d  | eslint              | pass    | loop test names are unique; no obvious violations                                                                                                                                                  |

## Issues

None.

## Warnings

- `check()` from next-test-utils is still used inside util.ts and image-optimizer.test.ts rather than being migrated to `retry() + expect()`.
- Turbopack skip uses `shouldUseTurbopack() && !isNextDev` inside `setupTests` rather than the canonical top-level `IS_TURBOPACK_TEST` wrap; still avoids spurious app spinup since it gates the describe.
- Direct `fs.readFile(join(next.testDir, 'public', …))` used for the svg/ico equality assertions instead of `next.readFile`.
- Config-check validation semantics shifted from `launchApp` stderr capture to `next.build()` + `next.cliOutput`; functionally equivalent for config-schema errors but worth a spot-check in CI.
