---
name: react-vendoring
description: >
  React vendoring and react-server layer boundaries. Use when editing
  entry-base.ts, $$compiled.internal.d.ts, compiled/react* packages,
  or taskfile.js copy_vendor_react. Covers the entry-base.ts boundary
  (all react-server-dom-webpack/* imports must go through it), vendored
  React channels, type declarations, Turbopack remap to
  react-server-dom-turbopack, ComponentMod access patterns, and ESLint
  suppression for guarded requires.
---

# React Vendoring

Use this skill for changes touching vendored React, `react-server-dom-webpack/*`, or react-server layer boundaries.

## App Router Vendoring

React is NOT resolved from `node_modules` for App Router. It's vendored into `packages/next/src/compiled/` during `pnpm build` (task: `copy_vendor_react()` in `taskfile.js`). Pages Router resolves React from `node_modules` normally.

- **Two channels**: stable (`compiled/react/`) and experimental (`compiled/react-experimental/`). The runtime bundle webpack config aliases to the correct channel via `makeAppAliases({ experimental })`.

## `entry-base.ts` Boundary

Only `entry-base.ts` is compiled in rspack's `(react-server)` layer. ALL imports from `react-server-dom-webpack/*` (Flight server/static APIs) must go through `entry-base.ts`. Other files like `stream-ops.node.ts` or `app-render.tsx` must access Flight APIs via the `ComponentMod` parameter (which is the `entry-base.ts` module exposed through the `app-page.ts` build template).

Direct imports from `react-server-dom-webpack/server.node` or `react-server-dom-webpack/static` in files outside `entry-base.ts` will fail at runtime with "The react-server condition must be enabled". Dev mode may mask this error, but production workers fail immediately.

## Type Declarations

`packages/next/types/$$compiled.internal.d.ts` contains `declare module` blocks for vendored React packages. When adding new APIs (e.g. `renderToPipeableStream`, `prerenderToNodeStream`), you must add type declarations here. The bare specifier types (e.g. `declare module 'react-server-dom-webpack/server'`) are what source code in `src/` imports against.

## Adding Node.js-Only React APIs

These exist in `.node` builds but not in the type definitions. Steps:

1. Add type declarations to `$$compiled.internal.d.ts`.
2. Export the API from `entry-base.ts` behind a `process.env` guard.
3. Access it via `ComponentMod` in other files.

```typescript
// In entry-base.ts (react-server layer) only:
/* eslint-disable import/no-extraneous-dependencies */
export let renderToPipeableStream: ... | undefined
if (process.env.__NEXT_USE_NODE_STREAMS) {
  renderToPipeableStream = (
    require('react-server-dom-webpack/server.node') as typeof import('react-server-dom-webpack/server.node')
  ).renderToPipeableStream
} else {
  renderToPipeableStream = undefined
}
/* eslint-enable import/no-extraneous-dependencies */

// In other files, access via ComponentMod:
ComponentMod.renderToPipeableStream!(payload, clientModules, opts)
```

## ESLint Practical Rule

For guarded runtime `require()` blocks that need `import/no-extraneous-dependencies` suppression, prefer scoped block disable/enable. If using `eslint-disable-next-line`, the comment must be on the line immediately before the `require()` call, NOT before the `const` declaration. When the `const` and `require()` are on different lines, this is error-prone.

## Turbopack Remap

`react-server-dom-webpack/*` is silently remapped to `react-server-dom-turbopack/*` by Turbopack's import map. Code says "webpack" everywhere, but Turbopack gets its own bindings at runtime. This affects debugging: stack traces and error messages will reference the turbopack variant.

## Related Skills

- `$flags` - flag wiring (config/schema/define-env/runtime env)
- `$dce-edge` - DCE-safe require patterns and edge constraints
- `$runtime-debug` - reproduction and verification workflow
