# static-404: PASS

Faithful conversion with 3 tests preserved and proper use of `nextTestSetup({ skipStart: true })`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                 |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 3, converted: 3                                                                                                            |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                                                                            |
| 1c  | Test titles         | pass    | All three preserved verbatim                                                                                                         |
| 1d  | Describe blocks     | pass    | Outer describe flattened; inner production-mode wrapper dropped (directory placement covers it)                                      |
| 2a  | URL paths           | pass    | `/non-existent` via `next.render()`                                                                                                  |
| 2b  | Response checks     | pass    | `toContain('This page could not be found')` preserved                                                                                |
| 2c  | FS checks           | pass    | Uses `next.patchFile` / `next.deleteFile` instead of `fs`                                                                            |
| 2d  | Browser checks      | na      |                                                                                                                                      |
| 2e  | Build output        | pass    | `next.build()` used in all three                                                                                                     |
| 2f  | Dynamic logic       | na      |                                                                                                                                      |
| 3a  | nextTestSetup       | pass    |                                                                                                                                      |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                   |
| 3c  | skipStart           | pass    | `skipStart: true`; build-only tests 2 & 3, test 1 manually starts/stops                                                              |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/nextBuild imports                                                                                                |
| 3e  | Cleanup             | pass    | `deleteFile` mirrors original afterEach cleanup inline; next handles isolated dir cleanup                                            |
| 4a  | Directory placement | pass    | `test/production/` appropriate (original restricted to production-mode describe)                                                     |
| 4b  | Mode guards         | na      | Prod-only                                                                                                                            |
| 4c  | Turbopack guards    | pass    | Original `TURBOPACK_DEV` skip naturally handled by `test/production/` placement                                                      |
| 4d  | Dedup guards        | na      |                                                                                                                                      |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` env checks                                                                                      |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render()`                                                                                                    |
| 5b  | fetch               | na      |                                                                                                                                      |
| 5c  | browser             | na      |                                                                                                                                      |
| 5d  | check→retry         | na      |                                                                                                                                      |
| 5e  | File class          | na      |                                                                                                                                      |
| 5f  | waitFor             | na      |                                                                                                                                      |
| 5g  | fs operations       | pass    | `fs.writeFile`/`fs.remove` → `next.patchFile`/`next.deleteFile`                                                                      |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present                                                                                                             |
| 6b  | next.config.js      | pass    | Original `next.config.js` was created/removed per-test and defaults to empty; tests never actually write one, so omission is correct |
| 6c  | Overrides           | na      |                                                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                                                      |
| 7b  | retry over timeout  | na      |                                                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                                                      |

## Issues

None

## Warnings

None
