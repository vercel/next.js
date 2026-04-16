# dynamic-routing: PASS

High-quality conversion: all 78 tests preserved across the split e2e/middleware files, proper mode guards, and a clean middleware setup via `skipStart` + `patchFile`.

## Criteria

| #   | Criterion             | Verdict | Note                                                                                                                                                |
| --- | --------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count            | pass    | original runTests: 78 `it(`; converted shared.ts: 78 `it(`                                                                                          |
| 1b  | Assertions            | pass    | Assertion count preserved (minor equivalent refactors, e.g. `check` → `retry`+`expect`)                                                             |
| 1c  | Test titles           | pass    | All titles preserved verbatim                                                                                                                       |
| 1d  | Describe blocks       | pass    | dev/prod describe branches flattened into `isNextDev`/`isNextStart` guards; middleware case moved into its own top-level describe (runTests shared) |
| 2a  | URL paths             | pass    | Every path (`/`, `/post-1`, `/blog/...`, `/_next/data/...`, `/hello copy.txt`, `/%`, etc.) preserved                                                |
| 2b  | Response checks       | pass    | Status, text, selector assertions preserved                                                                                                         |
| 2c  | FS checks             | pass    | `fs.readJson('.next/routes-manifest.json')` → `next.readFile(...)`+JSON.parse; BUILD_ID read via `next.readFile('.next/BUILD_ID')`                  |
| 2d  | Browser checks        | pass    | `webdriver` → `next.browser()` throughout                                                                                                           |
| 2e  | Build output          | na      | No build-return-value checks                                                                                                                        |
| 2f  | Dynamic logic         | pass    | `runTests({dev})` preserved via `isNextDev`/`isNextStart` guards; middleware branching preserved via `middlewareEnabled` arg                        |
| 3a  | nextTestSetup         | pass    | Both files use `nextTestSetup` from `'e2e-utils'`                                                                                                   |
| 3b  | files param           | pass    | Main: `files: __dirname`; middleware: `files: join(__dirname, '../dynamic-routing')` (shared fixtures)                                              |
| 3c  | skipStart             | pass    | Middleware variant uses `skipStart: true` to allow `patchFile('middleware.js')` before `next.start()`                                               |
| 3d  | No manual lifecycle   | pass    | No `findPort`/`launchApp`/`killApp`/`nextBuild`/`nextStart`                                                                                         |
| 3e  | Cleanup               | pass    | `afterAll(fs.remove(middlewarePath))` replaced by isolated next.js dir (no cleanup needed)                                                          |
| 4a  | Directory placement   | pass    | Suite runs in both dev & prod → `test/e2e/` correct                                                                                                 |
| 4b  | Mode guards           | pass    | `isNextDev`/`isNextStart` used correctly for dev-only, prod-only, and HMR tests                                                                     |
| 4c  | Turbopack skip guards | na      | No turbopack-specific skip; `isTurbopack` used only to branch inline-snapshot                                                                       |
| 4d  | Dedup guards          | na      | Original TURBOPACK_DEV/TURBOPACK_BUILD guards just separated dev/prod modes — now handled natively by nextTestSetup mode selection                  |
| 4e  | No incorrect env      | pass    | No raw `TURBOPACK_DEV`/`TURBOPACK_BUILD` usage                                                                                                      |
| 5a  | render                | pass    | `renderViaHTTP` → `next.render()` / `next.render$()`                                                                                                |
| 5b  | fetch                 | pass    | `fetchViaHTTP` → `next.fetch()`                                                                                                                     |
| 5c  | browser               | pass    | `webdriver(appPort, path)` → `next.browser(path)`                                                                                                   |
| 5d  | check→retry           | pass    | All `check()` calls refactored to `retry()` + `expect()`                                                                                            |
| 5e  | File class            | na      | Original used `fs.writeFile`/`fs.remove`; converted uses `next.patchFile`/`next.deleteFile`                                                         |
| 5f  | waitFor               | pass    | `waitFor(1000)` and `waitFor(3000)` replaced with `retry()`                                                                                         |
| 5g  | fs operations         | pass    | `fs.readJson(join(appDir, …))` → `next.readFile(...)`; added-later/HMR tests use `next.patchFile`/`next.deleteFile`                                 |
| 6a  | Fixtures exist        | pass    | pages/, public/, static/ all present; \_app.js and all dynamic route pages verified via Glob                                                        |
| 6b  | next.config.js        | na      | Original had no next.config.js; converted also has none                                                                                             |
| 6c  | Overrides             | pass    | Middleware provided via `patchFile` in middleware variant                                                                                           |
| 7a  | No dead code          | pass    | `it.skip` for WebSocket pong kept (with same comment intent); no orphan imports                                                                     |
| 7b  | retry over timeout    | pass    | All polling uses `retry()`                                                                                                                          |
| 7c  | async/await           | pass    | All awaited                                                                                                                                         |
| 7d  | eslint                | pass    | No duplicate titles within a single describe; `(el as any).attribs` cast acceptable                                                                 |

## Issues

None.

## Warnings

None.
