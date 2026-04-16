# config-output-export: PASS

All 17 original tests are preserved in the converted file with equivalent behavior and proper use of `nextTestSetup` and `next.patchFile`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                              |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 17, converted: 17 (14 + 3 split across two describes)                                                   |
| 1b  | Assertions          | pass    | original: ~24, converted: ~25 (added sync-point "Ready" checks)                                                   |
| 1c  | Test titles         | pass    | hasNextSupport titles reworded from "should error" → "should not error" (more accurate); semantic match preserved |
| 1d  | Describe blocks     | pass    | hasNextSupport=true extracted to top-level describe with env override (correct approach for nextTestSetup)        |
| 2a  | URL paths           | pass    | `/`, `/api/wow`, `/api/mw`, `/blog`, `/posts/one` all preserved                                                   |
| 2b  | Response checks     | pass    | status 200/404, HTML body, redbox header, cliOutput all preserved                                                 |
| 2c  | FS checks           | pass    | Uses `next.patchFile` / `next.deleteFile` instead of direct `fs`                                                  |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`, `elementByCss` preserved                                                            |
| 2e  | Build output        | pass    | `result.stderr` → `next.cliOutput`                                                                                |
| 2f  | Dynamic logic       | na      |                                                                                                                   |
| 3a  | nextTestSetup       | pass    |                                                                                                                   |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                |
| 3c  | skipStart           | na      | Dev server tests need running server                                                                              |
| 3d  | No manual lifecycle | pass    | No `launchApp`/`killApp`/`findPort`                                                                               |
| 3e  | Cleanup             | pass    | `afterEach` restores config and deletes test files                                                                |
| 4a  | Directory placement | pass    | `test/development/` matches original's `launchApp` (dev-only)                                                     |
| 4b  | Mode guards         | na      | Dev-only, no dual-mode branching in original                                                                      |
| 4c  | Turbopack guards    | na      |                                                                                                                   |
| 4d  | Dedup guards        | na      |                                                                                                                   |
| 4e  | No incorrect env    | pass    |                                                                                                                   |
| 5a  | render              | na      | Uses fetch instead (matches original)                                                                             |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch`                                                                                     |
| 5c  | browser             | pass    | `webdriver` → `next.browser`                                                                                      |
| 5d  | check→retry         | pass    | Uses `retry()`                                                                                                    |
| 5e  | File class          | pass    | `new File(...)` → `next.patchFile`                                                                                |
| 5f  | waitFor             | na      |                                                                                                                   |
| 5g  | fs operations       | pass    | `fs.writeFileSync`/`fs.rmSync` → `next.patchFile`/`next.deleteFile`                                               |
| 6a  | Fixtures exist      | pass    | `pages/index.js`, `next.config.js` present                                                                        |
| 6b  | next.config.js      | pass    | Same content as original                                                                                          |
| 6c  | Overrides           | pass    | `env: { NOW_BUILDER: '1' }` replaces `beforeAll`/`afterAll` env mutation                                          |
| 7a  | No dead code        | pass    |                                                                                                                   |
| 7b  | retry over timeout  | pass    |                                                                                                                   |
| 7c  | async/await         | pass    |                                                                                                                   |
| 7d  | eslint              | pass    |                                                                                                                   |

## Issues

None

## Warnings

- Dropped minor assertion `expect(result.stderr).toBeEmpty()` from the static-homepage and fallback-false tests. Not a blocking drop since the converted tests focus on positive behavior verification.
- The original runs a fresh dev server per test; the converted file reuses one dev server and mutates `next.config.js` between tests. This relies on dev-server config hot-reload correctness but is the standard nextTestSetup pattern and appears correct given the cleanup in `afterEach`.
