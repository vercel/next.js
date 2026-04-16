# app-types: PASS

Clean conversion preserving all tests, assertions, and fixtures; minor style warning on the defensive `isNextStart` guard.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 5, converted: 5 (+ 1 no-op skip)                                                                                          |
| 1b  | Assertions          | pass    | body-for-body identical expects preserved                                                                                           |
| 1c  | Test titles         | pass    | All 5 titles preserved verbatim                                                                                                     |
| 1d  | Describe blocks     | pass    | Single describe retained                                                                                                            |
| 2a  | URL paths           | na      | No HTTP requests                                                                                                                    |
| 2b  | Response checks     | na      |                                                                                                                                     |
| 2c  | FS checks           | pass    | `fs.readFile(appDir/.next/...)` → `next.readFile('.next/...')`                                                                      |
| 2d  | Browser checks      | na      |                                                                                                                                     |
| 2e  | Build output        | pass    | `nextBuild(appDir, [], {stderr})` → `next.build()` + `next.cliOutput`                                                               |
| 2f  | Dynamic logic       | na      |                                                                                                                                     |
| 3a  | nextTestSetup       | pass    | uses `e2e-utils`                                                                                                                    |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                  |
| 3c  | skipStart           | pass    | Build-only test with `skipStart: true` + explicit `next.build()`                                                                    |
| 3d  | No manual lifecycle | pass    | no `nextBuild`/`launchApp` etc.                                                                                                     |
| 3e  | Cleanup             | pass    | nextTestSetup handles it                                                                                                            |
| 4a  | Directory placement | pass    | production-only → `test/production/`                                                                                                |
| 4b  | Mode guards         | warn    | `if (!isNextStart) { it('skipped'); return }` is the pattern 4c warns about; harmless here since `test/production/` is always start |
| 4c  | Turbopack guards    | pass    | `if (!isTurbopack)` gates one test; acceptable (not top-level skip); original also had inline guard                                 |
| 4d  | Dedup guards        | na      |                                                                                                                                     |
| 4e  | No incorrect env    | pass    | Uses `isTurbopack`/`isNextStart` from hook                                                                                          |
| 5a  | render              | na      |                                                                                                                                     |
| 5b  | fetch               | na      |                                                                                                                                     |
| 5c  | browser             | na      |                                                                                                                                     |
| 5d  | check→retry         | na      |                                                                                                                                     |
| 5e  | File class          | na      |                                                                                                                                     |
| 5f  | waitFor             | na      |                                                                                                                                     |
| 5g  | fs operations       | pass    | Direct `fs.readFile` replaced with `next.readFile`                                                                                  |
| 6a  | Fixtures exist      | pass    | All src/app routes, src/pages/aaa.js, next.config.js, tsconfig.json, package.json present                                           |
| 6b  | next.config.js      | pass    | Copied over                                                                                                                         |
| 6c  | Overrides           | na      |                                                                                                                                     |
| 7a  | No dead code        | pass    |                                                                                                                                     |
| 7b  | retry over timeout  | na      |                                                                                                                                     |
| 7c  | async/await         | pass    |                                                                                                                                     |
| 7d  | eslint              | pass    |                                                                                                                                     |

## Issues

None.

## Warnings

- `if (!isNextStart) { it('skipped for non-start mode', () => {}); return }` sits inside the describe after `nextTestSetup()` — the pattern criterion 4c flags. Since the file lives in `test/production/` (always start mode), the branch never fires and can be dropped.
