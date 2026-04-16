# broken-webpack-plugin: PASS

Clean conversion; single test preserved with correct Turbopack skip guard wrapped outside `nextTestSetup`.

## Criteria

| #   | Criterion           | Verdict | Note                                                           |
| --- | ------------------- | ------- | -------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 1, converted: 1                                      |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                      |
| 1c  | Test titles         | pass    | 'should render error correctly' preserved                      |
| 1d  | Describe blocks     | pass    | Same describe preserved                                        |
| 2a  | URL paths           | pass    | '/' via next.render                                            |
| 2b  | Response checks     | pass    | toContain('Internal Server Error') preserved                   |
| 2c  | FS checks           | na      |                                                                |
| 2d  | Browser checks      | na      |                                                                |
| 2e  | Build output        | pass    | stderr → next.cliOutput                                        |
| 2f  | Dynamic logic       | na      |                                                                |
| 3a  | nextTestSetup       | pass    |                                                                |
| 3b  | files param         | pass    | files: \_\_dirname                                             |
| 3c  | skipStart           | na      | Needs server running (renders a page)                          |
| 3d  | No manual lifecycle | pass    | findPort/killApp/launchApp removed                             |
| 3e  | Cleanup             | pass    | handled by nextTestSetup                                       |
| 4a  | Directory placement | pass    | test/production correct — launchApp with nextStart in original |
| 4b  | Mode guards         | na      |                                                                |
| 4c  | Turbopack guards    | pass    | Correct pattern wrapping describe outside nextTestSetup        |
| 4d  | Dedup guards        | na      |                                                                |
| 4e  | No incorrect env    | pass    |                                                                |
| 5a  | render              | pass    | renderViaHTTP → next.render                                    |
| 5b  | fetch               | na      |                                                                |
| 5c  | browser             | na      |                                                                |
| 5d  | check→retry         | na      |                                                                |
| 5e  | File class          | na      |                                                                |
| 5f  | waitFor             | na      | waitPort removed (handled by nextTestSetup)                    |
| 5g  | fs operations       | na      |                                                                |
| 6a  | Fixtures exist      | pass    | pages/index.js, next.config.js present                         |
| 6b  | next.config.js      | pass    | Copied over                                                    |
| 6c  | Overrides           | na      |                                                                |
| 7a  | No dead code        | pass    |                                                                |
| 7b  | retry over timeout  | pass    |                                                                |
| 7c  | async/await         | pass    |                                                                |
| 7d  | eslint              | pass    |                                                                |

## Issues

None

## Warnings

None
