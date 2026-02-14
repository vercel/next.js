# Next.js Test Coverage Analysis

## Executive Summary

The Next.js monorepo contains approximately **1,771 test files** across ~1,607 in the central `test/` directory and ~164 co-located within packages. While the overall volume of tests is large, **unit test coverage of core source code is critically low at ~9.2%** (91 of 993 core source files). The test suite is heavily weighted toward end-to-end and integration tests, which are valuable but leave significant gaps in fast, isolated testing of individual modules.

---

## Current Test Inventory

| Category | Test Files | Location |
|----------|-----------|----------|
| E2E | 792 | `test/e2e/` |
| Integration | 347 | `test/integration/` |
| Development | 213 | `test/development/` |
| Production | 160 | `test/production/` |
| Unit | 95 | `test/unit/` |
| Co-located (packages) | 164 | `packages/*/src/` |
| **Total** | **~1,771** | |

---

## Area 1: Build Pipeline (3.2% unit coverage — CRITICAL)

**251 source files, only 8 have unit tests.**

The build system at `packages/next/src/build/` is one of the most complex parts of the codebase and has the worst unit test coverage of any major subsystem.

### Specific gaps

| Module | Files | Tested | Coverage |
|--------|-------|--------|----------|
| `build/webpack/` (config, loaders, plugins) | 138 | 2 | 1.4% |
| `build/babel/` (loaders, plugins, preset) | 14 | 0 | **0%** |
| `build/output/` (build output formatting) | 4 | 0 | **0%** |
| `build/manifests/` (route/prerender manifests) | 18 | 0 | **0%** |

### Key untested files

- `build/index.ts` — main build entry point
- `build/compiler.ts` — bundler orchestration
- `build/entries.ts` — entry point generation
- `build/handle-externals.ts` — external dependency handling
- `build/generate-routes-manifest.ts` — routes manifest generation
- `build/webpack/config.ts` — main webpack configuration builder
- All 14 Babel files (loaders, plugins, preset) — **zero tests**
- 71 webpack loaders — nearly all untested
- 45 webpack plugins — nearly all untested

### Recommended improvements

1. **Babel plugins** — Add unit tests for each transform in `build/babel/plugins/` (`commonjs.ts`, `jsx-pragma.ts`, `next-page-config.ts`, `next-ssg-transform.ts`, `optimize-hook-destructuring.ts`, `react-loadable-plugin.ts`). These are pure AST transforms that are straightforward to test with fixture inputs/outputs.
2. **Webpack loaders** — The custom loaders (`next-app-loader`, `next-route-loader`, `next-flight-loader`, `next-edge-ssr-loader`, `next-font-loader`) transform source code and are testable in isolation with mock loader contexts.
3. **Manifest generation** — `generate-routes-manifest.ts` and related files produce JSON manifests that are easy to snapshot-test given known route configurations.
4. **Build output** — `build/output/` formats build results for the CLI; these are pure functions suitable for unit testing.

---

## Area 2: Server-Side Rendering Engine (5.5% coverage in app-render — CRITICAL)

**`packages/next/src/server/` has 446 source files with only 62 tested (13.9%).**

The App Router rendering engine (`server/app-render/`) is arguably the most critical code path in Next.js and has very thin unit coverage.

### Specific gaps

| Module | Files | Tested | Coverage |
|--------|-------|--------|----------|
| `server/app-render/` | 73 | 4 | 5.5% |
| `server/route-modules/` | 62 | 1 | 1.6% |
| `server/lib/` | 84 | 16 | 19% |
| `server/web/` | 36 | 0 | **0%** |
| `server/normalizers/` | 30 | 5 | 16.7% |

### Key untested files

