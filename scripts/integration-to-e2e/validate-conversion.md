# Evaluation Criteria

For the suite provided, evaluate ALL of the following. Every criterion must get an explicit pass/fail/warn/na verdict.

## 1. Test Coverage Preservation

- **1a. Test count**: Count every `it(` / `test(` / `it.each` / `test.each` call in both original and converted. Report both counts. Flag if converted has fewer tests.
- **1b. Assertion preservation**: Count every `expect(` call. The converted file should have >= the original count. Flag drops.
- **1c. Test title preservation**: Every test title (`it('title', ...)`) in the original should appear in the converted (with minor wording changes allowed). List any dropped test titles.
- **1d. Describe block structure**: Verify the describe nesting hierarchy is preserved or appropriately flattened. Flag any describe blocks that were dropped entirely.

## 2. Behavioral Equivalence

- **2a. URL paths tested**: Every URL path accessed in the original (via `renderViaHTTP`, `fetchViaHTTP`, `webdriver`, etc.) must be accessed in the converted (via `next.render()`, `next.fetch()`, `next.browser()`, etc.).
- **2b. Response checks**: Every assertion on response status, headers, body content, or HTML structure must be preserved. Check that `res.status`, `res.headers`, `res.text()`, `$('selector')` assertions match.
- **2c. File system checks**: Any assertions on file existence, file content, or manifest reading must be preserved. The converted test should use `next.readFile()`, `next.readJSON()`, or `next.hasFile()` instead of direct `fs` calls on the app directory.
- **2d. Browser interaction checks**: If the original uses `webdriver()` or `browser.*` calls, the converted must use `next.browser()` with equivalent selectors and interactions.
- **2e. Build output checks**: If the original checks build success/failure via `nextBuild()` return values or stdout, the converted must use `next.build()` and `next.cliOutput` equivalently.
- **2f. Dynamic test logic**: If the original has `runTests(mode)` helper functions that run tests differently for dev vs prod, verify those conditional paths are preserved using `isNextDev` / `isNextStart` guards.

## 3. Lifecycle & Setup Correctness

- **3a. nextTestSetup usage**: The converted file MUST use `nextTestSetup()` from `'e2e-utils'` (except for files using `createNext` or custom server patterns like `initNextServerScript`).
- **3b. files parameter**: The `files` parameter should point to `__dirname` (preferred) or `path.join(__dirname, 'fixtures/...')`. Should NOT use inline `files: { 'page.tsx': '...' }` objects (warn only — acceptable for very small fixtures).
- **3c. skipStart usage**: If the original was a build-only test (calls `nextBuild()` but never starts the server), the converted MUST use `skipStart: true` and call `await next.build()` explicitly.
- **3d. No manual lifecycle**: The converted file should NOT import/use `findPort`, `killApp`, `launchApp`, `nextBuild`, `nextStart`, `startApp`, `stopApp` UNLESS it's in the lifecycle allowlist (external server tests, image CDN proxies, CLI tests, telemetry tests).
- **3e. Cleanup**: If the original had `afterAll`/`afterEach` cleanup (killing processes, restoring files), verify the converted test doesn't need explicit cleanup (nextTestSetup handles it) OR has proper cleanup for non-Next resources.

## 4. Mode & Guard Correctness

- **4a. Directory placement**:
  - Tests that run in BOTH dev and prod → `test/e2e/`
  - Tests that run ONLY in production (build+start) → `test/production/`
  - Tests that run ONLY in development → `test/development/`
  - Verify the placement matches the original test's mode coverage.
- **4b. Mode guards**: If the original test had different behavior for dev vs prod (e.g., `runTests('dev')` in one block and `runTests('server')` in another), verify the converted test uses `isNextDev` / `isNextStart` guards correctly.
- **4c. Turbopack skip guards**: If the original test was skipped for Turbopack, verify the converted test uses the correct pattern:
  - Webpack-only (skip for Turbopack): `;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)('...', () => { ... })` — this pattern MUST wrap OUTSIDE the `nextTestSetup` call to avoid spinning up the test app unnecessarily.
  - Turbopack-only (skip for webpack): `;(!process.env.IS_TURBOPACK_TEST ? describe.skip : describe)('...', () => { ... })`
  - **IMPORTANT**: Do NOT use `if (isTurbopack) { it('skipped', () => {}); return }` inside a describe that calls `nextTestSetup()` — this runs the setup unnecessarily.
- **4d. Dedup guards**: If the original test had dedup guards like `(isNextStart && !!process.env.TURBOPACK_DEV) || (isNextDev && !!process.env.TURBOPACK_BUILD)`, verify they are preserved in the converted test. These prevent redundant CI runs.
- **4e. No incorrect env guards**: The converted test should NOT use `process.env.TURBOPACK_DEV` or `process.env.TURBOPACK_BUILD` for skip logic. Use `isTurbopack` from `nextTestSetup()` or `process.env.IS_TURBOPACK_TEST` (only for top-level describe wrapping).

## 5. API Migration Correctness

