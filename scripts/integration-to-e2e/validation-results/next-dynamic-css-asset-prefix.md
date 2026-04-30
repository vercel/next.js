# next-dynamic-css-asset-prefix: PASS

Clean conversion that collapses two mode-specific describe blocks into a single `test/e2e/` suite using `skipStart` + manual `next.start()`, preserving the CDN proxy behavior.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                             |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | pass    | original: 2 `it()` (run in 2 describes), converted: 2 `it()` — e2e harness runs across dev+start |
| 1b  | Assertions          | pass    | original: 4, converted: 4                                                                        |
| 1c  | Test titles         | pass    | Both preserved verbatim                                                                          |
| 1d  | Describe blocks     | pass    | Mode-specific describes appropriately collapsed; e2e harness handles dev/prod                    |
| 2a  | URL paths           | pass    | `/` and `/test-app` preserved                                                                    |
| 2b  | Response checks     | pass    | Same getComputedCss + innerHTML assertions                                                       |
| 2c  | FS checks           | na      |                                                                                                  |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`                                                                     |
| 2e  | Build output        | na      |                                                                                                  |
| 2f  | Dynamic logic       | pass    | `isNextDev` guards `next.build()` call                                                           |
| 3a  | nextTestSetup       | pass    |                                                                                                  |
| 3b  | files param         | pass    | `files: __dirname`                                                                               |
| 3c  | skipStart           | pass    | Needed because CDN proxy must start before app consumes CDN_PORT                                 |
| 3d  | No manual lifecycle | pass    | Only `findPort` used (needed for side-CDN server, allowed)                                       |
| 3e  | Cleanup             | pass    | `afterAll` closes CDN; nextTestSetup handles app                                                 |
| 4a  | Directory placement | pass    | `test/e2e/` correct (original ran both dev+prod)                                                 |
| 4b  | Mode guards         | pass    | `isNextDev` used to skip build                                                                   |
| 4c  | Turbopack guards    | na      | No hard skip needed; both modes supported                                                        |
| 4d  | Dedup guards        | na      | e2e harness naturally runs per-mode per CI job                                                   |
| 4e  | No incorrect env    | pass    |                                                                                                  |
| 5a  | render              | na      |                                                                                                  |
| 5b  | fetch               | na      |                                                                                                  |
| 5c  | browser             | pass    |                                                                                                  |
| 5d  | check→retry         | na      |                                                                                                  |
| 5e  | File class          | pass    | `new File().replace()` → `next.patchFile()` with transform                                       |
| 5f  | waitFor             | na      |                                                                                                  |
| 5g  | fs operations       | pass    | Uses `next.patchFile` instead of direct fs                                                       |
| 6a  | Fixtures exist      | pass    | next.config.js, src/pages, src/app, scss/css present                                             |
| 6b  | next.config.js      | pass    | Matches original byte-for-byte                                                                   |
| 6c  | Overrides           | pass    | `dependencies.sass` added (scss fixture needs it)                                                |
| 7a  | No dead code        | pass    |                                                                                                  |
| 7b  | retry over timeout  | na      | No polling needed                                                                                |
| 7c  | async/await         | pass    |                                                                                                  |
| 7d  | eslint              | pass    |                                                                                                  |

## Issues

None

## Warnings

None
