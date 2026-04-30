# build-output: PASS

Clean conversion: 12 tests preserved, fixtures migrated correctly, uses `nextTestSetup` with `skipStart` + `next.build()` for a build-only suite.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                    |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 12, converted: 12 (incl. 2 skipped)                                                                           |
| 1b  | Assertions          | pass    | All expects preserved across matching tests                                                                             |
| 1c  | Test titles         | pass    | All titles preserved verbatim                                                                                           |
| 1d  | Describe blocks     | pass    | Loop over configs unrolled into two explicit describes; outer `TURBOPACK_DEV` wrapper dropped (now naturally prod-only) |
| 2a  | URL paths           | na      | No HTTP requests in suite                                                                                               |
| 2b  | Response checks     | na      |                                                                                                                         |
| 2c  | FS checks           | pass    | `recursiveReadDir` replaced by local walk over `next.testDir/.next`                                                     |
| 2d  | Browser checks      | na      |                                                                                                                         |
| 2e  | Build output        | pass    | `nextBuild` → `next.build()` with `cliOutput`                                                                           |
| 2f  | Dynamic logic       | na      |                                                                                                                         |
| 3a  | nextTestSetup       | pass    | Used for all six describes                                                                                              |
| 3b  | files param         | pass    | `join(__dirname, 'fixtures', ...)`                                                                                      |
| 3c  | skipStart           | pass    | All six setups use `skipStart: true`                                                                                    |
| 3d  | No manual lifecycle | pass    | No forbidden imports                                                                                                    |
| 3e  | Cleanup             | pass    | No manual cleanup needed; `File` write/delete replaced by `nextConfig` option                                           |
| 4a  | Directory placement | pass    | `test/production/` matches prod-only coverage                                                                           |
| 4b  | Mode guards         | na      |                                                                                                                         |
| 4c  | Turbopack guards    | pass    | Original `TURBOPACK_DEV` skip is superseded by prod-only directory                                                      |
| 4d  | Dedup guards        | na      |                                                                                                                         |
| 4e  | No incorrect env    | pass    |                                                                                                                         |
| 5a  | render              | na      |                                                                                                                         |
| 5b  | fetch               | na      |                                                                                                                         |
| 5c  | browser             | na      |                                                                                                                         |
| 5d  | check→retry         | na      |                                                                                                                         |
| 5e  | File class          | pass    | `new File(next.config.js)` replaced with `nextConfig: { experimental: { gzipSize: false } }`                            |
| 5f  | waitFor             | na      |                                                                                                                         |
| 5g  | fs operations       | pass    | Uses `next.testDir`, not original `appDir`                                                                              |
| 6a  | Fixtures exist      | pass    | All 5 fixture apps present with matching file trees                                                                     |
| 6b  | next.config.js      | pass    | gzipSize: false applied via `nextConfig` option instead of a config file                                                |
| 6c  | Overrides           | pass    | `nextConfig` usage equivalent to original dynamic write                                                                 |
| 7a  | No dead code        | pass    | Skipped snapshot test preserved as in original                                                                          |
| 7b  | retry over timeout  | na      |                                                                                                                         |
| 7c  | async/await         | pass    |                                                                                                                         |
| 7d  | eslint              | pass    |                                                                                                                         |

## Issues

None

## Warnings

None
