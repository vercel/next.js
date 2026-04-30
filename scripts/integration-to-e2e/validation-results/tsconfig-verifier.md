# tsconfig-verifier: PASS

High-fidelity conversion preserving all 14 tests and assertions, with correct use of `skipStart`, `next.patchFile`/`readFile`/`hasFile`/`deleteFile`, and `next.build()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                    |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 14 (13 active + 1 `it.skip`), converted: 14 (13 active + 1 `it.skip`)                                                         |
| 1b  | Assertions          | pass    | every `expect(...)` incl. inline snapshots preserved 1-for-1                                                                            |
| 1c  | Test titles         | pass    | All 14 titles identical                                                                                                                 |
| 1d  | Describe blocks     | pass    | Single top-level describe preserved                                                                                                     |
| 2a  | URL paths           | na      | No HTTP calls                                                                                                                           |
| 2b  | Response checks     | pass    | `stderr+stdout not.toContain` → `next.cliOutput not.toContain` preserved                                                                |
| 2c  | FS checks           | pass    | `existsSync`→`next.hasFile`, `readFile`→`next.readFile`                                                                                 |
| 2d  | Browser checks      | na      |                                                                                                                                         |
| 2e  | Build output        | pass    | `nextBuild` return `code` → `next.build()` `exitCode`                                                                                   |
| 2f  | Dynamic logic       | na      | Only `strictRouteTypes` env branching, preserved                                                                                        |
| 3a  | nextTestSetup       | pass    | `nextTestSetup({ files: __dirname, skipStart: true })`                                                                                  |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                      |
| 3c  | skipStart           | pass    | Build-only test; `skipStart: true` used                                                                                                 |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`launchApp` etc.                                                                                                         |
| 3e  | Cleanup             | pass    | `beforeEach`/`afterEach` call `next.deleteFile` for both configs                                                                        |
| 4a  | Directory placement | pass    | `test/production/` correct (prod-build-only test)                                                                                       |
| 4b  | Mode guards         | pass    | `isNextStart` early return guards non-start mode                                                                                        |
| 4c  | Turbopack guards    | na      | Original `TURBOPACK_DEV?describe.skip` was a mode-dedup (skip dev), not a turbopack-only skip; moving to `test/production/` subsumes it |
| 4d  | Dedup guards        | pass    | Original dev-skip dedup now enforced by `test/production/` placement                                                                    |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` references                                                                                         |
| 5a  | render              | na      |                                                                                                                                         |
| 5b  | fetch               | na      |                                                                                                                                         |
| 5c  | browser             | na      |                                                                                                                                         |
| 5d  | check→retry         | na      | No `check()` in original                                                                                                                |
| 5e  | File class          | na      |                                                                                                                                         |
| 5f  | waitFor             | pass    | `setTimeout(resolve, 500)` retained from original as FS-flush timing delay (not async state polling) — mirrors original behavior        |
| 5g  | fs operations       | pass    | All fs-extra calls converted to `next.*` helpers                                                                                        |
| 6a  | Fixtures exist      | pass    | `app/layout.tsx`, `app/test/page.tsx`, `pages/index.tsx`, `value.ts` all present                                                        |
| 6b  | next.config.js      | na      | Neither original nor converted has one                                                                                                  |
| 6c  | Overrides           | na      |                                                                                                                                         |
| 7a  | No dead code        | pass    | `it.skip` preserved from original (TypeScript 5.4 TODO)                                                                                 |
| 7b  | retry over timeout  | pass    | setTimeouts are FS-flush delays copied from original                                                                                    |
| 7c  | async/await         | pass    | All operations awaited                                                                                                                  |
| 7d  | eslint              | pass    | Removed the original `/* eslint-env jest */` directive; no duplicate titles                                                             |

## Issues

None.

## Warnings

None.
