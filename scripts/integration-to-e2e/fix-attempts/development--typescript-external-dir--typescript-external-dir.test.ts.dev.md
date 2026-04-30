Both pass.

# development--typescript-external-dir--typescript-external-dir.test.ts.dev: FIXED

## Root cause

The converted test used `subDir: 'project'` with sibling files copied via `'../shared/...'` keys. That caused `pnpm install` to run inside `.../install-xxx/project`, placing `pnpm-lock.yaml` there. When Next.js/Turbopack started, it walked up from the project dir, found the lockfile at `project/`, and treated that as the workspace/tracing root (`rootPath`). The `shared/` directory placed at `.../install-xxx/shared` was outside that rootPath, so even with `experimental.externalDir: true` Turbopack refused to resolve `../../shared/components/counter` from `pages/index.tsx`. The original integration test works only because it lives in the Next.js monorepo where the lockfile is many levels up.

## Fix applied

- `test/development/typescript-external-dir/typescript-external-dir.test.ts` — dropped `subDir: 'project'`, pass `project/` and `shared/` as sibling `FileRef`s at the install root, and run Next.js against the `project` subdirectory via `startCommand`. This mirrors the pattern used by `test/e2e/relay-graphql-swc-multi-project`, so the install root contains the lockfile and Turbopack's rootPath encompasses `shared/`.

## Verification

Ran `NEXT_SKIP_ISOLATE=1 IS_TURBOPACK_TEST=1 NEXT_TEST_MODE=dev HEADLESS=true pnpm jest --runInBand test/development/typescript-external-dir/typescript-external-dir.test.ts` — 1 passed. Also verified without `NEXT_SKIP_ISOLATE` (the module-resolution path) — 1 passed.
