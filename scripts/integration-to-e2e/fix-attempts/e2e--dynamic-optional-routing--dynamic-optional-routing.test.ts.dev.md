# e2e--dynamic-optional-routing--dynamic-optional-routing.test.ts.dev: FIXED

## Root cause

The test is actually passing as-written now. The prior failure report showed two tests (tests 4 and 5 in the `build validation` describe) with wrong error messages in their `cliOutput`. The real cause in the earlier failing run was almost certainly a dirty fixture directory — e.g. a leftover `pages/invalid/[[...slug]].js` or `pages/nested/[...param].js` file from a previous aborted run of the test, which made the route-sorter throw the "same specificity" / "required vs optional catch-all at the same level" error _before_ reaching the "Optional route parameters are not yet supported" / "A required parameter ... was not provided as an array" errors that the tests assert on. The current fixture directory is clean (only `pages/[[...optionalName]].js`, `about.js`, `api/`, `get-static-paths*`, `nested/[[...optionalName]].js`) and the test code's patch-then-delete sequence works correctly: each `next.build()` sees only its own patched file and emits the expected error.

## Fix applied

None — no code changes were required. The test passes as-is; the previous failure was caused by a dirty fixture directory from an aborted prior run, not a bug in the converted test.

## Verification

Ran the specified command twice back-to-back:

- Run 1: `Tests: 33 passed, 33 total` (35.1s)
- Run 2: `Tests: 33 passed, 33 total` (35.5s)

Both previously-failing tests now pass:

- ✓ should fail to build when optional but no catch-all (4151 ms)
- ✓ should fail to build when param is not explicitly defined (5473 ms)
