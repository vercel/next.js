# catches-missing-getStaticProps: PASS

Clean, faithful conversion with equivalent test coverage and correct dedup guards for dev/prod across turbopack.

## Criteria

| #   | Criterion           | Verdict | Note                                                          |
| --- | ------------------- | ------- | ------------------------------------------------------------- | --- | ----------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                     |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                     |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                |
| 1d  | Describe blocks     | pass    | Nested describes flattened into isNextDev/isNextStart guards  |
| 2a  | URL paths           | pass    | `/hello` preserved via `next.render`                          |
| 2b  | Response checks     | pass    | errorRegex match preserved                                    |
| 2c  | FS checks           | na      |                                                               |
| 2d  | Browser checks      | na      |                                                               |
| 2e  | Build output        | pass    | `next.build()` + `cliOutput` replaces `nextBuild(...).stderr` |
| 2f  | Dynamic logic       | pass    | dev/prod split mapped to `isNextDev`/`isNextStart`            |
| 3a  | nextTestSetup       | pass    |                                                               |
| 3b  | files param         | pass    | `files: __dirname`                                            |
| 3c  | skipStart           | pass    | `skipStart: isNextStart` for build-only path                  |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp/nextBuild imports               |
| 3e  | Cleanup             | pass    | Managed by nextTestSetup                                      |
| 4a  | Directory placement | pass    | `test/e2e/` — runs in both dev and prod                       |
| 4b  | Mode guards         | pass    | isNextDev/isNextStart used correctly                          |
| 4c  | Turbopack guards    | pass    | Outer describe wraps nextTestSetup                            |
| 4d  | Dedup guards        | pass    | `(isNextDev && TURBOPACK_BUILD)                               |     | (isNextStart && TURBOPACK_DEV)` preserved |
| 4e  | No incorrect env    | pass    | Only used in allowed dedup form                               |
| 5a  | render              | pass    |                                                               |
| 5b  | fetch               | na      |                                                               |
| 5c  | browser             | na      |                                                               |
| 5d  | check→retry         | na      |                                                               |
| 5e  | File class          | na      |                                                               |
| 5f  | waitFor             | na      |                                                               |
| 5g  | fs operations       | na      |                                                               |
| 6a  | Fixtures exist      | pass    | `pages/[slug].js` present                                     |
| 6b  | next.config.js      | na      | Original had none                                             |
| 6c  | Overrides           | na      |                                                               |
| 7a  | No dead code        | pass    |                                                               |
| 7b  | retry over timeout  | na      |                                                               |
| 7c  | async/await         | pass    |                                                               |
| 7d  | eslint              | pass    |                                                               |

## Issues

None

## Warnings

None
