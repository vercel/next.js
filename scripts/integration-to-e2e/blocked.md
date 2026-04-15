# Blocked Integration Test Suites

These suites cannot be automatically converted to the `nextTestSetup()` e2e format due to architectural incompatibilities.

## Blockers by Category

### External HTTP Server Required

No remaining suites in this category.

> **Converted from this category:** `api-body-parser` (via `startCommand: 'node server.js'`), `app-document-style-fragment` (was just a standard build+start test), `filesystempublicroutes` (via `startCommand: 'node server.js'`), `image-optimizer` → `test/e2e/image-optimizer/` (refactored shared `runTests`/`setupTests` to use `nextTestSetup`, external slow-image server kept as auxiliary)

### Per-Test App Lifecycle Management

No remaining suites in this category.

### Custom Server API

No remaining suites in this category.

> **Converted from this category:** `custom-server` → `test/e2e/custom-server/` (via `startCommand: 'node server.js'` with HTTP/HTTPS variants, legacy methods, HMR), `ondemand` → `test/development/ondemand/` (via `startCommand: 'node server.js'`, webpack-only)

### CLI Testing (Not Server Tests)

| Suite                  | Reason                                                       |
| ---------------------- | ------------------------------------------------------------ |
| `test/integration/cli` | Large CLI matrix: signals, help, dev/start/build/export/info |

### No Test Files

These directories contain only shared fixtures, no test files:

- `test/integration/bundle-size-profiling`
- `test/integration/css-fixtures`
- `test/integration/scss`

### Converted (formerly score-10 build-only / build-artifact inspection)

These 27 suites were originally scored 10 by the ranker (assumed to need a running server), but converted using `skipStart: true` + `next.build()`:

- `app-dynamic-error`, `app-types`, `build-trace-extra-entries`, `build-trace-extra-entries-monorepo`, `build-trace-extra-entries-turbo`
- `config-promise-error`, `config-syntax-error`, `config-validation`, `conflicting-ssg-paths`
- `cpu-profiling`, `css-customization`, `custom-server-types`
- `error-plugin-stack-overflow`, `json-serialize-original-error`
- `middleware-build-errors`, `mixed-ssg-serverprops-error`, `non-next-dist-exclude`
- `tsconfig-verifier`, `turborepo-access-trace`, `turbotrace-with-webpack-worker`
- `typeof-window-replace`, `typescript-custom-tsconfig`, `typescript-filtered-files`, `typescript-ignore-errors`
- `webpack-bun-externals`, `webpack-config-extensionalias`, `webpack-config-mainjs`

### Converted (formerly blocked custom server / programmatic API)

- `custom-server` → `test/e2e/custom-server/` (via `startCommand: 'node server.js'`, HTTP/HTTPS, legacy methods, HMR)
- `api-body-parser` → `test/e2e/api-body-parser/` (via `startCommand: 'node server.js'`)
- `app-document-style-fragment` → `test/production/app-document-style-fragment/` (was just a standard build+start)
- `filesystempublicroutes` → `test/e2e/filesystempublicroutes/` (via `startCommand: 'node server.js'`)
- `ondemand` → `test/development/ondemand/` (via `startCommand: 'node server.js'`, webpack-only)

### Converted (formerly blocked per-test lifecycle)

- `build-warnings` → `test/production/build-warnings/`
- `config-experimental-warning` → `test/e2e/config-experimental-warning/`
- `data-fetching-errors` → `test/e2e/data-fetching-errors/`
- `edge-runtime-configurable-guards` → `test/e2e/edge-runtime-configurable-guards/`
- `edge-runtime-module-errors` → `test/e2e/edge-runtime-module-errors/`
- `non-standard-node-env-warning` → `test/e2e/non-standard-node-env-warning/`
- `react-current-version` → `test/e2e/react-current-version/`

### Converted (formerly score-10 programmatic server / external server / CLI)

- `fetch-polyfill` → `test/e2e/fetch-polyfill/`
- `fetch-polyfill-ky-universal` → `test/e2e/fetch-polyfill-ky-universal/`
- `next-dynamic` → `test/e2e/next-dynamic/`
- `next-dynamic-lazy-compilation` → `test/e2e/next-dynamic-lazy-compilation/`
- `page-extensions` → `test/production/page-extensions/`
- `port-env-var` → `test/e2e/port-env-var/`
- `production-config` → `test/production/production-config/`
- `query-with-encoding` → `test/production/query-with-encoding/`
- `render-error-on-module-error` → `test/production/render-error-on-module-error/`
- `render-error-on-top-level-error` → `test/production/render-error-on-top-level-error/`
- `route-load-cancel` → `test/e2e/route-load-cancel/`

### Converted (final batch — remaining score 3-10)

- `config` → `test/development/config/` (dev-only, custom config options)
- `config-resolve-alias` → `test/production/config-resolve-alias/` (webpack-only, build assertion)
- `production-build-dir` → `test/production/production-build-dir/` (custom `distDir`)
- `production-start-no-build` → `test/production/production-start-no-build/` (start-without-build error)
- `route-load-cancel-css` → `test/production/route-load-cancel-css/` (prod-only, route cancellation with CSS)
- `trailing-slashes-rewrite` → `test/e2e/trailing-slashes-rewrite/` (external proxy + Next.js)
- `script-loader` → `test/e2e/script-loader/` (next/script component)
- `dynamic-routing` → `test/e2e/dynamic-routing/` (pages router mega-suite, 78 tests; shared.ts extracted for reuse)
- `dynamic-routing` (middleware variant) → `test/e2e/dynamic-routing-middleware/` (reuses shared.ts, patches in middleware.js via `skipStart` + `patchFile` + `start`)
- `css-modules` → `test/development/css-modules/` + `test/production/css-modules/` (dev HMR + prod CSS snapshots)
- `css` → `test/development/css-features/` + `test/e2e/css-features/` + `test/production/css-features/` (7 original test files split across dev/e2e/prod)
- `create-next-app` → `test/production/create-next-app/` (moved from integration; `tryNextDev` refactored to use `createNext` from `e2e-utils`)

## Summary

| Category                          | Count   |
| --------------------------------- | ------- |
| Converted (Phase 1, score 1-3)    | 102     |
| Converted (Phase 2, score 4-6)    | 75      |
| Converted (Phase 3, score 7-9)    | 5       |
| Converted (large multi-fixture)   | 4       |
| Converted (external HTTP proxy)   | 6       |
| Converted (output:export / mixed) | 21      |
| Converted (i18n-support)          | 2       |
| Converted (build-only score-10)   | 27      |
| Converted (custom server / API)   | 5       |
| Converted (image-optimizer)       | 1       |
| Converted (per-test lifecycle)    | 7       |
| Converted (score-10 server/CLI)   | 11      |
| Converted (final batch)           | 7       |
| **Total converted**               | **273** |
| Blocked (CLI testing)             | 1       |
| No test files                     | 3       |
| **Total remaining**               | **4**   |
| **Grand total**                   | **277** |
