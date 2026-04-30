# preload-viewport: PASS

Faithful 1:1 conversion of the integration test suite to a production e2e test with proxy-based custom setup, with all fixtures and behaviors preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                                                              |
| --- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 21, converted: 21                                                                                                                                                                                       |
| 1b  | Assertions          | pass    | Equivalent count (~40+ each)                                                                                                                                                                                      |
| 1c  | Test titles         | pass    | All 21 titles preserved verbatim                                                                                                                                                                                  |
| 1d  | Describe blocks     | pass    | Outer "Prefetching Links in viewport" preserved; inner "production mode" flattened (file is in test/production/)                                                                                                  |
| 2a  | URL paths           | pass    | All paths (/, /ssg/slow, /bot-user-agent, /rewrite-prefetch, /prefetch-disabled, /prefetch-disabled-ssg, /invalid-ref, /invalid-prefetch, /opt-out, /multi-prefetch, /ssg/fixture, /ssg/fixture/mismatch) covered |
| 2b  | Response checks     | pass    |                                                                                                                                                                                                                   |
| 2c  | FS checks           | pass    | BUILD_ID and \_ssgManifest.js read via `next.readFile()`                                                                                                                                                          |
| 2d  | Browser checks      | pass    | `webdriver(proxyPort, ...)` preserved (needed to go through proxy)                                                                                                                                                |
| 2e  | Build output        | na      |                                                                                                                                                                                                                   |
| 2f  | Dynamic logic       | na      | Original has only production block                                                                                                                                                                                |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup({ files: __dirname, skipStart: true })`                                                                                                                                                       |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                                                                |
| 3c  | skipStart           | pass    | Uses `skipStart: true` with explicit `next.build()` + `next.start()` to intercept with proxy                                                                                                                      |
| 3d  | No manual lifecycle | pass    | Only `findPort` remains (used for the proxy server, not Next)                                                                                                                                                     |
| 3e  | Cleanup             | pass    | `afterAll` closes proxyServer; Next lifecycle handled by harness                                                                                                                                                  |
| 4a  | Directory placement | pass    | Production-only in test/production/ matches original's production-only block                                                                                                                                      |
| 4b  | Mode guards         | na      |                                                                                                                                                                                                                   |
| 4c  | Turbopack guards    | pass    | `(isTurbopack ? it.skip : it)` for "not prefetch already loaded scripts"                                                                                                                                          |
| 4d  | Dedup guards        | pass    | Original's TURBOPACK_DEV guard implicitly handled by production directory placement                                                                                                                               |
| 4e  | No incorrect env    | pass    | Uses `isTurbopack` from `nextTestSetup()`                                                                                                                                                                         |
| 5a  | render              | na      |                                                                                                                                                                                                                   |
| 5b  | fetch               | na      |                                                                                                                                                                                                                   |
| 5c  | browser             | pass    | `webdriver(proxyPort, ...)` intentionally kept for proxy routing                                                                                                                                                  |
| 5d  | check→retry         | pass    | `check(...)` in "not re-prefetch" replaced with `retry()` + `expect().toMatch()`                                                                                                                                  |
| 5e  | File class          | na      |                                                                                                                                                                                                                   |
| 5f  | waitFor             | pass    | Retained only for deliberate timing delays (prefetch timeout, mouse-hover settling)                                                                                                                               |
| 5g  | fs operations       | pass    | `next.readFile()` for BUILD_ID and \_ssgManifest.js; `next.testDir` for manifest chunk lookup                                                                                                                     |
| 6a  | Fixtures exist      | pass    | All 22 fixture files + next.config.js present                                                                                                                                                                     |
| 6b  | next.config.js      | pass    | Present at root                                                                                                                                                                                                   |
| 6c  | Overrides           | na      |                                                                                                                                                                                                                   |
| 7a  | No dead code        | pass    |                                                                                                                                                                                                                   |
| 7b  | retry over timeout  | pass    | Intentional waits preserved; state polling uses retry                                                                                                                                                             |
| 7c  | async/await         | pass    |                                                                                                                                                                                                                   |
| 7d  | eslint              | pass    | Includes `/* eslint-disable jest/no-standalone-expect */` for the conditional `it.skip` block                                                                                                                     |

## Issues

None

## Warnings

None
