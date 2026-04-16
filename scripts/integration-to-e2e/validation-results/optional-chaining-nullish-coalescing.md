# optional-chaining-nullish-coalescing: PASS

Clean, minimal conversion — both tests preserved with identical assertions and a single `files: __dirname` fixture.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                       |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 2 `it(` calls, converted: 2                                                                                                      |
| 1b  | Assertions          | pass    | original: 4 `expect(`, converted: 4                                                                                                        |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                                             |
| 1d  | Describe blocks     | pass    | Nested dev/prod describes flattened — nextTestSetup covers both modes                                                                      |
| 2a  | URL paths           | pass    | `/optional-chaining` and `/nullish-coalescing` via `next.render()`                                                                         |
| 2b  | Response checks     | pass    | Same regex matches preserved                                                                                                               |
| 2c  | FS checks           | na      | None                                                                                                                                       |
| 2d  | Browser checks      | na      | None                                                                                                                                       |
| 2e  | Build output        | na      | None                                                                                                                                       |
| 2f  | Dynamic logic       | na      | runTests() inlined once; behavior identical across modes                                                                                   |
| 3a  | nextTestSetup       | pass    | From `e2e-utils`                                                                                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                         |
| 3c  | skipStart           | na      | Not build-only                                                                                                                             |
| 3d  | No manual lifecycle | pass    | No launchApp/nextBuild/etc                                                                                                                 |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                                   |
| 4a  | Directory placement | pass    | `test/e2e/` — runs in both dev and prod                                                                                                    |
| 4b  | Mode guards         | na      | Same behavior in both modes                                                                                                                |
| 4c  | Turbopack guards    | na      | Not Turbopack-skipped                                                                                                                      |
| 4d  | Dedup guards        | pass    | Original's `TURBOPACK_BUILD`/`TURBOPACK_DEV` describe-skip was mode-dedup; nextTestSetup naturally runs only the selected `NEXT_TEST_MODE` |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD references                                                                                                          |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                                                                            |
| 5b  | fetch               | na      | None                                                                                                                                       |
| 5c  | browser             | na      | None                                                                                                                                       |
| 5d  | check→retry         | na      | None                                                                                                                                       |
| 5e  | File class          | na      | None                                                                                                                                       |
| 5f  | waitFor             | na      | None                                                                                                                                       |
| 5g  | fs operations       | na      | None                                                                                                                                       |
| 6a  | Fixtures exist      | pass    | `pages/optional-chaining.js`, `pages/nullish-coalescing.js` present                                                                        |
| 6b  | next.config.js      | na      | Original had none                                                                                                                          |
| 6c  | Overrides           | na      | None                                                                                                                                       |
| 7a  | No dead code        | pass    |                                                                                                                                            |
| 7b  | retry over timeout  | na      |                                                                                                                                            |
| 7c  | async/await         | pass    |                                                                                                                                            |
| 7d  | eslint              | pass    |                                                                                                                                            |

## Issues

None

## Warnings

None
