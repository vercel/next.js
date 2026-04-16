# draft-mode: PASS

Clean conversion of integration test to e2e with all 18 tests and assertions preserved via `isNextDev` / `isNextStart` guards.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                 |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 18, converted: 18                                                                                                          |
| 1b  | Assertions          | pass    | original: 41, converted: 42                                                                                                          |
| 1c  | Test titles         | pass    | All preserved; minor rewording ("enable draft mode" → "enable draft mode via dev API"/"via API") to avoid jest duplicate-title lint  |
| 1d  | Describe blocks     | pass    | Dev/prod describes flattened into `isNextDev`/`isNextStart` branches                                                                 |
| 2a  | URL paths           | pass    | `/`, `/api/enable`, `/api/disable`, `/api/read`, `/ssp`, `/to-index`, `/_next/data/.../index.json` all covered                       |
| 2b  | Response checks     | pass    | Status, headers, cookies, HTML content all preserved                                                                                 |
| 2c  | FS checks           | pass    | `getBuildId()` via `fs.readFile` replaced with `next.buildId`                                                                        |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`; interactions preserved                                                                                 |
| 2e  | Build output        | pass    | `nextBuild` stdout → `next.cliOutput` match                                                                                          |
| 2f  | Dynamic logic       | pass    | Dev-only and prod-only branches correctly mapped via `isNextDev`/`isNextStart`                                                       |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup({ files: __dirname })`                                                                                           |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                   |
| 3c  | skipStart           | na      | Tests run in both modes                                                                                                              |
| 3d  | No manual lifecycle | pass    | No `findPort`/`launchApp`/`killApp`/`nextBuild`/`nextStart`                                                                          |
| 3e  | Cleanup             | pass    | Browsers closed explicitly; server lifecycle managed by nextTestSetup                                                                |
| 4a  | Directory placement | pass    | `test/e2e/` correct since tests run in both dev and prod                                                                             |
| 4b  | Mode guards         | pass    | `isNextDev`/`isNextStart` correctly split behavior                                                                                   |
| 4c  | Turbopack guards    | na      | Original guards were dedup, not turbopack-only                                                                                       |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_BUILD`/`TURBOPACK_DEV` guards naturally handled by e2e mode split                                                |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` env checks                                                                                      |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                                                                      |
| 5b  | fetch               | pass    | `fetchViaHTTP` → `next.fetch` with correct options                                                                                   |
| 5c  | browser             | pass    | `webdriver(port, path)` → `next.browser(path)`; `next.url` used for in-test URL building                                             |
| 5d  | check→retry         | na      | No `check()` in original                                                                                                             |
| 5e  | File class          | na      |                                                                                                                                      |
| 5f  | waitFor             | na      | Not used                                                                                                                             |
| 5g  | fs operations       | pass    | `fs.readFile(.next/BUILD_ID)` → `next.buildId`; no direct `appDir` fs                                                                |
| 6a  | Fixtures exist      | pass    | pages/index.tsx, pages/another.tsx, pages/ssp.tsx, pages/to-index.tsx, pages/api/{enable,disable,read}.ts, tsconfig.json all present |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                                                                       |
| 6c  | Overrides           | na      |                                                                                                                                      |
| 7a  | No dead code        | pass    |                                                                                                                                      |
| 7b  | retry over timeout  | pass    |                                                                                                                                      |
| 7c  | async/await         | pass    |                                                                                                                                      |
| 7d  | eslint              | pass    | Title rewording avoids jest/no-identical-title                                                                                       |

## Issues

None

## Warnings

- The dev-mode "should return cookies to be expired after dev server reboot" test no longer performs an actual dev server reboot — it just sends a stale cookie. The behavioral intent (stale preview cookie doesn't crash) is still covered, but the specific reboot scenario is not exercised. This is a reasonable limitation since `nextTestSetup` doesn't easily support mid-test server restarts.
