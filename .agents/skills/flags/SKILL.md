---
name: flags
description: >
  How to add or modify Next.js experimental feature flags end-to-end.
  Use when editing config-shared.ts, config-schema.ts, define-env-plugin.ts,
  next-server.ts, export/worker.ts, or module.compiled.js. Covers type
  declaration, zod schema, build-time injection, runtime env plumbing,
  and the decision between runtime env-var branching vs separate bundle variants.
---

# Feature Flags

Use this skill when adding or changing framework feature flags in Next.js internals.

## Required Wiring

All flags need: `config-shared.ts` (type) → `config-schema.ts` (zod). If the flag is consumed in user-bundled code (client components, edge routes, `app-page.ts` template), also add it to `define-env.ts` for build-time injection. Runtime-only flags consumed exclusively in pre-compiled bundles can skip `define-env.ts`.

## Where the Flag Is Consumed

**Client/bundled code only** (e.g. `__NEXT_PPR` in client components): `define-env.ts` is sufficient. Webpack/Turbopack replaces `process.env.X` at the user's build time.

**Pre-compiled runtime bundles** (e.g. code in `app-render.tsx`): The flag must also be set as a real `process.env` var at runtime, because `app-render.tsx` runs from pre-compiled bundles where `define-env.ts` doesn't reach. Two approaches:

- **Runtime env var**: Set in `next-server.ts` + `export/worker.ts`. Both code paths stay in one bundle. Simple but increases bundle size.
- **Separate bundle variant**: Add DefinePlugin entry in `next-runtime.webpack-config.js` (scoped to `bundleType === 'app'`), new taskfile tasks, update `module.compiled.js` selector, and still set env var in `next-server.ts` + `export/worker.ts` for bundle selection. Eliminates dead code but adds build complexity.

For runtime flags, also add the field to the `NextConfigRuntime` Pick type in `config-shared.ts`.

## Runtime-Bundle Model

- Runtime bundles are built by `next-runtime.webpack-config.js` (rspack) via `taskfile.js` bundle tasks.
- Bundle selection occurs at runtime in `src/server/route-modules/app-page/module.compiled.js` based on `process.env` vars.
- Variants: `{turbo/webpack} × {experimental/stable/nodestreams/experimental-nodestreams} × {dev/prod}` = up to 16 bundles per route type.
- `define-env.ts` affects user bundling, not pre-compiled runtime internals.
- `process.env.X` checks in `app-render.tsx` are either replaced by DefinePlugin at runtime-bundle-build time, or read as actual env vars at server startup. They are NOT affected by the user's defines from `define-env.ts`.
- **Gotcha**: DefinePlugin entries in `next-runtime.webpack-config.js` must be scoped to the correct `bundleType` (e.g. `app` only, not `server`) to avoid replacing assignment targets in `next-server.ts`.

## Related Skills

- `$dce-edge` - DCE-safe require patterns and edge constraints
- `$react-vendoring` - entry-base boundaries and vendored React
- `$runtime-debug` - reproduction and verification workflow
