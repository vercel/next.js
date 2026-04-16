# invalid-server-options: WARN

Tests are preserved 1:1, but the suite is a unit-style test that doesn't use `nextTestSetup` and may be better placed in `test/unit/` rather than `test/e2e/`.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                  |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 8, converted: 8                                                                                                                             |
| 1b  | Assertions          | pass    | original: 8, converted: 8                                                                                                                             |
| 1c  | Test titles         | pass    | All 8 titles identical                                                                                                                                |
| 1d  | Describe blocks     | pass    | Single `describe('Invalid server options')` preserved                                                                                                 |
| 2a  | URL paths           | na      | No HTTP requests                                                                                                                                      |
| 2b  | Response checks     | na      |                                                                                                                                                       |
| 2c  | FS checks           | na      |                                                                                                                                                       |
| 2d  | Browser checks      | na      |                                                                                                                                                       |
| 2e  | Build output        | na      |                                                                                                                                                       |
| 2f  | Dynamic logic       | na      |                                                                                                                                                       |
| 3a  | nextTestSetup       | warn    | Not used; test imports `next` directly and validates option parsing synchronously. Acceptable for this unit-style test, but violates the default rule |
| 3b  | files param         | na      | No nextTestSetup                                                                                                                                      |
| 3c  | skipStart           | na      |                                                                                                                                                       |
| 3d  | No manual lifecycle | pass    | No forbidden lifecycle helpers                                                                                                                        |
| 3e  | Cleanup             | pass    | No cleanup needed                                                                                                                                     |
| 4a  | Directory placement | warn    | Placed in `test/e2e/` but behaves like a unit test — never starts a server. `test/unit/` would be a better fit                                        |
| 4b  | Mode guards         | na      |                                                                                                                                                       |
| 4c  | Turbopack guards    | na      |                                                                                                                                                       |
| 4d  | Dedup guards        | na      |                                                                                                                                                       |
| 4e  | No incorrect env    | pass    |                                                                                                                                                       |
| 5a  | render              | na      |                                                                                                                                                       |
| 5b  | fetch               | na      |                                                                                                                                                       |
| 5c  | browser             | na      |                                                                                                                                                       |
| 5d  | check→retry         | na      |                                                                                                                                                       |
| 5e  | File class          | na      |                                                                                                                                                       |
| 5f  | waitFor             | na      |                                                                                                                                                       |
| 5g  | fs operations       | na      | `dir = __dirname` points to fixture dir, still works with synchronous validation                                                                      |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present                                                                                                                              |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                     |
| 6c  | Overrides           | na      |                                                                                                                                                       |
| 7a  | No dead code        | pass    |                                                                                                                                                       |
| 7b  | retry over timeout  | na      |                                                                                                                                                       |
| 7c  | async/await         | pass    |                                                                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                                                                       |

## Issues

None.

## Warnings

- Does not use `nextTestSetup`. This test is effectively a unit test that exercises synchronous option validation in the `next()` factory — no server is started. The conversion preserves this pattern verbatim, which may be intentional, but it sits outside the standard e2e harness.
- Placement in `test/e2e/` is arguable; `test/unit/` would better reflect the nature of the tests.
