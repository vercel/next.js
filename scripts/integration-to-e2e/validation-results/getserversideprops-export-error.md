# getserversideprops-export-error: PASS

Clean 1:1 conversion of a single build-only test; fixtures and assertions preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                         |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                                    |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                    |
| 1c  | Test titles         | pass    | "should show error for GSSP during export" preserved                                         |
| 1d  | Describe blocks     | pass    | Outer `getServerSideProps` kept; inner `production mode` flattened (prod-only via placement) |
| 2a  | URL paths           | na      | No HTTP requests                                                                             |
| 2b  | Response checks     | na      |                                                                                              |
| 2c  | FS checks           | na      | Cleanup handled by nextTestSetup                                                             |
| 2d  | Browser checks      | na      |                                                                                              |
| 2e  | Build output        | pass    | `next.build()` exit code + `next.cliOutput` regex match                                      |
| 2f  | Dynamic logic       | na      |                                                                                              |
| 3a  | nextTestSetup       | pass    | imported from `'e2e-utils'`                                                                  |
| 3b  | files param         | pass    | `files: __dirname`                                                                           |
| 3c  | skipStart           | pass    | `skipStart: true` used correctly for build-only test                                         |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`killApp` usage                                                               |
| 3e  | Cleanup             | pass    | No manual `.next`/`out` cleanup needed                                                       |
| 4a  | Directory placement | pass    | `test/production/` appropriate for prod-only build test                                      |
| 4b  | Mode guards         | na      |                                                                                              |
| 4c  | Turbopack guards    | na      | Original's `TURBOPACK_DEV` guard was a dedup guard, handled by `test/production/` placement  |
| 4d  | Dedup guards        | pass    | Handled implicitly by directory placement                                                    |
| 4e  | No incorrect env    | pass    |                                                                                              |
| 5a  | render              | na      |                                                                                              |
| 5b  | fetch               | na      |                                                                                              |
| 5c  | browser             | na      |                                                                                              |
| 5d  | check→retry         | na      |                                                                                              |
| 5e  | File class          | na      |                                                                                              |
| 5f  | waitFor             | na      |                                                                                              |
| 5g  | fs operations       | pass    | No direct fs; build output via `next.cliOutput`                                              |
| 6a  | Fixtures exist      | pass    | `pages/index.js`, `next.config.js` present                                                   |
| 6b  | next.config.js      | pass    | Identical to original                                                                        |
| 6c  | Overrides           | na      |                                                                                              |
| 7a  | No dead code        | pass    |                                                                                              |
| 7b  | retry over timeout  | na      |                                                                                              |
| 7c  | async/await         | pass    |                                                                                              |
| 7d  | eslint              | pass    |                                                                                              |

## Issues

None

## Warnings

None
