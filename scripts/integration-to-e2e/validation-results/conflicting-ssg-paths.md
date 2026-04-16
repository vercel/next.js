# conflicting-ssg-paths: PASS

Conversion preserves all three tests, assertions, describe structure, and correctly swaps `fs.writeFile(join(appDir,...))` / `nextBuild(appDir)` for `next.patchFile(...)` / `next.build()` + `next.cliOutput`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                               |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3 (+ no-op skip placeholder)                                                                                                                               |
| 1b  | Assertions          | pass    | original: 10, converted: 10                                                                                                                                                        |
| 1c  | Test titles         | pass    | All three titles preserved verbatim                                                                                                                                                |
| 1d  | Describe blocks     | pass    | Nested "Conflicting SSG paths" > "production mode" preserved                                                                                                                       |
| 2a  | URL paths           | na      | No HTTP requests                                                                                                                                                                   |
| 2b  | Response checks     | na      |                                                                                                                                                                                    |
| 2c  | FS checks           | pass    | Uses `next.patchFile` / `next.deleteFile`                                                                                                                                          |
| 2d  | Browser checks      | na      |                                                                                                                                                                                    |
| 2e  | Build output        | pass    | `next.build()` + `next.cliOutput` mirror `nextBuild` stdout/stderr assertions                                                                                                      |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                                    |
| 3a  | nextTestSetup       | pass    | Imports from `'e2e-utils'`                                                                                                                                                         |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                                 |
| 3c  | skipStart           | pass    | Build-only, `skipStart: true`, calls `next.build()` manually                                                                                                                       |
| 3d  | No manual lifecycle | pass    | No lifecycle helpers used                                                                                                                                                          |
| 3e  | Cleanup             | pass    | `afterEach` deletes pages, matching original `fs.remove(pagesDir)`                                                                                                                 |
| 4a  | Directory placement | pass    | `test/production/` correct (build-only prod behavior)                                                                                                                              |
| 4b  | Mode guards         | warn    | `if (!isNextStart)` inside describe with `nextTestSetup()` — redundant in `test/production/` and matches the anti-pattern described in 4c (runs setup unnecessarily); see Warnings |
| 4c  | Turbopack guards    | na      | Original's `TURBOPACK_DEV` was dev-mode dedup; moving to `test/production/` makes it unnecessary                                                                                   |
| 4d  | Dedup guards        | na      | No longer needed after directory placement                                                                                                                                         |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` references                                                                                                                                    |
| 5a  | render              | na      |                                                                                                                                                                                    |
| 5b  | fetch               | na      |                                                                                                                                                                                    |
| 5c  | browser             | na      |                                                                                                                                                                                    |
| 5d  | check→retry         | na      |                                                                                                                                                                                    |
| 5e  | File class          | na      |                                                                                                                                                                                    |
| 5f  | waitFor             | na      |                                                                                                                                                                                    |
| 5g  | fs operations       | pass    | `fs.writeFile`/`ensureDir` → `next.patchFile`                                                                                                                                      |
| 6a  | Fixtures exist      | pass    | Original had no fixture files either; pages are created at test time via `patchFile`                                                                                               |
| 6b  | next.config.js      | na      | Neither original nor converted has one                                                                                                                                             |
| 6c  | Overrides           | na      |                                                                                                                                                                                    |
| 7a  | No dead code        | warn    | The `if (!isNextStart)` branch is dead code in `test/production/` (always start mode)                                                                                              |
| 7b  | retry over timeout  | na      |                                                                                                                                                                                    |
| 7c  | async/await         | pass    |                                                                                                                                                                                    |
| 7d  | eslint              | pass    |                                                                                                                                                                                    |

## Issues

None.

## Warnings

- The `if (!isNextStart) { it('skipped for non-start mode', () => {}); return }` block sits inside the `describe` that calls `nextTestSetup()`. Per the checklist (4c) this is the anti-pattern to avoid — it still invokes `nextTestSetup` before bailing. It's also dead in `test/production/` since `isNextStart` is always true here. Removing both the guard and the placeholder `it` would be cleaner.
