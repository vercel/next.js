# initial-ref: PASS

Clean, faithful conversion of a simple 1-test suite that ran in both dev and prod.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                 |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1 (runTest called 2x = 2 invocations), converted: 1 (runs in both modes via nextTestSetup)                 |
| 1b  | Assertions          | pass    | original: 1 per invocation, converted: 1                                                                             |
| 1c  | Test titles         | pass    | 'Has correct initial ref values' preserved                                                                           |
| 1d  | Describe blocks     | pass    | Inner mode describes flattened; nextTestSetup handles modes                                                          |
| 2a  | URL paths           | pass    | '/' preserved                                                                                                        |
| 2b  | Response checks     | pass    | `#ref-val` text check preserved                                                                                      |
| 2c  | FS checks           | na      |                                                                                                                      |
| 2d  | Browser checks      | pass    | webdriver → next.browser                                                                                             |
| 2e  | Build output        | na      |                                                                                                                      |
| 2f  | Dynamic logic       | pass    | runTest same for both modes; no mode-specific logic                                                                  |
| 3a  | nextTestSetup       | pass    |                                                                                                                      |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                   |
| 3c  | skipStart           | na      | Not build-only                                                                                                       |
| 3d  | No manual lifecycle | pass    |                                                                                                                      |
| 3e  | Cleanup             | pass    |                                                                                                                      |
| 4a  | Directory placement | pass    | test/e2e/ (runs both dev+prod)                                                                                       |
| 4b  | Mode guards         | na      | Same behavior both modes                                                                                             |
| 4c  | Turbopack guards    | pass    | Original TURBOPACK_DEV/TURBOPACK_BUILD were dedup guards; nextTestSetup handles mode coverage                        |
| 4d  | Dedup guards        | warn    | Original had dedup guards; converted doesn't preserve them explicitly, but this is standard for e2e test conversions |
| 4e  | No incorrect env    | pass    |                                                                                                                      |
| 5a  | render              | na      |                                                                                                                      |
| 5b  | fetch               | na      |                                                                                                                      |
| 5c  | browser             | pass    |                                                                                                                      |
| 5d  | check→retry         | na      |                                                                                                                      |
| 5e  | File class          | na      |                                                                                                                      |
| 5f  | waitFor             | na      |                                                                                                                      |
| 5g  | fs operations       | na      |                                                                                                                      |
| 6a  | Fixtures exist      | pass    | pages/index.js present                                                                                               |
| 6b  | next.config.js      | na      | None in original                                                                                                     |
| 6c  | Overrides           | na      |                                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                                      |
| 7b  | retry over timeout  | pass    |                                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                                      |
| 7d  | eslint              | pass    |                                                                                                                      |

## Issues

None

## Warnings

- 4d: Original had TURBOPACK_DEV/TURBOPACK_BUILD dedup guards on the describe blocks. These aren't explicitly preserved in the converted test, but this is typical for e2e conversions where nextTestSetup's built-in mode coverage supersedes the manual guards.