- `server/app-render/app-render.tsx` — main React rendering function
- `server/app-render/create-component-tree.tsx` — component tree generation
- `server/app-render/app-render-scheduling.ts` — async rendering scheduling
- `server/app-render/encryption.ts` — server action encryption
- `server/route-modules/app-page/module.ts` — App page route handler
- `server/route-modules/app-route/module.ts` — App API route handler
- `server/route-modules/pages/module.ts` — Pages router handler
- `server/lib/router-server.ts` — core router server
- `server/lib/edge-request-handler.ts` — edge runtime request handling
- `server/web/` — entire web runtime directory (36 files, 0 tests)

### Recommended improvements

1. **Route modules** — Each route module type (`app-page`, `app-route`, `pages`, `pages-api`) should have unit tests that validate request handling, response construction, and error paths without needing a full server.
2. **Server utilities** — `server/lib/` contains many pure utility functions (path helpers, cache controls, etag generation) that are prime candidates for fast unit tests.
3. **Web runtime** — `server/web/` (36 files) handles Web API responses and has zero unit tests. Functions like `NextResponse` helpers and web-specific routing can be tested against the Web API spec.
4. **Encryption and CSRF** — `app-render/encryption.ts` and `app-render/csrf-protection.ts` are security-critical and should have dedicated tests covering edge cases.

---

## Area 3: Client-Side Runtime (5.2% coverage — HIGH)

**172 source files, only 9 have unit tests.**

### Specific gaps

| Module | Files | Tested | Coverage |
|--------|-------|--------|----------|
| `client/components/` | 95 | 8 | 8.4% |
| `client/app-dir/` | 3 | 0 | **0%** |
| `client/dev/` | 15 | 0 | **0%** |

### Key untested files

- `client/components/app-router.tsx` — main App Router component
- `client/components/layout-router.tsx` — layout rendering
- `client/components/error-boundary.tsx` — error boundary handling
- `client/components/not-found-boundary.tsx` — 404 boundary
- `client/app-dir/link.tsx` — the `<Link>` component (App Router version)
- `client/app-dir/form.tsx` — the `<Form>` component
- All 15 files in `client/dev/` — dev-mode client features

### Recommended improvements

1. **Router reducer** — The router reducer already has ~60% test coverage. Expand this to cover edge cases in navigation, prefetching, and cache invalidation.
2. **Error boundaries** — `error-boundary.tsx`, `not-found-boundary.tsx`, and the `global-error` components handle critical user-facing error states and should have unit tests for different error scenarios.
3. **Link and Form components** — These are among the most-used public APIs. Unit tests (using React Testing Library or similar) would complement existing e2e coverage with faster feedback.

---

## Area 4: Packages Without Any Tests (0% — HIGH)

Eight published packages have zero test files:

| Package | Purpose | Risk |
|---------|---------|------|
| `next-env` | `.env` file loading | Medium — environment loading bugs are hard to debug |
| `next-mdx` | MDX integration | Medium — integration point for documentation sites |
| `next-bundle-analyzer` | Bundle analysis wrapper | Low — thin wrapper |
| `react-refresh-utils` | React Fast Refresh runtime | High — affects development experience |
| `next-plugin-storybook` | Storybook integration | Low — plugin configuration |
| `next-polyfill-module` | Module polyfills | Low — static polyfills |
| `next-polyfill-nomodule` | No-module polyfills | Low — static polyfills |
| `next-rspack` | Rspack integration | Medium — growing in importance |

### Recommended improvements

1. **`react-refresh-utils`** — This package directly affects the developer experience of every Next.js user. Add unit tests for the refresh runtime utilities.
2. **`next-env`** — Test `.env`, `.env.local`, `.env.development`, `.env.production` loading, variable precedence, and expansion.
3. **`next-rspack`** — As Rspack integration grows, this should have unit tests covering the wrapper API.
4. **`next-mdx`** — Test the MDX plugin configuration and loader integration.

---

## Area 5: Third-Party Integrations (MINIMAL)

`packages/third-parties/` provides integrations for Google Analytics, Google Tag Manager, YouTube embeds, and Google Maps, but has only **2 e2e tests** and **zero unit tests**.

### Recommended improvements

