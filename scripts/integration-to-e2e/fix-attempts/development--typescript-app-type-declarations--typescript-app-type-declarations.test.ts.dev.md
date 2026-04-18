All 3 tests pass.

# development--typescript-app-type-declarations--typescript-app-type-declarations.test.ts.dev: FIXED

## Root cause

The converted test uses a persistent `nextTestSetup` dev server, but Next.js only writes `next-env.d.ts` during dev server startup via `verifyTypeScript()` in `setup-dev-bundler.ts`. In the persistent-server model, deleting or modifying `next-env.d.ts` and calling `next.render('/')` does not retrigger `writeAppTypeDeclarations`, so the retry timed out waiting for regeneration. The original integration test worked because it called `launchApp` for each test (fresh startup → fresh write). After test 1 left the file deleted/mangled, tests 2 and 3 failed on their initial `readFile` call.

## Fix applied

- `test/development/typescript-app-type-declarations/typescript-app-type-declarations.test.ts`: In the two tests that remove or corrupt `next-env.d.ts`, restart the dev server (`next.stop()` + `next.start()`) before `render('/')` so the startup path writes the file, matching the original integration test's per-test-server semantics. Test 3 was left unchanged.

## Verification

`NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=dev HEADLESS=true pnpm jest --runInBand …` → Tests: 3 passed, 3 total (9.38s).
