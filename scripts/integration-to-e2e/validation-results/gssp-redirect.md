# gssp-redirect: WARN

Conversion is faithful in coverage and behavior, but retains a standalone `nextBuild()` call from `next-test-utils` for the prerendering-error test.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                  |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 26 unique `it` titles, converted: 26                                                                                                        |
| 1b  | Assertions          | pass    | expect counts match (spot-checked parity across tests)                                                                                                |
| 1c  | Test titles         | pass    | All preserved verbatim                                                                                                                                |
| 1d  | Describe blocks     | pass    | Dev/prod describes flattened into one with `isNextStart` guards                                                                                       |
| 2a  | URL paths           | pass    | All paths mapped to `next.fetch`/`next.browser`                                                                                                       |
| 2b  | Response checks     | pass    | Status/location/refresh header assertions preserved                                                                                                   |
| 2c  | FS checks           | na      | None                                                                                                                                                  |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`, selectors/evals equivalent                                                                                              |
| 2e  | Build output        | pass    | `output` captured via `next.cliOutput`; invalid-page build uses `nextBuild` + stdout/stderr capture                                                   |
| 2f  | Dynamic logic       | pass    | `if (!isDev)` → `if (isNextStart)`                                                                                                                    |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup({ files: __dirname })`                                                                                                            |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                    |
| 3c  | skipStart           | na      | Not build-only                                                                                                                                        |
| 3d  | No manual lifecycle | warn    | Imports `nextBuild` from `next-test-utils` for prerender-error test; acceptable as standalone build-failure check but outside the usual allowlist     |
| 3e  | Cleanup             | pass    | `next.deleteFile` used to remove patched invalid page                                                                                                 |
| 4a  | Directory placement | pass    | `test/e2e/` — original ran in both dev and prod                                                                                                       |
| 4b  | Mode guards         | pass    | `isNextStart` guards for prod-only tests                                                                                                              |
| 4c  | Turbopack guards    | na      | None needed                                                                                                                                           |
| 4d  | Dedup guards        | warn    | Original `TURBOPACK_BUILD`/`TURBOPACK_DEV` describe skips not preserved; framework mode selection now handles this, consistent with other conversions |
| 4e  | No incorrect env    | pass    | None                                                                                                                                                  |
| 5a  | render              | na      | Not used; fetch used instead                                                                                                                          |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch` with `redirect: 'manual'`                                                                                               |
| 5c  | browser             | pass    | `webdriver` → `next.browser` (retryWaitHydration option dropped — acceptable default)                                                                 |
| 5d  | check→retry         | pass    | Two `check(...)` calls migrated to `retry(... expect(...))`                                                                                           |
| 5e  | File class          | na      | Not used                                                                                                                                              |
| 5f  | waitFor             | na      | None                                                                                                                                                  |
| 5g  | fs operations       | pass    | `fs.mkdirp`/`fs.writeFile`/`fs.remove` replaced with `next.patchFile`/`next.deleteFile`                                                               |
| 6a  | Fixtures exist      | pass    | 404, another, index, gsp-blog/[post], gsp-blog-blocking/[post], gssp-blog/[post] all present                                                          |
| 6b  | next.config.js      | na      | Original had none                                                                                                                                     |
| 6c  | Overrides           | na      | None                                                                                                                                                  |
| 7a  | No dead code        | pass    |                                                                                                                                                       |
| 7b  | retry over timeout  | pass    |                                                                                                                                                       |
| 7c  | async/await         | pass    |                                                                                                                                                       |
| 7d  | eslint              | pass    |                                                                                                                                                       |

## Issues

None.

## Warnings

- 3d: `nextBuild` imported from `next-test-utils` for the standalone prerender-error build-output check. Pattern is reasonable (it's a throwaway build to capture stderr), but sits outside the typical lifecycle allowlist.
- 4d: The original's `TURBOPACK_BUILD`/`TURBOPACK_DEV` describe-level skip guards are not reproduced. In the e2e harness the framework handles mode selection, so this is consistent with other conversions, but worth noting if CI ends up running redundant combinations.
- `retryWaitHydration: true` option on `webdriver` calls wasn't carried over to `next.browser` (no direct equivalent); unlikely to matter in practice but a behavioral delta.
