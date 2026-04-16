# script-loader: PASS

Conversion preserves all 12 test titles and behaviors, migrates correctly to `nextTestSetup` with inline `createNext` for the Partytown build test, and all fixture files are present.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                             |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 12 unique `it`, converted: 12                                                                                                                                          |
| 1b  | Assertions          | pass    | ~22 expects preserved; retry wrappers added                                                                                                                                      |
| 1c  | Test titles         | pass    | All 12 titles preserved verbatim                                                                                                                                                 |
| 1d  | Describe blocks     | pass    | Two mode-describes flattened into single describe (nextTestSetup covers both modes)                                                                                              |
| 2a  | URL paths           | pass    | /, /page1, /page3-10 all covered via next.browser/next.render$                                                                                                                   |
| 2b  | Response checks     | pass    | cheerio/browser selectors match                                                                                                                                                  |
| 2c  | FS checks           | na      |                                                                                                                                                                                  |
| 2d  | Browser checks      | pass    | webdriver → next.browser; same selectors                                                                                                                                         |
| 2e  | Build output        | pass    | Partytown test uses createNext + cliOutput                                                                                                                                       |
| 2f  | Dynamic logic       | pass    | isNextDev guards preserved (strict-mode/partytown)                                                                                                                               |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup({ files: __dirname })`                                                                                                                                       |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                               |
| 3c  | skipStart           | pass    | Partytown createNext uses `skipStart: true`                                                                                                                                      |
| 3d  | No manual lifecycle | pass    | No launchApp/killApp/nextBuild                                                                                                                                                   |
| 3e  | Cleanup             | pass    | createNext destroyed in finally                                                                                                                                                  |
| 4a  | Directory placement | pass    | test/e2e/ (runs both dev and prod)                                                                                                                                               |
| 4b  | Mode guards         | pass    | `isNextDev` gates Partytown + CSS-position check                                                                                                                                 |
| 4c  | Turbopack guards    | pass    | Uses `isTurbopack` from nextTestSetup, not env check                                                                                                                             |
| 4d  | Dedup guards        | warn    | Original had `process.env.TURBOPACK_DEV ? describe.skip` on prod block; not preserved in converted (but that was an old-style single-side guard, not the standard dedup pattern) |
| 4e  | No incorrect env    | pass    | No TURBOPACK_DEV/BUILD checks                                                                                                                                                    |
| 5a  | render              | pass    | renderViaHTTP → next.render$                                                                                                                                                     |
| 5b  | fetch               | na      |                                                                                                                                                                                  |
| 5c  | browser             | pass    | webdriver → next.browser                                                                                                                                                         |
| 5d  | check→retry         | na      | Original didn't use check(); waitFor replaced with retry                                                                                                                         |
| 5e  | File class          | na      |                                                                                                                                                                                  |
| 5f  | waitFor             | pass    | All waitFor(ms) replaced with retry() polling                                                                                                                                    |
| 5g  | fs operations       | na      |                                                                                                                                                                                  |
| 6a  | Fixtures exist      | pass    | All 10 pages + \_app + \_document + styles + next.config.js + partytown-missing present                                                                                          |
| 6b  | next.config.js      | pass    | Matches original (reactStrictMode: true)                                                                                                                                         |
| 6c  | Overrides           | na      |                                                                                                                                                                                  |
| 7a  | No dead code        | pass    |                                                                                                                                                                                  |
| 7b  | retry over timeout  | pass    | waitFor eliminated, retry used                                                                                                                                                   |
| 7c  | async/await         | pass    |                                                                                                                                                                                  |
| 7d  | eslint              | pass    |                                                                                                                                                                                  |

## Issues

None

## Warnings

- 4d: The original production-mode describe had `(process.env.TURBOPACK_DEV ? describe.skip : describe)`. The converted file doesn't carry this. Given nextTestSetup runs the full suite under both dev and prod modes as scheduled by CI, this is likely intentional, but worth noting as a minor deviation.
