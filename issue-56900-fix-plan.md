# Issue 56900 Investigation Plan

## Branch

`investigate/issue-56900-standalone-styled-jsx`

## GitHub context collected

- Issue: <https://github.com/vercel/next.js/issues/56900> (`open`, labels: `bug`, `Runtime`)
- Core failure: `Error: Cannot find module 'styled-jsx/style'` (or `styled-jsx/package.json`) in deployed runtime.
- Pattern in comments:
  - Reported fixed for some users in `14.0.1`, but regressed/reappeared in 14.x/15.x.
  - Strong correlation with `output: 'standalone'` + pnpm workspace/symlink layouts.
  - User workarounds rely on hoisting or flattening/copying `node_modules` symlinks.

### Related issues likely sharing root cause

- <https://github.com/vercel/next.js/issues/48017> (`Missing dependencies when using standalone output with pnpm 8`)
- <https://github.com/vercel/next.js/issues/50072> (`Dependencies missing in standalone build`)
- <https://github.com/vercel/next.js/issues/77472> (`PNPM Workspaces + Standalone cannot find module ... upon launch`)

These indicate the problem is broader than just `styled-jsx` and likely sits in standalone trace copy semantics with symlinks.

## Code paths inspected

- `packages/next/src/server/require-hook.ts`
  - Builds `defaultOverrides` using `resolve('styled-jsx/package.json')` and `resolve('styled-jsx/style')`.
  - If resolution fails, aliases are not installed.
- `packages/next/src/build/collect-build-traces.ts`
  - Traces `Object.keys(defaultOverrides)` as shared entries for standalone server tracing.
- `packages/next/src/build/utils.ts` (`copyTracedFiles`)
  - Copies traced files into `.next/standalone`.
  - For symlinks, currently recreates the same symlink target string in output.

## Probable root cause

Standalone output currently preserves symlink targets verbatim. With pnpm/workspaces, those targets can point outside `.next/standalone` (or into partial package trees), so runtime resolution breaks after deployment when only standalone artifacts are present.

That explains both:

- missing `styled-jsx` resolution in `require-hook` and
- other missing-module errors in standalone server startup under pnpm.

## What should be done for a proper fix

### 1) Make standalone symlink handling self-contained

In `copyTracedFiles` (`packages/next/src/build/utils.ts`), change symlink copy behavior from “preserve raw link string” to “ensure standalone-local validity”:

- Resolve the traced symlink target against source location.
- Determine whether target is inside traced universe and has (or will have) a copied location in standalone output.
- If yes, rewrite symlink target to a relative path pointing to the copied target location inside standalone.
- If no (or target escapes tracing root), dereference and copy the pointed file/dir content instead of emitting a fragile external link.

This prevents broken links to paths outside standalone.

### 2) Harden `styled-jsx` tracing expectations

Keep `defaultOverrides` tracing, but explicitly validate that standalone output contains a resolvable `styled-jsx` package path for startup.

If needed after step 1, add a minimal explicit include for `styled-jsx/package.json` in shared traced entries (to avoid edge cases where only `style` is traced but package resolution still fails).

### 3) Add regression coverage

Add focused tests in standalone suites to prevent future regressions:

- pnpm workspace + `output: 'standalone'` app
- API route request path that triggers server runtime startup path
- Assert server boot succeeds and API route responds 200
- Assert no `Cannot find module 'styled-jsx/style'`/`styled-jsx/package.json`

Also add a case where standalone bundle is moved to a new directory before startup (common deployment shape), because this catches escaping symlink targets.

## Suggested implementation outline

1. Refactor symlink branch in `copyTracedFiles` into helper(s):
   - `resolveSymlinkTarget(...)`
   - `getStandaloneOutputPathForTracedPath(...)`
   - `copyOrRewriteSymlink(...)`
2. Prefer rewritten internal relative symlink when target is traced and copied.
3. Fallback to dereferenced copy when target cannot be made standalone-local.
4. Keep Windows junction fallback behavior for creation failures.

## Validation plan

- Build Next package: `pnpm --filter=next build`
- Run affected standalone tests (pnpm/workspace related) and add new regression test.
- Manual smoke with a minimal pnpm workspace fixture:
  - `next build`
  - run `node .next/standalone/server.js` from copied output dir
  - verify API route response and absence of module resolution failures.

## Risk notes

- Symlink rewrite logic can impact artifact size/perf if fallback-copy triggers too often.
- Must avoid breaking Windows behavior added in recent junction fallback changes.
- Must preserve non-pnpm scenarios and npm/yarn behavior.

## Expected result after fix

Standalone output becomes self-contained and resilient across package managers, especially pnpm workspace layouts, eliminating the `styled-jsx` module-not-found class of runtime failures represented by issue #56900.

## Current implementation status

- ✅ Implemented first-pass fix in `packages/next/src/build/utils.ts` (`copyTracedFiles`):
  - rewrites symlink targets to standalone-local relative links when target resolves within tracing root
  - falls back to dereferenced copy when symlink target resolves outside tracing root
  - preserves Windows junction fallback behavior
- ✅ Added regression assertion in `test/production/standalone-mode/required-server-files/required-server-files.test.ts`:
  - verifies `styled-jsx/style` resolves from standalone output via `node -e` in `standalone` cwd
- ⚠️ Verification currently blocked in this workspace state due missing built artifacts in package deps (`@next/env`, polyfill dist files), so the targeted standalone suite cannot run to completion yet.

### Remaining verification once workspace is bootstrapped

1. `pnpm build`
2. `pnpm test-start-turbo test/production/standalone-mode/required-server-files/required-server-files.test.ts`
3. Confirm new regression test passes and no standalone module-resolution regressions appear.
