# document-file-dependencies: PASS

Clean conversion of a 3-test production-only suite with all behavior preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                              |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3 (+1 unreachable stub)                                                                                                   |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                                                                                         |
| 1c  | Test titles         | pass    | All three preserved verbatim                                                                                                                      |
| 1d  | Describe blocks     | pass    | Same nesting: File Dependencies → production mode                                                                                                 |
| 2a  | URL paths           | pass    | /, /**not_found**, /error-trigger all accessed                                                                                                    |
| 2b  | Response checks     | pass    | Identical styles equality checks                                                                                                                  |
| 2c  | FS checks           | na      |                                                                                                                                                   |
| 2d  | Browser checks      | pass    | next.browser + elementByCss + eval preserved                                                                                                      |
| 2e  | Build output        | na      |                                                                                                                                                   |
| 2f  | Dynamic logic       | na      |                                                                                                                                                   |
| 3a  | nextTestSetup       | pass    | Used from e2e-utils                                                                                                                               |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                |
| 3c  | skipStart           | na      | Server interaction needed                                                                                                                         |
| 3d  | No manual lifecycle | pass    | No findPort/killApp/nextBuild/nextStart                                                                                                           |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                                                                                                          |
| 4a  | Directory placement | pass    | test/production/ matches prod-only original                                                                                                       |
| 4b  | Mode guards         | pass    | isNextStart guard (redundant but harmless)                                                                                                        |
| 4c  | Turbopack guards    | warn    | Uses `if (!isNextStart) return` inside describe after `nextTestSetup()` — discouraged pattern per criterion 4c, though benign in test/production/ |
| 4d  | Dedup guards        | pass    | Original TURBOPACK_DEV skip handled by test/production/ placement                                                                                 |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD refs                                                                                                                       |
| 5a  | render              | na      |                                                                                                                                                   |
| 5b  | fetch               | na      |                                                                                                                                                   |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                                                          |
| 5d  | check→retry         | na      |                                                                                                                                                   |
| 5e  | File class          | na      |                                                                                                                                                   |
| 5f  | waitFor             | pass    | `waitForElementByCss` swapped for `elementByCss`                                                                                                  |
| 5g  | fs operations       | na      |                                                                                                                                                   |
| 6a  | Fixtures exist      | pass    | pages/{index,404,\_app,\_error,error-trigger}.js and all 4 css files present                                                                      |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                 |
| 6c  | Overrides           | na      |                                                                                                                                                   |
| 7a  | No dead code        | pass    |                                                                                                                                                   |
| 7b  | retry over timeout  | pass    |                                                                                                                                                   |
| 7c  | async/await         | pass    |                                                                                                                                                   |
| 7d  | eslint              | pass    |                                                                                                                                                   |

## Issues

None

## Warnings

- The converted test uses `if (!isNextStart) { it('skipped'); return }` inside the describe block that already called `nextTestSetup()`. Since the file lives in `test/production/`, `isNextStart` is always true in practice, so this is a harmless no-op — but it violates the guard pattern in criterion 4c (setup is invoked before the skip decision). Safe to drop the guard entirely.
- `webdriver`'s `waitForElementByCss` was replaced with `elementByCss` (no implicit wait). Works here because the elements are server-rendered in the initial HTML, but worth noting if the pages ever change to client-hydrated.
