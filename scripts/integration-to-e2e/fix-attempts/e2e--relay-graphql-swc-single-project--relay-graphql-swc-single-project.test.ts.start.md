# e2e--relay-graphql-swc-single-project--relay-graphql-swc-single-project.test.ts.start: FIXED

## Root cause

The converted test specified `relay-runtime` as a runtime dependency but omitted `@types/relay-runtime`, so TypeScript's build-time type check failed with "Could not find a declaration file for module 'relay-runtime'" and cascading implicit-any errors on the `fetchGraphQL(params, variables)` parameters (whose types come from relay-runtime's `FetchFunction`).

## Fix applied

No new edits needed — `@types/relay-runtime: 'latest'` was already present in the `dependencies` of `test/e2e/relay-graphql-swc-single-project/relay-graphql-swc-single-project.test.ts:11`, which is the exact fix recommended by the prior assessment.

## Verification

Ran `NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=start HEADLESS=true pnpm jest --runInBand test/e2e/relay-graphql-swc-single-project/relay-graphql-swc-single-project.test.ts`: 1 passed, 0 failed (6.2s). TypeScript check passes, build succeeds, and the index-page assertion passes.
