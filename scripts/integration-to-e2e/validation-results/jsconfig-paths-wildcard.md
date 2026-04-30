# jsconfig-paths-wildcard: PASS

Clean conversion: two `runTests()` invocations mapped to two describe blocks with equivalent coverage, using `overrideFiles` to swap jsconfig.json.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                     |
| --- | ------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2 (runTests() x2), converted: 2                                                                |
| 1b  | Assertions          | pass    | original: 2, converted: 2                                                                                |
| 1c  | Test titles         | pass    | "should resolve a wildcard alias" preserved                                                              |
| 1d  | Describe blocks     | pass    | "default behavior" preserved; "without baseUrl" maps to "jsconfig paths without baseurl wildcard"        |
| 2a  | URL paths           | pass    | /wildcard-alias preserved                                                                                |
| 2b  | Response checks     | pass    | body text /world/ match preserved                                                                        |
| 2c  | FS checks           | na      |                                                                                                          |
| 2d  | Browser checks      | na      |                                                                                                          |
| 2e  | Build output        | na      |                                                                                                          |
| 2f  | Dynamic logic       | pass    | runTests() inlined into both describes                                                                   |
| 3a  | nextTestSetup       | pass    |                                                                                                          |
| 3b  | files param         | pass    | files: \_\_dirname                                                                                       |
| 3c  | skipStart           | na      | dev server test                                                                                          |
| 3d  | No manual lifecycle | pass    | No findPort/launchApp/killApp                                                                            |
| 3e  | Cleanup             | pass    | overrideFiles replaces File.write/restore                                                                |
| 4a  | Directory placement | pass    | test/development/ matches launchApp (dev)                                                                |
| 4b  | Mode guards         | na      |                                                                                                          |
| 4c  | Turbopack guards    | na      |                                                                                                          |
| 4d  | Dedup guards        | na      |                                                                                                          |
| 4e  | No incorrect env    | pass    |                                                                                                          |
| 5a  | render              | pass    | renderViaHTTP + cheerio → next.render$                                                                   |
| 5b  | fetch               | na      |                                                                                                          |
| 5c  | browser             | na      |                                                                                                          |
| 5d  | check→retry         | na      |                                                                                                          |
| 5e  | File class          | pass    | File(jsconfig).write/restore → overrideFiles                                                             |
| 5f  | waitFor             | na      |                                                                                                          |
| 5g  | fs operations       | na      |                                                                                                          |
| 6a  | Fixtures exist      | pass    | jsconfig.json, next.config.js, pages/wildcard-alias.js, node_modules/mypackage all present               |
| 6b  | next.config.js      | pass    | present                                                                                                  |
| 6c  | Overrides           | pass    | overrideFiles jsconfig.json mirrors original mutation (deletes baseUrl, sets paths to ./node_modules/\*) |
| 7a  | No dead code        | pass    |                                                                                                          |
| 7b  | retry over timeout  | na      |                                                                                                          |
| 7c  | async/await         | pass    |                                                                                                          |
| 7d  | eslint              | pass    |                                                                                                          |

## Issues

None

## Warnings

None
