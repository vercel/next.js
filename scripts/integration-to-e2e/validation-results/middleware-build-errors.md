# middleware-build-errors: PASS

Conversion preserves all 7 test cases, assertions, and build-error validation logic using `next.build()` + `next.cliOutput` with `skipStart: true`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                 |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 7, converted: 7                                                                                                                            |
| 1b  | Assertions          | pass    | original: 14, converted: 14                                                                                                                          |
| 1c  | Test titles         | pass    | All preserved                                                                                                                                        |
| 1d  | Describe blocks     | pass    | Same structure                                                                                                                                       |
| 2a  | URL paths           | na      | No HTTP requests                                                                                                                                     |
| 2b  | Response checks     | na      |                                                                                                                                                      |
| 2c  | FS checks           | pass    | patchFile used instead of fs.writeFile                                                                                                               |
| 2d  | Browser checks      | na      |                                                                                                                                                      |
| 2e  | Build output        | pass    | next.build() + next.cliOutput                                                                                                                        |
| 2f  | Dynamic logic       | na      |                                                                                                                                                      |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                      |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                   |
| 3c  | skipStart           | pass    | Build-only, skipStart: true                                                                                                                          |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                      |
| 3e  | Cleanup             | pass    | middleware reset inline via patchFile                                                                                                                |
| 4a  | Directory placement | pass    | test/production/ correct                                                                                                                             |
| 4b  | Mode guards         | pass    | isNextStart guard used                                                                                                                               |
| 4c  | Turbopack guards    | warn    | `if (!isNextStart) return` is inside describe that called nextTestSetup; since test/production only runs in start mode, guard is effectively a no-op |
| 4d  | Dedup guards        | na      | Original TURBOPACK_DEV dedup now implicit via test/production placement                                                                              |
| 4e  | No incorrect env    | pass    |                                                                                                                                                      |
| 5a  | render              | na      |                                                                                                                                                      |
| 5b  | fetch               | na      |                                                                                                                                                      |
| 5c  | browser             | na      |                                                                                                                                                      |
| 5d  | check→retry         | na      |                                                                                                                                                      |
| 5e  | File class          | pass    | fs-extra writeFile → next.patchFile                                                                                                                  |
| 5f  | waitFor             | na      |                                                                                                                                                      |
| 5g  | fs operations       | pass    |                                                                                                                                                      |
| 6a  | Fixtures exist      | pass    | middleware.js, pages/index.js present                                                                                                                |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                    |
| 6c  | Overrides           | na      |                                                                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                                                                      |
| 7b  | retry over timeout  | na      |                                                                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                                                                      |

## Issues

None

## Warnings

- The `if (!isNextStart) { it('skipped', () => {}); return }` pattern sits after `nextTestSetup()` is called; since this test lives in `test/production/` (always start mode), the guard is dead code. Consider removing it, or alternatively wrap the describe with `(isNextStart ? describe : describe.skip)` outside the `nextTestSetup` call.
- The original had `beforeEach(() => remove(join(appDir, '.next')))` — the converted test relies on `next.build()` overwriting `.next`, which should be equivalent but subtly differs if stale artifacts could influence the second build.
