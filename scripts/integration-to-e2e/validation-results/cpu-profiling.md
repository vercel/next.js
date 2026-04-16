# cpu-profiling: PASS

Original two build tests are preserved verbatim in `test/production/cpu-profiling/cpu-profiling.test.ts`, and the e2e directory adds supplementary dev/start/build coverage.

## Criteria

| #   | Criterion           | Verdict | Note                                                                       |
| --- | ------------------- | ------- | -------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted (production): 2; plus 3 additional e2e tests        |
| 1b  | Assertions          | pass    | original: 6; production-converted: 6; more across e2e files                |
| 1c  | Test titles         | pass    | Both original titles preserved in production test                          |
| 1d  | Describe blocks     | pass    | `CPU Profiling` > `next build --experimental-cpu-prof` preserved           |
| 2a  | URL paths           | na      | Original did no HTTP                                                       |
| 2b  | Response checks     | na      |                                                                            |
| 2c  | FS checks           | pass    | Uses `next.testDir` for `.next-profiles`; uses `next.cliOutput` for stdout |
| 2d  | Browser checks      | na      |                                                                            |
| 2e  | Build output        | pass    | `next.build({ args })` + `next.cliOutput`                                  |
| 2f  | Dynamic logic       | na      |                                                                            |
| 3a  | nextTestSetup       | pass    | All four files use `nextTestSetup`                                         |
| 3b  | files param         | pass    | `__dirname` / `fixtures/basic-app`                                         |
| 3c  | skipStart           | pass    | Build-only production test uses `skipStart: true`                          |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`launchApp` imports                                         |
| 3e  | Cleanup             | pass    | Framework handles                                                          |
| 4a  | Directory placement | pass    | Original was build-only; production dir is correct                         |
| 4b  | Mode guards         | pass    | e2e files use `isNextDev`/`skipped` guards for dev/deploy skipping         |
| 4c  | Turbopack guards    | pass    | e2e build test branches on `isTurbopack` (no skipping needed)              |
| 4d  | Dedup guards        | na      | Original had none                                                          |
| 4e  | No incorrect env    | pass    |                                                                            |
| 5a  | render              | na      |                                                                            |
| 5b  | fetch               | pass    | e2e files use `next.fetch('/')`                                            |
| 5c  | browser             | na      |                                                                            |
| 5d  | check→retry         | pass    | e2e dev/start use `retry()`                                                |
| 5e  | File class          | na      |                                                                            |
| 5f  | waitFor             | pass    | Not used                                                                   |
| 5g  | fs operations       | pass    | Uses `next.testDir` + `fs-extra` (testDir is isolated)                     |
| 6a  | Fixtures exist      | pass    | `app/layout.tsx`, `app/page.tsx`, `tsconfig.json` present in both dirs     |
| 6b  | next.config.js      | na      | Original had none                                                          |
| 6c  | Overrides           | na      |                                                                            |
| 7a  | No dead code        | pass    |                                                                            |
| 7b  | retry over timeout  | pass    |                                                                            |
| 7c  | async/await         | pass    |                                                                            |
| 7d  | eslint              | pass    |                                                                            |

## Issues

None

## Warnings

None
