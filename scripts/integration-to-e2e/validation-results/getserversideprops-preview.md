# getserversideprops-preview: WARN

Conversion preserves all tests and assertions, but the "dev server reboot" test was reworked to simulate stale cookies rather than actually restarting the dev server.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                               |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 16, converted: 16                                                                                        |
| 1b  | Assertions          | pass    | original ~46, converted ~49                                                                                        |
| 1c  | Test titles         | pass    | All preserved (with minor rewording: "after reset", "via browser", "in dev")                                       |
| 1d  | Describe blocks     | pass    | Dev/prod describes flattened into isNextDev/isNextStart branches                                                   |
| 2a  | URL paths           | pass    | All paths (`/`, `/api/preview`, `/api/reset`, `/_next/data/.../index.json`, `/to-index`) covered                   |
| 2b  | Response checks     | pass    | Status, headers, cookies, HTML structure preserved                                                                 |
| 2c  | FS checks           | pass    | `getBuildId()` replaced with `next.buildId`                                                                        |
| 2d  | Browser checks      | pass    | Uses `next.browser()` with equivalent selectors                                                                    |
| 2e  | Build output        | pass    | Uses `next.cliOutput` matcher                                                                                      |
| 2f  | Dynamic logic       | pass    | `runTests()` inlined; dev-only block moved under `isNextDev`                                                       |
| 3a  | nextTestSetup       | pass    |                                                                                                                    |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                 |
| 3c  | skipStart           | na      | Test needs server running                                                                                          |
| 3d  | No manual lifecycle | pass    |                                                                                                                    |
| 3e  | Cleanup             | pass    | nextTestSetup handles                                                                                              |
| 4a  | Directory placement | pass    | `test/e2e/` for both dev+prod coverage                                                                             |
| 4b  | Mode guards         | pass    | `isNextDev` / `isNextStart` correctly applied                                                                      |
| 4c  | Turbopack guards    | na      | No Turbopack-specific skips                                                                                        |
| 4d  | Dedup guards        | warn    | Original had `TURBOPACK_DEV`/`TURBOPACK_BUILD` dedup describes; converted relies on `isNextDev`/`isNextStart` only |
| 4e  | No incorrect env    | pass    |                                                                                                                    |
| 5a  | render              | pass    |                                                                                                                    |
| 5b  | fetch               | pass    | Query params moved into URL via `qs.stringify`                                                                     |
| 5c  | browser             | pass    |                                                                                                                    |
| 5d  | check→retry         | na      |                                                                                                                    |
| 5e  | File class          | na      |                                                                                                                    |
| 5f  | waitFor             | na      |                                                                                                                    |
| 5g  | fs operations       | pass    | `fs.readFile(BUILD_ID)` → `next.buildId`                                                                           |
| 6a  | Fixtures exist      | pass    | pages/index.js, pages/to-index.js, pages/api/preview.js, pages/api/reset.js present                                |
| 6b  | next.config.js      | na      | Neither original nor converted has one                                                                             |
| 6c  | Overrides           | na      |                                                                                                                    |
| 7a  | No dead code        | pass    |                                                                                                                    |
| 7b  | retry over timeout  | pass    |                                                                                                                    |
| 7c  | async/await         | pass    |                                                                                                                    |
| 7d  | eslint              | pass    |                                                                                                                    |

## Issues

None.

## Warnings

- **Dev-reboot semantics changed**: The original "should return cookies to be expired after dev server reboot" killed and relaunched the app, which regenerates the preview-mode secret, then verified stale cookies are handled gracefully. The converted version sends arbitrary fake cookie values (`stale-value`/`stale-data`) to a running dev server — this does not actually reproduce a preview-secret rotation scenario and is a weaker assertion.
- **Dedup guards not preserved (4d)**: Original used `TURBOPACK_BUILD`/`TURBOPACK_DEV` describe.skip to dedup CI runs. Converted test will run both isNextDev and isNextStart branches without these guards; may cause redundant CI execution.
- **Browser tests now run in both modes**: Originally dev-only; now run in dev+prod. Extra coverage, not a regression, but worth noting.
