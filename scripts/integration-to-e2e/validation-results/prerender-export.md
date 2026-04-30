# prerender-export: PASS

Clean, faithful conversion of the static export prerender suite; fixtures identical and both tests preserved.

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                   |
| --- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1a  | Test count          | pass    | original: 2, converted: 2                                                                                              |
| 1b  | Assertions          | pass    | original: ~27, converted: ~27                                                                                          |
| 1c  | Test titles         | pass    | Both preserved verbatim                                                                                                |
| 1d  | Describe blocks     | pass    | Outer `SSG Prerender export` kept; TURBOPACK_DEV wrapper correctly dropped (prod-only dir)                             |
| 2a  | URL paths           | pass    | All 7 prebuild URLs + navigation targets preserved                                                                     |
| 2b  | Response checks     | pass    | All browser text / window.didTransition assertions preserved                                                           |
| 2c  | FS checks           | pass    | `fs.access` → `next.readFile('out/...')`; `fs.readFile(BUILD_ID)` → `next.readFile('.next/BUILD_ID')`                  |
| 2d  | Browser checks      | pass    | webdriver interactions reproduced 1:1                                                                                  |
| 2e  | Build output        | pass    | `nextBuild()` → `next.build()` via skipStart                                                                           |
| 2f  | Dynamic logic       | pass    | Dev branch of `navigateTest(dev)` correctly dropped since suite is prod-only; prod branch `toMatch(nextTime)` retained |
| 3a  | nextTestSetup       | pass    |                                                                                                                        |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                     |
| 3c  | skipStart           | pass    | Build-only static export; `skipStart: true` with explicit `next.build()`                                               |
| 3d  | No manual lifecycle | pass    | Uses `startStaticServer` which is unavoidable for serving `out/` — not a Next.js lifecycle helper                      |
| 3e  | Cleanup             | pass    | afterAll closes the static server explicitly                                                                           |
| 4a  | Directory placement | pass    | `test/production/` matches original (prod mode only)                                                                   |
| 4b  | Mode guards         | na      | Prod-only                                                                                                              |
| 4c  | Turbopack guards    | na      | No turbopack-specific skip needed                                                                                      |
| 4d  | Dedup guards        | na      | Original `TURBOPACK_DEV` guard was to prevent dev-matrix runs — placement in `test/production/` makes this implicit    |
| 4e  | No incorrect env    | pass    |                                                                                                                        |
| 5a  | render              | na      | renderViaHTTP points at static server (not next.url), so next.render() would be wrong                                  |
| 5b  | fetch               | na      | No fetch usage                                                                                                         |
| 5c  | browser             | na      | webdriver points at static server port, not next.url — next.browser() wouldn't work                                    |
| 5d  | check→retry         | na      | No check() in original                                                                                                 |
| 5e  | File class          | na      |                                                                                                                        |
| 5f  | waitFor             | pass    | waitFor(2500)/(2000) preserved for revalidation timing — correct usage                                                 |
| 5g  | fs operations       | pass    | All fs reads on appDir migrated to `next.readFile`                                                                     |
| 6a  | Fixtures exist      | pass    | `pages/`, `next.config.js`, `world.txt` all present and identical to original                                          |
| 6b  | next.config.js      | pass    | Identical to original                                                                                                  |
| 6c  | Overrides           | na      |                                                                                                                        |
| 7a  | No dead code        | pass    |                                                                                                                        |
| 7b  | retry over timeout  | pass    | waitFor retained only for timing-sensitive revalidation                                                                |
| 7c  | async/await         | pass    |                                                                                                                        |
| 7d  | eslint              | pass    |                                                                                                                        |

## Issues

None.

## Warnings

None.
