# e2e--500-page--500-page.test.ts.dev: FIXED

## Root cause

The prior failure was caused by a stale Next.js build. The failure output showed React throwing `useInsertionEffect` errors during SSR of the dev overlay bridge — a symptom of running the test against outdated compiled output from a different React vendoring state. When tests were captured in the failure report, the build was out of sync with HEAD. Running with the current build (warning still present but newer than the snapshot used for failures) resolves all failures. The converted test file itself is correct and faithfully mirrors the original integration test's dev-mode semantics.

## Fix applied

None. No code changes were necessary; the test passes as written against the current build.

## Verification

Ran the exact verification command twice. Both runs: 6/6 tests pass, including the previously-failing "should use pages/500" and "should not error when visited directly".
