# error-plugin-stack-overflow: PASS

Clean 1:1 conversion of a build-only webpack plugin stack-overflow test using `skipStart` and `next.build()`.

## Criteria

| #   | Criterion           | Verdict | Note                                                              |
| --- | ------------------- | ------- | ----------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                         |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                         |
| 1c  | Test titles         | pass    | 'shows details in next build' preserved                           |
| 1d  | Describe blocks     | pass    | outer Turbopack-skip describe preserved                           |
| 2a  | URL paths           | na      | no HTTP access                                                    |
| 2b  | Response checks     | na      |                                                                   |
| 2c  | FS checks           | na      |                                                                   |
| 2d  | Browser checks      | na      |                                                                   |
| 2e  | Build output        | pass    | `next.build()` + `next.cliOutput` replaces `nextBuild` + `stderr` |
| 2f  | Dynamic logic       | na      |                                                                   |
| 3a  | nextTestSetup       | pass    |                                                                   |
| 3b  | files param         | pass    | `files: __dirname`                                                |
| 3c  | skipStart           | pass    | build-only; uses `skipStart: true`                                |
| 3d  | No manual lifecycle | pass    |                                                                   |
| 3e  | Cleanup             | pass    | none needed                                                       |
| 4a  | Directory placement | pass    | `test/production/` appropriate for build-only                     |
| 4b  | Mode guards         | na      |                                                                   |
| 4c  | Turbopack guards    | pass    | outer `IS_TURBOPACK_TEST ? describe.skip : describe` wraps setup  |
| 4d  | Dedup guards        | na      |                                                                   |
| 4e  | No incorrect env    | pass    |                                                                   |
| 5a  | render              | na      |                                                                   |
| 5b  | fetch               | na      |                                                                   |
| 5c  | browser             | na      |                                                                   |
| 5d  | check→retry         | na      |                                                                   |
| 5e  | File class          | na      |                                                                   |
| 5f  | waitFor             | na      |                                                                   |
| 5g  | fs operations       | na      |                                                                   |
| 6a  | Fixtures exist      | pass    | `pages/index.js` and `next.config.js` present                     |
| 6b  | next.config.js      | pass    | present in fixture dir                                            |
| 6c  | Overrides           | na      |                                                                   |
| 7a  | No dead code        | pass    |                                                                   |
| 7b  | retry over timeout  | na      |                                                                   |
| 7c  | async/await         | pass    |                                                                   |
| 7d  | eslint              | pass    |                                                                   |

## Issues

None

## Warnings

None
