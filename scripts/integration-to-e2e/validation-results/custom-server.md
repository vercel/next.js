# custom-server: PASS

The `test/integration/custom-server` suite was faithfully converted to `test/e2e/custom-server/custom-server.test.ts`, preserving all test titles, URL paths, assertions, and HTTP/HTTPS parameterization while migrating to `nextTestSetup` with a custom `startCommand`. The `test/production/custom-server` file is a pre-existing unrelated test and is not part of this conversion.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                                                      |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 21 `it(`, converted (e2e): 21 `it(`                                                                                                                                                                             |
| 1b  | Assertions          | pass    | All original expects preserved; HMR/unhandled-rejection paths kept equivalent assertions                                                                                                                                  |
| 1c  | Test titles         | pass    | All titles preserved verbatim                                                                                                                                                                                             |
| 1d  | Describe blocks     | pass    | `compression handling` and `with middleware` inlined into `with dynamic assetPrefix` (shares server); `legacy NextCustomServer methods - %s mode` flattened (mode coverage from nextTestSetup)                            |
| 2a  | URL paths           | pass    | All paths (`/static/hello.txt`, `/no-query`, `/asset*`, `/dashboard`, `/custom-url-with-request-handler`, `/test-index-hmr`, `/no-slash`, `/unhandled-rejection`, `/middleware-augmented`, `/legacy-methods/*`) preserved |
| 2b  | Response checks     | pass    | etag/gzip header, x-original-url, body text regex assertions preserved                                                                                                                                                    |
| 2c  | FS checks           | pass    | HMR uses `next.readFile` + `next.patchFile` instead of `File` class                                                                                                                                                       |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser` with equivalent `elementByCss`/`log` calls                                                                                                                                                   |
| 2e  | Build output        | na      | No direct `nextBuild` assertions; mode handled by nextTestSetup                                                                                                                                                           |
| 2f  | Dynamic logic       | pass    | `isNextDev`/`isNextStart` used in `renderError`, `renderErrorToHTML`, `should warn` tests                                                                                                                                 |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` with `startCommand: 'node server.js'`                                                                                                                                                                |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                                                                        |
| 3c  | skipStart           | na      | Not a build-only suite                                                                                                                                                                                                    |
| 3d  | No manual lifecycle | pass    | No `findPort`/`killApp`/`initNextServerScript`; uses `startCommand` which is allowlisted for custom-server tests                                                                                                          |
| 3e  | Cleanup             | pass    | HMR patch restored via try/finally with original content                                                                                                                                                                  |
| 4a  | Directory placement | pass    | Covers both dev and prod → `test/e2e/`                                                                                                                                                                                    |
| 4b  | Mode guards         | pass    | `isNextDev ? describe.skip` for generateEtags-production, `isNextDev ? it.skip` for prod-only warning                                                                                                                     |
| 4c  | Turbopack guards    | na      | No Turbopack-specific skips needed                                                                                                                                                                                        |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV`/`TURBOPACK_BUILD` gating replaced with `isNextDev`/`isNextStart` (same effect via test runner mode selection)                                                                                    |
| 4e  | No incorrect env    | pass    | No direct reads of `process.env.TURBOPACK_DEV`/`TURBOPACK_BUILD`                                                                                                                                                          |
| 5a  | render              | pass    | All `renderViaHTTP` → `next.render`                                                                                                                                                                                       |
| 5b  | fetch               | pass    | All `fetchViaHTTP` → `next.fetch`                                                                                                                                                                                         |
| 5c  | browser             | pass    | `webdriver` → `next.browser`                                                                                                                                                                                              |
| 5d  | check→retry         | pass    | Both `check()` callsites (HMR, unhandled rejection) migrated to `retry` + `expect`                                                                                                                                        |
| 5e  | File class          | pass    | `indexPg.replace/restore` → `next.patchFile` with original content saved/restored                                                                                                                                         |
| 5f  | waitFor             | na      | None used                                                                                                                                                                                                                 |
| 5g  | fs operations       | pass    | Uses `next.readFile`/`next.patchFile`                                                                                                                                                                                     |
| 6a  | Fixtures exist      | pass    | `server.js`, `next.config.js`, `middleware.js`, `pages/{index,asset,dashboard,dynamic-dashboard,no-query,middleware-augmented,404,500}.js`, `static/hello.txt`, `ssh/*.pem` all present                                   |
| 6b  | next.config.js      | pass    | Present                                                                                                                                                                                                                   |
| 6c  | Overrides           | na      | Config via `env` only (USE_HTTPS, GENERATE_ETAGS, POLYFILL_FETCH)                                                                                                                                                         |
| 7a  | No dead code        | pass    | No commented-out tests; `title` destructured but unused (minor)                                                                                                                                                           |
| 7b  | retry over timeout  | pass    | Uses `retry` for log/HMR polling                                                                                                                                                                                          |
| 7c  | async/await         | pass    | All async calls awaited                                                                                                                                                                                                   |
| 7d  | eslint              | pass    | `jest/no-standalone-expect` disabled at top; conditional describes inside describe.each                                                                                                                                   |

## Issues

None.

## Warnings

- `title` is destructured from `describe.each` on line 13 but never used in the body — minor; the title is already consumed by the `$title` template string.
- `test/production/custom-server/custom-server.test.ts` is a pre-existing, unrelated test (app dir / react canary / use-cache) and not part of this conversion; evaluation applies only to `test/e2e/custom-server/custom-server.test.ts`.
- Some original describes (`compression handling`, `with middleware`) were inlined into `with dynamic assetPrefix` to share one server instance. Behaviorally equivalent and faster, but worth flagging as a structural deviation.
- `legacy NextCustomServer methods` no longer runs as `describe.each(modes)`; mode coverage relies on the CI matrix running the e2e suite in both dev and prod.
