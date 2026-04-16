# server-side-dev-errors: WARN

The 9 tests convert cleanly to `nextTestSetup` with appropriate `next.patchFile`/`next.cliOutput`/`next.browser` API migration, but rich `toMatchInlineSnapshot` blocks were replaced with looser `toContain` assertions and some have potentially wrong indentation.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                       |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 9, converted: 9                                                                                                                  |
| 1b  | Assertions          | warn    | original: ~27 (incl. 6 inline snapshots); converted: ~52 smaller `toContain`s — broader coverage per call but lost exact snapshot matching |
| 1c  | Test titles         | pass    | All 9 preserved verbatim                                                                                                                   |
| 1d  | Describe blocks     | pass    | Single top-level describe preserved                                                                                                        |
| 2a  | URL paths           | pass    | `/gsp`, `/gssp`, `/blog/first`, `/api/hello`, `/api/blog/first`, `/uncaught-*` all preserved                                               |
| 2b  | Response checks     | warn    | Exact snapshot text (including "error repeated 3x" structure) replaced with looser contains; the 3-way repeat is no longer verified        |
| 2c  | FS checks           | pass    | `fs.readFile`/`fs.writeFile` → `next.readFile`/`next.patchFile`                                                                            |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`, redbox matchers preserved                                                                                    |
| 2e  | Build output        | na      | Dev-only test                                                                                                                              |
| 2f  | Dynamic logic       | pass    | `isTurbopack` branches preserved                                                                                                           |
| 3a  | nextTestSetup       | pass    |                                                                                                                                            |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                         |
| 3c  | skipStart           | na      | Dev server test, start required                                                                                                            |
| 3d  | No manual lifecycle | pass    | `findPort`/`launchApp`/`killApp` removed                                                                                                   |
| 3e  | Cleanup             | pass    | File restore in `finally` preserved                                                                                                        |
| 4a  | Directory placement | pass    | `test/development/` matches dev-only original                                                                                              |
| 4b  | Mode guards         | pass    | `isTurbopack` destructured from setup                                                                                                      |
| 4c  | Turbopack guards    | na      | Runs in both turbopack and webpack                                                                                                         |
| 4d  | Dedup guards        | na      |                                                                                                                                            |
| 4e  | No incorrect env    | pass    | Uses `isTurbopack` from setup                                                                                                              |
| 5a  | render              | na      |                                                                                                                                            |
| 5b  | fetch               | na      |                                                                                                                                            |
| 5c  | browser             | pass    | `webdriver(port, path)` → `next.browser(path)`                                                                                             |
| 5d  | check→retry         | na      | Original already used `retry`                                                                                                              |
| 5e  | File class          | pass    | Uses `next.patchFile`                                                                                                                      |
| 5f  | waitFor             | na      |                                                                                                                                            |
| 5g  | fs operations       | pass    | All appDir `fs` replaced with `next.*` helpers                                                                                             |
| 6a  | Fixtures exist      | pass    | All 9 pages (gsp, gssp, blog/[slug], api/hello, api/blog/[slug], 4 uncaught-\*) present                                                    |
| 6b  | next.config.js      | na      | Original had none                                                                                                                          |
| 6c  | Overrides           | na      |                                                                                                                                            |
| 7a  | No dead code        | pass    |                                                                                                                                            |
| 7b  | retry over timeout  | pass    |                                                                                                                                            |
| 7c  | async/await         | pass    |                                                                                                                                            |
| 7d  | eslint              | pass    |                                                                                                                                            |

## Issues

None blocking.

## Warnings

- The 4 "uncaught-\*" tests lost their `toMatchInlineSnapshot` blocks (including the "error repeated 3x" pattern) in favor of a few `toContain` calls. The 3-fold duplication behavior noted as `FIXME(veil): error repeated` is no longer asserted.
- Potential indentation bug: converted `uncaught-rejection` test expects `> 7 |` (1 space), but the original snapshot shows `>  7 |` (2 spaces, because line 10 widens the gutter). Same issue in `uncaught-exception`. The sibling "empty" variants correctly use `>  7 |`. These two may fail at runtime unless the format has changed.
- Assertions dropped the exact stderr path comparison (`../../test/integration/.../pages/...`) which is unavoidable in the isolated fixture, but no equivalent path-substring check was added beyond the filename (e.g., `gsp.js:6:3`).
