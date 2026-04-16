# firebase-grpc: PASS

Clean conversion preserving both tests, assertions, and skipStart pattern for a build-only test.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                               |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2 (1 skipped), converted: 2 (1 skipped)                                                                                  |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                                                                                          |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                                     |
| 1d  | Describe blocks     | pass    | Outer "Building Firebase" retained; inner "production mode" collapsed (directory placement provides equivalent scoping)            |
| 2a  | URL paths           | na      | No HTTP access in tests                                                                                                            |
| 2b  | Response checks     | na      | No response checks                                                                                                                 |
| 2c  | FS checks           | pass    | Uses `next.patchFile()` instead of direct `fs.writeFile(nextConfig)`                                                               |
| 2d  | Browser checks      | na      |                                                                                                                                    |
| 2e  | Build output        | pass    | `next.build()` + `next.cliOutput` used equivalently to `nextBuild()` stdout/stderr                                                 |
| 2f  | Dynamic logic       | na      |                                                                                                                                    |
| 3a  | nextTestSetup       | pass    |                                                                                                                                    |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                 |
| 3c  | skipStart           | pass    | Build-only tests, uses `skipStart: true` + explicit `next.build()`                                                                 |
| 3d  | No manual lifecycle | pass    | No nextBuild/launchApp imports                                                                                                     |
| 3e  | Cleanup             | pass    | Original's `fs.remove(nextConfig)` not needed — fixture has no next.config.js initially, and isolated per-test setup handles state |
| 4a  | Directory placement | pass    | `test/production/` correct; original was production-mode only                                                                      |
| 4b  | Mode guards         | na      | No dev/prod branching in original                                                                                                  |
| 4c  | Turbopack guards    | na      | Original skipped TURBOPACK_DEV which is covered by directory placement (production only)                                           |
| 4d  | Dedup guards        | pass    | TURBOPACK_DEV skip was a production-mode dedup; directory placement in `test/production/` provides equivalent behavior             |
| 4e  | No incorrect env    | pass    |                                                                                                                                    |
| 5a  | render              | na      |                                                                                                                                    |
| 5b  | fetch               | na      |                                                                                                                                    |
| 5c  | browser             | na      |                                                                                                                                    |
| 5d  | check→retry         | na      |                                                                                                                                    |
| 5e  | File class          | na      |                                                                                                                                    |
| 5f  | waitFor             | na      |                                                                                                                                    |
| 5g  | fs operations       | pass    | `fs.writeFile(nextConfig, ...)` → `next.patchFile('next.config.js', ...)`                                                          |
| 6a  | Fixtures exist      | pass    | pages/page-1.js, pages/page-2.js present (matches original)                                                                        |
| 6b  | next.config.js      | pass    | Neither original nor converted ship a static next.config.js; tests write it inline when needed                                     |
| 6c  | Overrides           | pass    | `dependencies: { firebase: 'latest' }` added for isolation (original relied on root install)                                       |
| 7a  | No dead code        | pass    |                                                                                                                                    |
| 7b  | retry over timeout  | na      |                                                                                                                                    |
| 7c  | async/await         | pass    |                                                                                                                                    |
| 7d  | eslint              | pass    |                                                                                                                                    |

## Issues

None

## Warnings

None
