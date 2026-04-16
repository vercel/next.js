Now I have enough context to evaluate.

# prerender-preview: WARN

Conversion preserves all test titles, URL paths, and assertions, but the "dev server reboot" test no longer restarts the server so its underlying behavior differs from the original.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                                    |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 22, converted: 22                                                                                                                                                                             |
| 1b  | Assertions          | pass    | Counts roughly equivalent (~58 vs ~60)                                                                                                                                                                  |
| 1c  | Test titles         | pass    | All preserved; "should fetch preview data on SSR" → "...via browser" (minor wording)                                                                                                                    |
| 1d  | Describe blocks     | pass    | Flattened appropriately with `isNextDev`/`isNextStart`                                                                                                                                                  |
| 2a  | URL paths           | pass    | All paths preserved, query converted to URL strings                                                                                                                                                     |
| 2b  | Response checks     | pass    | Status, headers, body assertions preserved                                                                                                                                                              |
| 2c  | FS checks           | pass    | Original `getBuildId` via fs → `next.buildId`                                                                                                                                                           |
| 2d  | Browser checks      | pass    | webdriver → next.browser; uses loadPage instead of browser.get                                                                                                                                          |
| 2e  | Build output        | pass    | `next.cliOutput` checked for "Compiled successfully"                                                                                                                                                    |
| 2f  | Dynamic logic       | pass    | runTests(nextStart) inlined with isNextStart guards                                                                                                                                                     |
| 3a  | nextTestSetup       | pass    |                                                                                                                                                                                                         |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                                                                                                                      |
| 3c  | skipStart           | na      | Runs in both modes                                                                                                                                                                                      |
| 3d  | No manual lifecycle | pass    |                                                                                                                                                                                                         |
| 3e  | Cleanup             | pass    | No manual cleanup needed                                                                                                                                                                                |
| 4a  | Directory placement | pass    | test/e2e/ correct — runs both modes                                                                                                                                                                     |
| 4b  | Mode guards         | pass    | isNextDev / isNextStart used correctly                                                                                                                                                                  |
| 4c  | Turbopack guards    | na      | Original uses `TURBOPACK_BUILD`/`TURBOPACK_DEV` as dedup, not skip                                                                                                                                      |
| 4d  | Dedup guards        | warn    | Original had `TURBOPACK_BUILD ? describe.skip` for dev and `TURBOPACK_DEV ? describe.skip` for prod (dedup). Converted drops these; instead relies on isNextDev/isNextStart which always run both modes |
| 4e  | No incorrect env    | pass    | No direct TURBOPACK_DEV/BUILD usage                                                                                                                                                                     |
| 5a  | render              | pass    |                                                                                                                                                                                                         |
| 5b  | fetch               | pass    | Query params inlined into URL strings                                                                                                                                                                   |
| 5c  | browser             | pass    | next.browser() used                                                                                                                                                                                     |
| 5d  | check→retry         | na      | Original didn't use check()                                                                                                                                                                             |
| 5e  | File class          | na      |                                                                                                                                                                                                         |
| 5f  | waitFor             | na      |                                                                                                                                                                                                         |
| 5g  | fs operations       | pass    | getBuildId via fs → next.buildId                                                                                                                                                                        |
| 6a  | Fixtures exist      | pass    | pages/index.js, to-index.js, api/{preview,read,reset}.js present — identical to original                                                                                                                |
| 6b  | next.config.js      | na      | Original had no next.config.js                                                                                                                                                                          |
| 6c  | Overrides           | na      |                                                                                                                                                                                                         |
| 7a  | No dead code        | pass    |                                                                                                                                                                                                         |
| 7b  | retry over timeout  | pass    |                                                                                                                                                                                                         |
| 7c  | async/await         | pass    |                                                                                                                                                                                                         |
| 7d  | eslint              | pass    |                                                                                                                                                                                                         |

## Issues

None (no fail-level problems).

## Warnings

- **Dev server reboot test semantics changed**: The original `should return cookies to be expired after dev server reboot` test called `killApp(app)` and `launchApp(...)` to actually restart the dev server, then sent the real preview cookies from the prior instance to verify they'd be treated as expired (tests `previewModeId` invalidation across reboots). The converted version skips the reboot entirely and instead sends fabricated stale cookie strings (`__prerender_bypass=stale-value; __next_preview_data=stale-data`). The assertion that the body doesn't contain `TypeError`/`previewModeId` still runs, but the specific regression being guarded (stale real preview tokens from a previous server's session) is no longer covered.
- **Dedup guards dropped**: Original used `TURBOPACK_BUILD`/`TURBOPACK_DEV` describe.skip wrappers to avoid redundant CI runs (dev-only suite skipped in TURBOPACK_BUILD, prod-only suite skipped in TURBOPACK_DEV). The converted file has no equivalent, so both mode blocks run in every mode variant — minor CI waste but not a correctness issue.
- **Browser lifecycle**: Original reused a single `browser` across dev tests (with preview cookies already set after the initial `/api/preview` visit). Converted opens a new browser per test and re-visits `/api/preview` each time. Functionally equivalent but slightly less efficient.