- Add unit tests for each provider module to verify correct script generation, attribute handling, and error cases.
- Test SSR output for each integration to catch hydration mismatches.

---

## Area 6: E2E Coverage Gaps for Key Features

While e2e test coverage is generally strong (792 tests), several important features have thin or missing coverage:

### Features with thin e2e coverage

| Feature | Current Coverage | Gap |
|---------|-----------------|-----|
| ISR (Incremental Static Regeneration) | Indirect only via revalidate tests | No dedicated ISR lifecycle tests |
| File uploads / streaming uploads | None | No upload handling tests |
| WebSocket / real-time | 1 test (`socket-io`) | Minimal coverage |
| Compression / content encoding | None in e2e | Only in integration |
| CORS | 1 development test | No e2e coverage |
| Custom server | 1 production test | Minimal |
| OpenTelemetry | 1 e2e test | Single suite for full observability API |
| Environment variables | None dedicated | Tested only indirectly |
| `generateStaticParams` | Indirect only | No dedicated validation of static param generation |

### Recommended improvements

1. **ISR lifecycle** — Add e2e tests that verify the full ISR flow: initial static generation, stale serving, background revalidation, and cache update. This is a core feature with no dedicated test suite.
2. **`generateStaticParams`** — Add tests specifically validating static param generation for different route patterns, including edge cases like empty params, very large param sets, and params with special characters.
3. **Environment variables** — Add tests for `.env` file loading in different modes (dev, build, start), variable precedence, and `NEXT_PUBLIC_` prefix behavior.

---

## Area 7: Lib Utilities (9.7% coverage)

**124 source files, only 12 have unit tests.**

### Key gaps

| Module | Files | Tested | Notes |
|--------|-------|--------|-------|
| `lib/metadata/` | 42 | 6 | Only resolvers partially tested |
| `lib/helpers/` | 6 | 0 | Package manager helpers untested |
| `lib/memory/` | 4 | 0 | GC observer, startup/shutdown untested |
| `lib/fs/` | 2 | 0 | Atomic file write untested |

### Recommended improvements

1. **Metadata generation** — `lib/metadata/generate/` (basic.tsx, alternate.tsx, icons.tsx, opengraph.tsx) produces HTML meta tags. These are pure render functions and ideal for unit testing with snapshot assertions.
2. **Helper utilities** — `lib/helpers/` contains package manager detection and port helpers. These are isolated utilities that should have unit tests.
3. **File system utilities** — `lib/fs/` includes atomic write operations that could corrupt files on failure. Unit tests with mock file systems would verify correctness.

---

## Priority Ranking

Based on risk, code complexity, and test gap severity:

| Priority | Area | Impact | Effort |
|----------|------|--------|--------|
| **P0** | Build pipeline Babel plugins (0% coverage) | Incorrect transforms silently break user code | Low — pure AST transforms are easy to test |
| **P0** | Server route modules (1.6% coverage) | Request handling bugs affect every page load | Medium — need mock request/response objects |
| **P1** | Server app-render (5.5% coverage) | Rendering bugs cause blank pages or hydration errors | High — complex async rendering |
| **P1** | Packages with 0% coverage (react-refresh-utils, next-env) | Developer experience and configuration bugs | Low — small packages |
| **P1** | Build webpack loaders (1.4% coverage) | Loader bugs cause build failures or incorrect output | Medium — need mock loader contexts |
| **P2** | Client components (8.4% coverage) | Router and error boundary bugs affect navigation | Medium — need React test setup |
| **P2** | ISR e2e tests (indirect only) | Core feature with no dedicated test suite | Medium — need cache lifecycle assertions |
| **P2** | Third-parties unit tests (0% coverage) | Integration bugs for GA/GTM/YouTube | Low — output verification tests |
| **P3** | Lib metadata generation (14% coverage) | Incorrect meta tags affect SEO | Low — snapshot tests |
| **P3** | Server web runtime (0% coverage) | Web API response bugs | Medium — need Web API mocks |
