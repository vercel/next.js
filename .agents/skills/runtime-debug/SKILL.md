---
name: runtime-debug
description: >
  Debug and verification workflow for runtime-bundle and module-resolution
  regressions. Use when diagnosing unexpected module inclusions, bundle
  size regressions, or CI failures related to NEXT_SKIP_ISOLATE, nft.json
  traces, or runtime bundle selection (module.compiled.js). Covers CI env
  mirroring, full stack traces via __NEXT_SHOW_IGNORE_LISTED, route trace
  inspection, and webpack stats diffing.
---

# Runtime Debug

Use this skill when reproducing runtime-bundle, module-resolution, or user-bundle inclusion regressions.

## Local Repro Discipline

- Mirror CI env vars when reproducing CI failures.
- Key variables: `IS_WEBPACK_TEST=1` forces webpack (turbopack is default), `NEXT_SKIP_ISOLATE=1` skips packing next.js.
- For module-resolution validation, always rerun without `NEXT_SKIP_ISOLATE=1`.

## Stack Trace Visibility

Set `__NEXT_SHOW_IGNORE_LISTED=true` to disable the ignore-list filtering in dev server error output. By default, Next.js collapses internal frames to `at ignore-listed frames`, which hides useful context when debugging framework internals. Defined in `packages/next/src/server/patch-error-inspect.ts`.

## User-Bundle Regression Guardrail

When user `next build` starts bundling internal Node-only helpers unexpectedly:

1. Inspect route trace artifacts (`.next/server/.../page.js.nft.json`).
2. Inspect traced server chunks for forbidden internals (e.g. `next/dist/server/stream-utils/node-stream-helpers.js`, `node:stream/promises`).
3. Add a `test-start-webpack` assertion that reads the route trace and traced server chunks, and fails on forbidden internals. This validates user-project bundling (not publish-time runtime bundling).

## Bundle Tracing / Inclusion Proof

To prove what user bundling includes, emit webpack stats from the app's `next.config.js`:

```js
// next.config.js
module.exports = {
  webpack(config) {
    config.profile = true
    return config
  },
}
```

Then use `stats.toJson({ modules: true, chunks: true, reasons: true })` and diff `webpack-stats-server.json` between modes. This gives concrete inclusion reasons (e.g. which module required `node:stream/promises`) and is more reliable than analyzer HTML alone.

## Related Skills

- `$flags` - flag wiring (config/schema/define-env/runtime env)
- `$dce-edge` - DCE-safe require patterns and edge constraints
- `$react-vendoring` - entry-base boundaries and vendored React
