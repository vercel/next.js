# gssp-redirect-base-path: PASS

Conversion is complete and faithful — all 22 test titles, coverage branches, and fixtures are preserved; browser/fetch APIs and dev/prod guards are correctly migrated.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                    |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 22 (21 in runTests + 1 prod-only), converted: 22                                              |
| 1b  | Assertions          | pass    | counts ~match (minor refactor of `check` into retry+expect)                                             |
| 1c  | Test titles         | pass    | All preserved verbatim                                                                                  |
| 1d  | Describe blocks     | pass    | Original dev/prod describes flattened via isNextStart guards                                            |
| 2a  | URL paths           | pass    | All URLs preserved                                                                                      |
| 2b  | Response checks     | pass    | status/headers/body assertions preserved                                                                |
| 2c  | FS checks           | pass    | patchFile/deleteFile replace fs.mkdirp/writeFile/remove                                                 |
| 2d  | Browser checks      | pass    | webdriver → next.browser with same selectors                                                            |
| 2e  | Build output        | pass    | next.build() stdout/stderr used for error test                                                          |
| 2f  | Dynamic logic       | pass    | `!isDev` branches converted to `isNextStart`                                                            |
| 3a  | nextTestSetup       | pass    | Uses nextTestSetup from 'e2e-utils'                                                                     |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                      |
| 3c  | skipStart           | na      | Full e2e runs server                                                                                    |
| 3d  | No manual lifecycle | pass    | No legacy helpers                                                                                       |
| 3e  | Cleanup             | pass    | deleteFile cleanup preserved                                                                            |
| 4a  | Directory placement | pass    | test/e2e/ runs dev+prod as original did                                                                 |
| 4b  | Mode guards         | pass    | isNextStart used for prod-only tests                                                                    |
| 4c  | Turbopack guards    | na      | Not skipped for Turbopack                                                                               |
| 4d  | Dedup guards        | warn    | Original had TURBOPACK_DEV/TURBOPACK_BUILD split per describe; converted lets harness mode handle it    |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD usage                                                                            |
| 5a  | render              | na      | No renderViaHTTP in original                                                                            |
| 5b  | fetch               | pass    | fetchViaHTTP → next.fetch                                                                               |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                |
| 5d  | check→retry         | pass    | All check() calls migrated                                                                              |
| 5e  | File class          | na      | N/A                                                                                                     |
| 5f  | waitFor             | na      | None used                                                                                               |
| 5g  | fs operations       | pass    | patchFile/deleteFile                                                                                    |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/index.js, 404.js, another.js, gsp-blog/[post].js, gssp-blog/[post].js all present |
| 6b  | next.config.js      | pass    | Present                                                                                                 |
| 6c  | Overrides           | na      |                                                                                                         |
| 7a  | No dead code        | pass    |                                                                                                         |
| 7b  | retry over timeout  | pass    |                                                                                                         |
| 7c  | async/await         | pass    |                                                                                                         |
| 7d  | eslint              | pass    |                                                                                                         |

## Issues

None

## Warnings

- 4d: Original used `TURBOPACK_BUILD`/`TURBOPACK_DEV` dedup guards to skip the dev or prod describe in specific CI matrix runs. The converted e2e test relies on `NEXT_TEST_MODE`/harness-level mode selection instead, which is the expected replacement — noting only that the mapping is implicit.
