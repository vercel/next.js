# router-prefetch: WARN

Conversion is solid and functionally equivalent, with one dropped test title merged into an equivalent test.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                 |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | warn    | original: 3 (split across dev/prod describes), converted: 2                                                          |
| 1b  | Assertions          | pass    | original: 2 `expect` calls, converted: 2                                                                             |
| 1c  | Test titles         | warn    | 'should resolve prefetch promise with invalid href' merged into 'should resolve prefetch promise' (same body)        |
| 1d  | Describe blocks     | pass    | dev/prod describes collapsed appropriately using isNextDev                                                           |
| 2a  | URL paths           | pass    | Both access '/'                                                                                                      |
| 2b  | Response checks     | pass    | Same DOM selectors/assertions                                                                                        |
| 2c  | FS checks           | na      |                                                                                                                      |
| 2d  | Browser checks      | pass    | webdriver → next.browser with equivalent interactions                                                                |
| 2e  | Build output        | na      |                                                                                                                      |
| 2f  | Dynamic logic       | pass    | dev-only path preserved via `if (isNextDev)`                                                                         |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from e2e-utils                                                                                    |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                   |
| 3c  | skipStart           | na      | Not build-only                                                                                                       |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp imports                                                                                |
| 3e  | Cleanup             | pass    | browser.close() preserved                                                                                            |
| 4a  | Directory placement | pass    | test/e2e/ correct — runs in both dev and prod                                                                        |
| 4b  | Mode guards         | pass    | `if (isNextDev)` wraps dev-only test                                                                                 |
| 4c  | Turbopack guards    | na      | Original env guards were dedup, not turbopack skips                                                                  |
| 4d  | Dedup guards        | na      | e2e harness handles mode dispatch; original TURBOPACK_DEV/BUILD guards were integration-suite dedup, not needed here |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD env reads                                                                                     |
| 5a  | render              | na      |                                                                                                                      |
| 5b  | fetch               | na      |                                                                                                                      |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                             |
| 5d  | check→retry         | na      |                                                                                                                      |
| 5e  | File class          | na      |                                                                                                                      |
| 5f  | waitFor             | na      | Uses waitForElementByCss (browser driver method, correct)                                                            |
| 5g  | fs operations       | na      |                                                                                                                      |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/another-page.js present                                                                        |
| 6b  | next.config.js      | na      | Original had none                                                                                                    |
| 6c  | Overrides           | na      |                                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                                      |
| 7b  | retry over timeout  | pass    |                                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                                      |

## Issues

None

## Warnings

- The two distinct titles in the original ('should resolve prefetch promise' in dev and 'should resolve prefetch promise with invalid href' in prod) were merged into one `it('should resolve prefetch promise', ...)` test. Because the e2e harness runs the same test in both dev and prod modes, coverage is preserved, but the "invalid href" wording is lost.
