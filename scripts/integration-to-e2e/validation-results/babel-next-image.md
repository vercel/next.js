# babel-next-image: PASS

Clean 1:1 conversion with all tests, assertions, fixtures, and Turbopack skip guard preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                            |
| --- | ------------------- | ------- | --------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                       |
| 1b  | Assertions          | pass    | original: 1, converted: 1                                       |
| 1c  | Test titles         | pass    | "should work with babel and next/image" preserved               |
| 1d  | Describe blocks     | pass    | Single describe preserved                                       |
| 2a  | URL paths           | pass    | `/` preserved                                                   |
| 2b  | Response checks     | pass    | `res.status === 200` preserved                                  |
| 2c  | FS checks           | na      |                                                                 |
| 2d  | Browser checks      | na      |                                                                 |
| 2e  | Build output        | na      |                                                                 |
| 2f  | Dynamic logic       | na      |                                                                 |
| 3a  | nextTestSetup       | pass    | Used with `files: __dirname`                                    |
| 3b  | files param         | pass    | `__dirname`                                                     |
| 3c  | skipStart           | na      | Not build-only                                                  |
| 3d  | No manual lifecycle | pass    | findPort/launchApp/killApp removed                              |
| 3e  | Cleanup             | pass    | Handled by nextTestSetup                                        |
| 4a  | Directory placement | pass    | test/development/ (original used launchApp = dev mode)          |
| 4b  | Mode guards         | na      |                                                                 |
| 4c  | Turbopack guards    | pass    | `IS_TURBOPACK_TEST ? describe.skip` wraps outside nextTestSetup |
| 4d  | Dedup guards        | na      |                                                                 |
| 4e  | No incorrect env    | pass    |                                                                 |
| 5a  | render              | na      |                                                                 |
| 5b  | fetch               | pass    | `fetchViaHTTP(port, '/')` → `next.fetch('/')`                   |
| 5c  | browser             | na      |                                                                 |
| 5d  | check→retry         | na      |                                                                 |
| 5e  | File class          | na      |                                                                 |
| 5f  | waitFor             | na      |                                                                 |
| 5g  | fs operations       | na      |                                                                 |
| 6a  | Fixtures exist      | pass    | `.babelrc`, `app/layout.js`, `app/page.js` present              |
| 6b  | next.config.js      | na      | Original had none                                               |
| 6c  | Overrides           | na      |                                                                 |
| 7a  | No dead code        | pass    |                                                                 |
| 7b  | retry over timeout  | pass    |                                                                 |
| 7c  | async/await         | pass    |                                                                 |
| 7d  | eslint              | pass    |                                                                 |

## Issues

None

## Warnings

None
