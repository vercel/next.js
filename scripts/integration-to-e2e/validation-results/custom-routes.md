# custom-routes: WARN

Conversion preserves all tests and assertions with proper lifecycle setup, but the `no-op rewrite` describe uses a discouraged in-describe Turbopack skip pattern after `nextTestSetup()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                             |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 104, converted: 105 (+1 turbopack-skip placeholder)                                                                                                    |
| 1b  | Assertions          | pass    | original: 268, converted: 274                                                                                                                                    |
| 1c  | Test titles         | pass    | All preserved including warning/export tests                                                                                                                     |
| 1d  | Describe blocks     | pass    | Flattened: Custom routes / no-op / solo types / export                                                                                                           |
| 2a  | URL paths           | pass    | All paths mapped to next.fetch/next.render/next.browser                                                                                                          |
| 2b  | Response checks     | pass    | Status/headers/body assertions preserved                                                                                                                         |
| 2c  | FS checks           | pass    | `fs.readJSON` → `next.readFile()` + JSON.parse                                                                                                                   |
| 2d  | Browser checks      | pass    | `webdriver()` → `next.browser()`                                                                                                                                 |
| 2e  | Build output        | pass    | `stdout` → `buildCliOutput` from `next.build()`                                                                                                                  |
| 2f  | Dynamic logic       | pass    | `runTests(isDev)` inlined; `isNextDev` guards `!isDev` manifest block                                                                                            |
| 3a  | nextTestSetup       | pass    | Used everywhere                                                                                                                                                  |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                               |
| 3c  | skipStart           | pass    | `skipStart: true` + manual `next.build()`/`next.start()` in beforeAll                                                                                            |
| 3d  | No manual lifecycle | pass    | `findPort` used only for external HTTP/WS server (allowlisted)                                                                                                   |
| 3e  | Cleanup             | pass    | External server closed in `afterAll`; patchFile handled by isolated dir                                                                                          |
| 4a  | Directory placement | pass    | `test/e2e/` correct for dev+prod coverage                                                                                                                        |
| 4b  | Mode guards         | pass    | `isNextDev` / `isNextStart` replacing `isDev`/TURBOPACK vars                                                                                                     |
| 4c  | Turbopack guards    | warn    | `no-op rewrite` uses `if (isTurbopack && isNextStart) { it('skipped'); return }` INSIDE a describe that calls `nextTestSetup()` — explicitly discouraged pattern |
| 4d  | Dedup guards        | na      | Original used TURBOPACK_DEV/BUILD dedup, which 4e says to drop                                                                                                   |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` usage                                                                                                                       |
| 5a  | render              | pass    |                                                                                                                                                                  |
| 5b  | fetch               | pass    | query params inlined into path                                                                                                                                   |
| 5c  | browser             | pass    |                                                                                                                                                                  |
| 5d  | check→retry         | pass    | All `check()` calls replaced with `retry() + expect()`                                                                                                           |
| 5e  | File class          | pass    | `new File(nextConfig)` → `next.patchFile()`                                                                                                                      |
| 5f  | waitFor             | pass    | Only used for animation-like delays in client nav test (same as original)                                                                                        |
| 5g  | fs operations       | pass    | `next.readFile('.next/BUILD_ID')` / `'.next/routes-manifest.json'`                                                                                               |
| 6a  | Fixtures exist      | pass    | All pages/, public/, next.config.js present                                                                                                                      |
| 6b  | next.config.js      | pass    | Same config, patched for `__EXTERNAL_PORT__`                                                                                                                     |
| 6c  | Overrides           | pass    | `patchFile` replicates original config swaps for solo-types                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                                                                                  |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                  |
| 7c  | async/await         | pass    |                                                                                                                                                                  |
| 7d  | eslint              | pass    |                                                                                                                                                                  |

## Issues

None.

## Warnings

- `describe('Custom routes no-op rewrite', ...)` uses `if (isTurbopack && isNextStart) { it('skipped'...); return }` inside a describe that has already invoked `nextTestSetup()`. Per criterion 4c, the skip should wrap OUTSIDE the describe via `;(process.env.IS_TURBOPACK_TEST && !process.env.TURBOPACK_DEV ? describe.skip : describe)(...)` (or equivalent) to avoid spinning up the test app unnecessarily.
- `should not hang when proxy rewrite fails` passes `{ timeout: 5000 }` to `next.fetch()`; verify the helper forwards `timeout` to underlying fetch (fetchViaHTTP supported this via node-fetch options).
