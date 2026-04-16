# jsconfig-baseurl: PASS

Clean, faithful conversion with appropriate mode splitting for e2e.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                  |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3                                                                                             |
| 1b  | Assertions          | pass    | original: 5, converted: 5                                                                                             |
| 1c  | Test titles         | pass    | All preserved                                                                                                         |
| 1d  | Describe blocks     | pass    | Structure preserved                                                                                                   |
| 2a  | URL paths           | pass    | /hello preserved via next.render                                                                                      |
| 2b  | Response checks     | pass    |                                                                                                                       |
| 2c  | FS checks           | pass    | fs.readFile/readJSON → next.readFile                                                                                  |
| 2d  | Browser checks      | na      |                                                                                                                       |
| 2e  | Build output        | pass    | trace file read via next.readFile                                                                                     |
| 2f  | Dynamic logic       | pass    | dev-only test guarded with isNextDev                                                                                  |
| 3a  | nextTestSetup       | pass    |                                                                                                                       |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                    |
| 3c  | skipStart           | na      | e2e runs both modes                                                                                                   |
| 3d  | No manual lifecycle | pass    |                                                                                                                       |
| 3e  | Cleanup             | pass    | patchFile restore in finally                                                                                          |
| 4a  | Directory placement | pass    | test/e2e/ correct (dev+prod behavior)                                                                                 |
| 4b  | Mode guards         | pass    | isNextDev/isNextStart guards used                                                                                     |
| 4c  | Turbopack guards    | na      |                                                                                                                       |
| 4d  | Dedup guards        | warn    | original TURBOPACK_DEV skip on prod block replaced with isNextStart guard — reasonable since e2e splits dev/prod jobs |
| 4e  | No incorrect env    | pass    |                                                                                                                       |
| 5a  | render              | pass    |                                                                                                                       |
| 5b  | fetch               | na      |                                                                                                                       |
| 5c  | browser             | na      |                                                                                                                       |
| 5d  | check→retry         | na      | original already used retry                                                                                           |
| 5e  | File class          | na      | uses patchFile correctly                                                                                              |
| 5f  | waitFor             | na      |                                                                                                                       |
| 5g  | fs operations       | pass    | migrated to next.readFile                                                                                             |
| 6a  | Fixtures exist      | pass    | pages/hello.js, components/world.js, jsconfig.json, next.config.js present                                            |
| 6b  | next.config.js      | pass    |                                                                                                                       |
| 6c  | Overrides           | na      |                                                                                                                       |
| 7a  | No dead code        | pass    |                                                                                                                       |
| 7b  | retry over timeout  | pass    |                                                                                                                       |
| 7c  | async/await         | pass    |                                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                                       |

## Issues

None

## Warnings

- 4d: Original used `process.env.TURBOPACK_DEV ? describe.skip : describe` to dedup the production-mode build trace test. Converted replaces this with `isNextStart` gating, which is the correct pattern for e2e (the harness runs dev and start in separate jobs), but the semantics differ slightly — worth noting but appropriate for the new test location.
