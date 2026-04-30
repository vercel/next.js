All three pages and next.config.js are preserved.

# config: PASS

Clean 1:1 conversion with equivalent assertions and fixtures fully preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                    |
| --- | ------------------- | ------- | --------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 3, converted: 3                                                               |
| 1b  | Assertions          | pass    | original: 3, converted: 3                                                               |
| 1c  | Test titles         | pass    | All preserved verbatim                                                                  |
| 1d  | Describe blocks     | pass    | Single `Configuration` describe preserved                                               |
| 2a  | URL paths           | pass    | `/`, `/module-only-content`, `/next-config` all covered                                 |
| 2b  | Response checks     | pass    | Header/body assertions preserved                                                        |
| 2c  | FS checks           | na      |                                                                                         |
| 2d  | Browser checks      | pass    | `next.browser('/next-config')` + `#env` text                                            |
| 2e  | Build output        | na      |                                                                                         |
| 2f  | Dynamic logic       | na      |                                                                                         |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup({ files: __dirname })`                                              |
| 3b  | files param         | pass    | `files: __dirname`                                                                      |
| 3c  | skipStart           | na      | Dev-mode test                                                                           |
| 3d  | No manual lifecycle | pass    | No `launchApp`/`findPort`/`killApp`                                                     |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup; only `browser.close()` kept                                   |
| 4a  | Directory placement | pass    | `test/development/` appropriate (dev-only integration)                                  |
| 4b  | Mode guards         | na      |                                                                                         |
| 4c  | Turbopack guards    | na      |                                                                                         |
| 4d  | Dedup guards        | na      |                                                                                         |
| 4e  | No incorrect env    | pass    |                                                                                         |
| 5a  | render              | pass    | `renderViaHTTP` → `next.render`                                                         |
| 5b  | fetch               | pass    | `fetch(url)` → `next.fetch('/')`                                                        |
| 5c  | browser             | pass    | `webdriver` → `next.browser`                                                            |
| 5d  | check→retry         | na      |                                                                                         |
| 5e  | File class          | na      |                                                                                         |
| 5f  | waitFor             | na      |                                                                                         |
| 5g  | fs operations       | na      |                                                                                         |
| 6a  | Fixtures exist      | pass    | pages/{build-id,module-only-content,next-config}.js, components/, node_modules/ present |
| 6b  | next.config.js      | pass    | Identical to original                                                                   |
| 6c  | Overrides           | na      |                                                                                         |
| 7a  | No dead code        | pass    | Removed unused pre-build warmup (only needed for launchApp flow)                        |
| 7b  | retry over timeout  | pass    |                                                                                         |
| 7c  | async/await         | pass    |                                                                                         |
| 7d  | eslint              | pass    |                                                                                         |

## Issues

None

## Warnings

None
