# app-document-add-hmr: PASS

Clean conversion: both tests preserved (still `.skip`), fs/webdriver/check APIs properly migrated to `next.patchFile`/`next.deleteFile`/`next.browser`/`retry`, and the `pages/index.js` fixture is present.

## Criteria

| #   | Criterion           | Verdict | Note                                                            |
| --- | ------------------- | ------- | --------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2 (both skipped), converted: 2 (both skipped)         |
| 1b  | Assertions          | pass    | original: 4 expect + 4 check, converted: 12 expect              |
| 1c  | Test titles         | pass    | Both titles preserved verbatim                                  |
| 1d  | Describe blocks     | pass    | Single describe preserved                                       |
| 2a  | URL paths           | pass    | `/` via `next.browser('/')`                                     |
| 2b  | Response checks     | pass    | HTML content assertions preserved                               |
| 2c  | FS checks           | pass    | `fs.writeFile`/`fs.remove` → `next.patchFile`/`next.deleteFile` |
| 2d  | Browser checks      | pass    | `webdriver` → `next.browser`, eval preserved                    |
| 2e  | Build output        | na      | Dev-only                                                        |
| 2f  | Dynamic logic       | na      |                                                                 |
| 3a  | nextTestSetup       | pass    | Used correctly                                                  |
| 3b  | files param         | pass    | `files: __dirname`                                              |
| 3c  | skipStart           | na      | Dev server needed                                               |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                                   |
| 3e  | Cleanup             | pass    | `finally` block restores state via `deleteFile`                 |
| 4a  | Directory placement | pass    | `test/development/` correct (dev HMR)                           |
| 4b  | Mode guards         | na      |                                                                 |
| 4c  | Turbopack guards    | na      |                                                                 |
| 4d  | Dedup guards        | na      |                                                                 |
| 4e  | No incorrect env    | pass    |                                                                 |
| 5a  | render              | na      |                                                                 |
| 5b  | fetch               | na      |                                                                 |
| 5c  | browser             | pass    | `webdriver` → `next.browser`                                    |
| 5d  | check→retry         | pass    | All 4 `check` → `retry` + `expect`                              |
| 5e  | File class          | na      | Uses fs directly, migrated to `next.patchFile`                  |
| 5f  | waitFor             | na      |                                                                 |
| 5g  | fs operations       | pass    | Migrated to `next.patchFile`/`deleteFile`                       |
| 6a  | Fixtures exist      | pass    | `pages/index.js` present                                        |
| 6b  | next.config.js      | na      | Original has none                                               |
| 6c  | Overrides           | na      |                                                                 |
| 7a  | No dead code        | pass    |                                                                 |
| 7b  | retry over timeout  | pass    |                                                                 |
| 7c  | async/await         | pass    |                                                                 |
| 7d  | eslint              | pass    |                                                                 |

## Issues

None

## Warnings

None
