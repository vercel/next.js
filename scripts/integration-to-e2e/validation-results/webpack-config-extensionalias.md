# webpack-config-extensionalias: PASS

Clean 1:1 conversion of a single build-only test, with proper Turbopack skip guard and fixture files intact.

## Criteria

| #   | Criterion           | Verdict | Note                                                                         |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                                    |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                                    |
| 1c  | Test titles         | pass    | Preserved exactly                                                            |
| 1d  | Describe blocks     | pass    | Single describe preserved                                                    |
| 2a  | URL paths           | na      | Build-only test                                                              |
| 2b  | Response checks     | na      |                                                                              |
| 2c  | FS checks           | na      |                                                                              |
| 2d  | Browser checks      | na      |                                                                              |
| 2e  | Build output        | pass    | `nextBuild` code → `next.build()` exitCode                                   |
| 2f  | Dynamic logic       | na      |                                                                              |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                        |
| 3b  | files param         | pass    | `files: __dirname`                                                           |
| 3c  | skipStart           | pass    | Build-only, uses `skipStart: true`                                           |
| 3d  | No manual lifecycle | pass    | No manual helpers                                                            |
| 3e  | Cleanup             | pass    | No cleanup needed                                                            |
| 4a  | Directory placement | pass    | `test/production/` correct for build-only                                    |
| 4b  | Mode guards         | na      |                                                                              |
| 4c  | Turbopack guards    | pass    | `IS_TURBOPACK_TEST ? describe.skip` wraps outside setup                      |
| 4d  | Dedup guards        | na      |                                                                              |
| 4e  | No incorrect env    | pass    |                                                                              |
| 5a  | render              | na      |                                                                              |
| 5b  | fetch               | na      |                                                                              |
| 5c  | browser             | na      |                                                                              |
| 5d  | check→retry         | na      |                                                                              |
| 5e  | File class          | na      |                                                                              |
| 5f  | waitFor             | na      |                                                                              |
| 5g  | fs operations       | na      |                                                                              |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/pagewithimport.js, components/TsxComponent.tsx present |
| 6b  | next.config.js      | pass    | Present in fixture dir                                                       |
| 6c  | Overrides           | na      |                                                                              |
| 7a  | No dead code        | pass    |                                                                              |
| 7b  | retry over timeout  | na      |                                                                              |
| 7c  | async/await         | pass    |                                                                              |
| 7d  | eslint              | pass    |                                                                              |

## Issues

None

## Warnings

None