- **5a. renderViaHTTP → next.render()**: Every `renderViaHTTP(port, path)` should become `next.render(path)`.
- **5b. fetchViaHTTP → next.fetch()**: Every `fetchViaHTTP(port, path, query, opts)` should become `next.fetch(path, opts)` with query params in the URL if needed.
- **5c. webdriver → next.browser()**: Every `webdriver(port, path)` should become `next.browser(path)`.
- **5d. check() → retry() + expect()**: Every `check(() => ..., expected)` should become `await retry(async () => { ... expect(...) })`. The `check` function is deprecated.
- **5e. File class → next.patchFile()**: If the original used `new File(path)` from next-test-utils for hot-reload testing, it should be replaced with `next.patchFile()` / `next.deleteFile()`.
- **5f. waitFor → retry()**: `waitFor(ms)` (setTimeout-based waiting) should generally be replaced with `retry()` for polling. `waitFor` is acceptable only for animation/timing delays, NOT for waiting on async state.
- **5g. fs operations → next helpers**: Direct `fs.readFileSync(join(appDir, ...))` should use `next.readFile()`, `next.readJSON()`, etc. The converted test's working directory is an isolated copy, so direct `appDir` paths won't work.

## 6. Fixture Correctness

- **6a. Fixture files exist**: Verify that the fixture directory referenced by `files: __dirname` or `files: path.join(...)` actually contains the necessary fixture files (pages, components, next.config.js, etc.). Use Glob to check the converted test's directory for expected files.
- **6b. next.config.js**: If the original had a `next.config.js` in its directory, verify it's present in the converted fixture directory OR is provided via `nextConfig` option in `nextTestSetup()`.
- **6c. overrideFiles / nextConfig**: If the converted test uses `overrideFiles` or `nextConfig`, verify they produce the equivalent configuration as the original test.

## 7. Code Quality

- **7a. No dead code**: Flag any commented-out tests, unused imports, or orphaned helper functions.
- **7b. retry() over setTimeout**: Tests should use `retry()` from `next-test-utils` for polling, not `setTimeout` or `waitFor` for waiting on async state changes.
- **7c. Proper async/await**: All async operations should be properly awaited. No fire-and-forget promises.
- **7d. eslint compliance**: No obvious eslint violations (duplicate test titles without disable comments, unused variables, etc.).

## Output Format

Return your result as a markdown document with the following structure. The first line MUST be a heading with the verdict.

```
# <suite-name>: PASS|WARN|FAIL

One-sentence summary of the conversion quality.

## Criteria

| # | Criterion | Verdict | Note |
|---|-----------|---------|------|
| 1a | Test count | pass | original: 15, converted: 15 |
| 1b | Assertions | pass | original: 30, converted: 32 |
| 1c | Test titles | pass | All preserved |
| 1d | Describe blocks | pass | |
| 2a | URL paths | pass | |
| 2b | Response checks | pass | |
| 2c | FS checks | na | |
| 2d | Browser checks | na | |
| 2e | Build output | pass | |
| 2f | Dynamic logic | na | |
| 3a | nextTestSetup | pass | |
| 3b | files param | pass | files: __dirname |
| 3c | skipStart | pass | Build-only, uses skipStart: true |
| 3d | No manual lifecycle | pass | |
| 3e | Cleanup | pass | |
| 4a | Directory placement | pass | test/production/ correct for prod-only |
| 4b | Mode guards | pass | |
| 4c | Turbopack guards | na | |
| 4d | Dedup guards | na | |
| 4e | No incorrect env | pass | |
| 5a | render | pass | |
| 5b | fetch | pass | |
| 5c | browser | na | |
| 5d | check→retry | na | |
| 5e | File class | na | |
| 5f | waitFor | pass | |
| 5g | fs operations | na | |
| 6a | Fixtures exist | pass | pages/index.js, next.config.js present |
| 6b | next.config.js | pass | |
| 6c | Overrides | na | |
| 7a | No dead code | pass | |
| 7b | retry over timeout | pass | |
| 7c | async/await | pass | |
| 7d | eslint | pass | |

## Issues

(List any fail-level problems, or "None" if all pass)

## Warnings

(List any warn-level observations, or "None")
```

### Verdict Rules

- **FAIL**: Any criterion has verdict "fail" (tests dropped, assertions missing, wrong lifecycle, broken guards)
- **WARN**: No fails but some criteria have verdict "warn" (minor count differences, style issues, non-critical observations)
- **PASS**: All criteria are "pass" or "na"

## Important Notes

- Read the FULL content of both original and converted files. Do not skip sections.
- For suites that split into multiple converted files (e.g., one in `test/e2e/` and another in `test/production/`), evaluate all converted files together as a whole.
- Pay special attention to `runTests()` helper functions in the original — these often contain the bulk of the test logic and must be fully inlined or preserved.
- Watch for tests that were conditionally run in the original (e.g., `if (mode === 'dev')`) — these conditions must map to `isNextDev` / `isNextStart` in the converted file.
- The `appDir` variable in originals pointed to the fixture directory. In converted tests, fixture operations use `next.*` helpers operating on the isolated test directory.
- Use Glob to verify fixture files exist in the converted test directory. Do not mark fixture checks as "warn" due to inability to verify — actually check.
