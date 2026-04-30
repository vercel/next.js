# export-dynamic-pages: PASS

Conversion preserves both tests, assertions, fixtures, and uses appropriate lifecycle for a static export test.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                                                                           |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                                                           |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                                                                                                      |
| 1d  | Describe blocks     | pass    | Outer describe preserved; inner "production mode" flattened (test is prod-only by placement)                                                        |
| 2a  | URL paths           | pass    | `/regression/jeff-is-cool` accessed in both                                                                                                         |
| 2b  | Response checks     | pass    | `$('#asPath').text()` and `window.__AS_PATHS` preserved                                                                                             |
| 2c  | FS checks           | pass    | Uses `next.readFile('out/...')` for static HTML                                                                                                     |
| 2d  | Browser checks      | pass    | Uses webdriver against custom static server (necessary for `output: 'export'`)                                                                      |
| 2e  | Build output        | pass    | `await next.build()` used                                                                                                                           |
| 2f  | Dynamic logic       | na      | No runTests helper                                                                                                                                  |
| 3a  | nextTestSetup       | pass    | Used with `files: __dirname`                                                                                                                        |
| 3b  | files param         | pass    | `__dirname`                                                                                                                                         |
| 3c  | skipStart           | pass    | `skipStart: true` (no Next.js server for `output: 'export'`)                                                                                        |
| 3d  | No manual lifecycle | pass    | Uses vanilla `http.createServer` for serving static export — acceptable since `output: 'export'` leaves no Next.js server to use                    |
| 3e  | Cleanup             | pass    | `afterAll` closes the static server                                                                                                                 |
| 4a  | Directory placement | pass    | `test/production/` matches original prod-only scope                                                                                                 |
| 4b  | Mode guards         | na      | Single-mode test                                                                                                                                    |
| 4c  | Turbopack guards    | na      | Original only had `TURBOPACK_DEV` dedup guard, not a Turbopack-feature skip                                                                         |
| 4d  | Dedup guards        | pass    | Original `TURBOPACK_DEV ? describe.skip` applied to integration's "production mode" block; moot in `test/production/` which runs in start mode only |
| 4e  | No incorrect env    | pass    | No `TURBOPACK_DEV`/`TURBOPACK_BUILD` skip logic                                                                                                     |
| 5a  | render              | na      | Not used; static file read instead                                                                                                                  |
| 5b  | fetch               | na      | Not used                                                                                                                                            |
| 5c  | browser             | warn    | Uses raw `webdriver(port, path)` against custom server rather than `next.browser()` — justified because no Next.js server exists for static exports |
| 5d  | check→retry         | na      |                                                                                                                                                     |
| 5e  | File class          | na      |                                                                                                                                                     |
| 5f  | waitFor             | na      |                                                                                                                                                     |
| 5g  | fs operations       | pass    | Uses `next.readFile` for HTML assertion; raw `fs.readFile` only inside the static server for serving files                                          |
| 6a  | Fixtures exist      | pass    | `pages/regression/[slug].js` and `next.config.js` present                                                                                           |
| 6b  | next.config.js      | pass    | Identical content                                                                                                                                   |
| 6c  | Overrides           | na      |                                                                                                                                                     |
| 7a  | No dead code        | pass    |                                                                                                                                                     |
| 7b  | retry over timeout  | pass    |                                                                                                                                                     |
| 7c  | async/await         | pass    |                                                                                                                                                     |
| 7d  | eslint              | pass    |                                                                                                                                                     |

## Issues

None

## Warnings

- 5c: Converted test uses `webdriver(port, …)` pointing at a hand-rolled static http server rather than `next.browser()`. This is necessary because `output: 'export'` produces no running Next.js server; acceptable.
