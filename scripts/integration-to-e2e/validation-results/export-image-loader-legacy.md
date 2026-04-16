# export-image-loader-legacy: WARN

Conversion is functionally complete with all assertions preserved, but four describe blocks were collapsed into four tests (7 → 4 `it` blocks).

## Criteria

| #   | Criterion           | Verdict | Note                                                                                                                                                                           |
| --- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1a  | Test count          | warn    | original: 7, converted: 4 (consolidated build+html-check pairs into single tests)                                                                                              |
| 1b  | Assertions          | pass    | original: 7, converted: 8                                                                                                                                                      |
| 1c  | Test titles         | warn    | Titles restructured; "should build successfully" + "should contain img element" pairs merged per scenario                                                                      |
| 1d  | Describe blocks     | warn    | Four describe blocks collapsed into one; scenarios preserved as individual tests                                                                                               |
| 2a  | URL paths           | na      | No HTTP requests; static export file reads only                                                                                                                                |
| 2b  | Response checks     | pass    | Same cheerio selectors preserved (`img[alt="icon"]`, `img[src="/custom/o.png"]`, `img[src="/o.png"]`)                                                                          |
| 2c  | FS checks           | pass    | `fs.readFile(outdir/index.html)` → `next.readFile('out/index.html')`                                                                                                           |
| 2d  | Browser checks      | na      |                                                                                                                                                                                |
| 2e  | Build output        | pass    | `nextBuild` exit codes → `next.build().exitCode`; stderr check → `next.cliOutput`                                                                                              |
| 2f  | Dynamic logic       | na      |                                                                                                                                                                                |
| 3a  | nextTestSetup       | pass    | Uses `nextTestSetup` from `e2e-utils`                                                                                                                                          |
| 3b  | files param         | pass    | `files: __dirname`                                                                                                                                                             |
| 3c  | skipStart           | pass    | Build-only test uses `skipStart: true` and explicit `next.build()`                                                                                                             |
| 3d  | No manual lifecycle | pass    | No `nextBuild`/`launchApp`/`killApp`                                                                                                                                           |
| 3e  | Cleanup             | pass    | `afterEach` restores next.config.js and pages/index.js via `next.patchFile`                                                                                                    |
| 4a  | Directory placement | pass    | `test/production/` matches prod-only build tests                                                                                                                               |
| 4b  | Mode guards         | na      |                                                                                                                                                                                |
| 4c  | Turbopack guards    | warn    | Original had `process.env.TURBOPACK_DEV ? describe.skip : describe`; converted has no explicit skip (directory placement in test/production/ handles dev-mode skip implicitly) |
| 4d  | Dedup guards        | na      |                                                                                                                                                                                |
| 4e  | No incorrect env    | pass    |                                                                                                                                                                                |
| 5a  | render              | na      |                                                                                                                                                                                |
| 5b  | fetch               | na      |                                                                                                                                                                                |
| 5c  | browser             | na      |                                                                                                                                                                                |
| 5d  | check→retry         | na      |                                                                                                                                                                                |
| 5e  | File class          | pass    | `new File()` replaced with `next.patchFile()` in afterEach                                                                                                                     |
| 5f  | waitFor             | na      |                                                                                                                                                                                |
| 5g  | fs operations       | pass    | `fs.readFile(outdir, ...)` → `next.readFile('out/...')`                                                                                                                        |
| 6a  | Fixtures exist      | pass    | next.config.js, pages/index.js present                                                                                                                                         |
| 6b  | next.config.js      | pass    | Present with `{ /* replaceme */ }` placeholder                                                                                                                                 |
| 6c  | Overrides           | na      |                                                                                                                                                                                |
| 7a  | No dead code        | pass    |                                                                                                                                                                                |
| 7b  | retry over timeout  | na      | No polling needed                                                                                                                                                              |
| 7c  | async/await         | pass    |                                                                                                                                                                                |
| 7d  | eslint              | pass    |                                                                                                                                                                                |

## Issues

None.

## Warnings

- Test count dropped from 7 → 4. Each original describe had two sequential tests ("should build successfully" then "should contain img element"). These were consolidated into one test per scenario. All assertions remain, but the granularity is reduced — if the build fails, the HTML assertion in the same test also fails rather than showing two separate failures.
- Original `process.env.TURBOPACK_DEV ? describe.skip : describe` wrapper is not present. Placement in `test/production/` largely handles this, but there is no explicit `IS_TURBOPACK_TEST` guard if stricter dedup is desired.
