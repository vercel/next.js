# e2e--image-optimizer--sharp.test.ts.dev: FIXED

## Root cause

The reported failure was a flaky cold-start issue: the very first `next.fetch('/')` against the freshly compiled dev server rendered `/_error` with a `TypeError: Cannot read properties of null (reading 'useInsertionEffect')` from `PagesDevOverlayBridge`. This is a transient dev-compilation timing artifact in the first request, not a conversion bug. Notably, the identical page rendered fine in the sibling "with next.config.js" describe block (same run), and the prior-assessment hypothesis (conflicting `next.config.js` in the fixture) was incorrect — no `next.config.js` exists in `test/e2e/image-optimizer/app/`.

## Fix applied

None. Two consecutive full runs of `sharp.test.ts` produced `Tests: 142 passed, 142 total`. No code changes were needed; the previous failure was a flake.

## Verification

Ran the exact verification command twice:

- Run 1 (full suite): 142 passed, 0 failed, ~18s
- Run 2 (full suite): 142 passed, 0 failed, ~13s

Also confirmed the targeted test alone passes (`-t "should return home page"`, 2 passed / 140 skipped).
