---
name: dce-edge
description: >
  DCE-safe require() patterns and edge runtime constraints. Use when writing
  conditional require() calls, guarding Node-only imports (node:stream etc.),
  or editing define-env-plugin.ts / app-render / stream-utils for edge builds.
  Covers if/else branching for webpack DCE, TypeScript definite assignment,
  the NEXT_RUNTIME vs real feature flag distinction, and forcing flags false
  for edge in define-env.ts.
---

# DCE + Edge

Use this skill when changing conditional `require()` paths, Node-only imports, or edge/runtime branching.

## DCE-Safe `require()` Pattern

Webpack only DCEs a `require()` when it sits inside the dead branch of an `if/else` whose condition DefinePlugin can evaluate at compile time.

```ts
// CORRECT - webpack can eliminate the dead branch
if (process.env.__NEXT_USE_NODE_STREAMS) {
  require('node:stream')
} else {
  // web path
}
```

What does NOT work:

- **Early-return/throw guards**: webpack doesn't do control-flow analysis for throws/returns, so the `require()` is still traced.
- **Bare `if` without `else`**: works for inline `node:*` specifiers but NOT for `require('./some-module')` that pulls a new file into the module graph.

Always test edge changes with `pnpm test-start-webpack` on `test/e2e/app-dir/app/standalone.test.ts` (has edge routes), not with `NEXT_SKIP_ISOLATE=1` which skips the full webpack compilation.

## TypeScript + DCE Interaction

Use `if/else` (not two independent `if` blocks) when assigning a variable conditionally on `process.env.X`. TypeScript cannot prove exhaustiveness across `if (flag) { x = a }; if (!flag) { x = b }` and will error with "variable used before being assigned". The `if/else` pattern satisfies both TypeScript (definite assignment) and webpack DCE.

## Compile-Time Switcher Pattern

Platform-specific code (node vs web) can use a single `.ts` switcher module that conditionally `require()`s either `.node.ts` or `.web.ts` into a typed variable, then re-exports the shared runtime API as named exports. Keep the branch as `if/else` so DefinePlugin can dead-code-eliminate the unused `require()`. Keep shared types canonical in `.node.ts`, with `.web.ts` importing them via `import type` and the switcher re-exporting types as needed. Examples: `stream-ops.ts` and `debug-channel-server.ts`.

## `NEXT_RUNTIME` Is Not a Feature Flag

In user-project webpack server compilers, `process.env.NEXT_RUNTIME` is inlined to `'nodejs'`. Guarding Node-only `require('node:*')` paths with `NEXT_RUNTIME === 'nodejs'` does **not** prune anything. For feature-gated codepaths, guard on the real feature define (e.g. `process.env.__NEXT_USE_NODE_STREAMS`).

## Edge Runtime Constraints

Edge routes do NOT use pre-compiled runtime bundles. They are compiled by the user's webpack/Turbopack, so `define-env.ts` controls DCE. Feature flags that gate `node:*` imports must be forced to `false` for edge builds in `define-env.ts` (`isEdgeServer ? false : flagValue`), otherwise webpack will try to resolve `node:stream` etc. and fail.

## `app-page.ts` Template Gotchas

- `app-page.ts` is a build template compiled by the user's bundler. Any `require()` in this file is traced by webpack/turbopack at `next build` time. You cannot require internal modules with relative paths because they won't be resolvable from the user's project. Instead, export new helpers from `entry-base.ts` and access them via `entryBase.*` in the template.
- Template helpers should stay out of `RenderResult`. If `app-page.ts` needs a Node-stream-only utility, prefer a small dedicated helper module in `server/stream-utils/` (with DCE-safe `if/else` + `require()`).

## Verification

- Validate edge bundling regressions with `pnpm test-start-webpack test/e2e/app-dir/app/standalone.test.ts`
- For module-resolution/build-graph fixes, verify without `NEXT_SKIP_ISOLATE=1`

## Related Skills

- `$flags` - flag wiring (config/schema/define-env/runtime env)
- `$react-vendoring` - entry-base boundaries and vendored React
- `$runtime-debug` - reproduction and verification workflow
