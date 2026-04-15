# Blocked Integration Test Suites

These suites cannot be automatically converted to the `nextTestSetup()` e2e format due to architectural incompatibilities.

## Blockers by Category

### External HTTP Server Required

These tests spin up auxiliary HTTP servers (proxies, CDN simulators, external APIs) alongside the Next.js server.

| Suite                                     | Reason                                                         |
| ----------------------------------------- | -------------------------------------------------------------- |
| `test/integration/filesystempublicroutes` | Custom server via `initNextServerScript(server.js)`            |
| `test/integration/i18n-support`           | External HTTP server + massive shared test runner (3772 lines) |
| `test/integration/i18n-support-base-path` | External HTTP server + shared test runner from i18n-support    |
| `test/integration/image-optimizer`        | External HTTP server + shared test runner + custom server API  |

### Per-Test App Lifecycle Management

These tests start/stop the Next.js server multiple times within a single test file, often with different configurations.

| Suite                                               | Reason                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| `test/integration/build-warnings`                   | Per-build env vars (`CI`, `NOW_BUILDER`), sequential builds with cache     |
| `test/integration/config-experimental-warning`      | Different `next.config.js` per test with separate app lifecycle            |
| `test/integration/data-fetching-errors`             | Per-test page content + fresh dev server                                   |
| `test/integration/edge-runtime-configurable-guards` | Per-test file write + app restart via beforeEach/afterEach                 |
| `test/integration/edge-runtime-module-errors`       | Shared context with `File` instances, per-test lifecycle via describe.each |
| `test/integration/non-standard-node-env-warning`    | Each test requires different `NODE_ENV` value                              |
| `test/integration/react-current-version`            | Uses `runDevSuite`/`runProdSuite` shared runner + `File.replace`/`restore` |

### Custom Server API

These tests use `initNextServerScript()` or programmatic Next.js server APIs.

| Suite                            | Reason                                                                     |
| -------------------------------- | -------------------------------------------------------------------------- |
| `test/integration/custom-server` | Custom `server.js`, HTTPS, programmatic APIs (`renderToHTML`, `render404`) |
| `test/integration/ondemand`      | Custom server + webpack-specific on-demand entries (Turbopack-skipped)     |

### CLI Testing (Not Server Tests)

These test CLI tools directly, not server behavior.

| Suite                              | Reason                                                  |
| ---------------------------------- | ------------------------------------------------------- |
| `test/integration/create-next-app` | Spawns `create-next-app` binary, checks generated files |

#### Converted (formerly blocked)

| Suite                                                      | Converted to                                                                                                                                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/integration/css`                                     | `test/production/css-features/{valid-invalid-css,basic-global-support,css-compilation,css-rendering}.test.ts`, `test/e2e/css-features/css-and-styled-jsx.test.ts`, `test/development/css-features/dev-css-handling.test.ts` |
| `test/integration/css-modules`                             | `test/production/css-features/{css-modules-support,css-modules-ordering}.test.ts`, `test/e2e/css-features/css-modules-ordering.test.ts`, `test/development/css-features/css-modules-support.test.ts`                        |
| `test/integration/next-image-new` (39 of 39 test files)    | `test/e2e/next-image-new/...`, `test/development/next-image-new/...`, `test/production/next-image-new/...`                                                                                                                  |
| `test/integration/next-image-legacy` (15 of 15 test files) | `test/e2e/next-image-legacy/...`, `test/production/next-image-legacy/...`                                                                                                                                                   |
| `test/integration/css-client-nav`                          | `test/e2e/css-client-nav/css-client-nav.test.ts`                                                                                                                                                                            |
| `test/integration/custom-routes-i18n`                      | `test/e2e/custom-routes-i18n/custom-routes-i18n.test.ts`                                                                                                                                                                    |
| `test/integration/next-dynamic-css-asset-prefix`           | `test/e2e/next-dynamic-css-asset-prefix/next-dynamic-css-asset-prefix.test.ts`                                                                                                                                              |
| `test/integration/preload-viewport`                        | `test/production/preload-viewport/preload-viewport.test.ts`                                                                                                                                                                 |
| `test/integration/next-image-new/react-virtualized`        | `test/production/next-image-new/react-virtualized/react-virtualized.test.ts`                                                                                                                                                |
| `test/integration/next-image-legacy/react-virtualized`     | `test/production/next-image-legacy/react-virtualized/react-virtualized.test.ts`                                                                                                                                             |
| `test/integration/export-404`                              | `test/production/export-404/export-404.test.ts`                                                                                                                                                                             |
| `test/integration/export-dynamic-pages`                    | `test/production/export-dynamic-pages/export-dynamic-pages.test.ts`                                                                                                                                                         |
| `test/integration/export-fallback-true-error`              | `test/production/export-fallback-true-error/export-fallback-true-error.test.ts`                                                                                                                                             |
| `test/integration/export-getInitialProps-warn`             | `test/production/export-getInitialProps-warn/export-getInitialProps-warn.test.ts`                                                                                                                                           |
| `test/integration/export-image-default`                    | `test/production/export-image-default/export-image-default.test.ts`                                                                                                                                                         |
| `test/integration/export-image-loader`                     | `test/production/export-image-loader/export-image-loader.test.ts`                                                                                                                                                           |
| `test/integration/export-image-loader-legacy`              | `test/production/export-image-loader-legacy/export-image-loader-legacy.test.ts`                                                                                                                                             |
| `test/integration/export-index-not-found-gsp`              | `test/production/export-index-not-found-gsp/export-index-not-found-gsp.test.ts`                                                                                                                                             |
| `test/integration/export-intent`                           | `test/production/export-intent/export-intent.test.ts`                                                                                                                                                                       |
| `test/integration/export-subfolders`                       | `test/production/export-subfolders/export-subfolders.test.ts`                                                                                                                                                               |
| `test/integration/no-op-export`                            | `test/production/no-op-export/no-op-export.test.ts`                                                                                                                                                                         |
| `test/integration/errors-on-output-to-public`              | `test/production/errors-on-output-to-public/errors-on-output-to-public.test.ts`                                                                                                                                             |
| `test/integration/errors-on-output-to-static`              | `test/production/errors-on-output-to-static/errors-on-output-to-static.test.ts`                                                                                                                                             |
| `test/integration/getserversideprops-export-error`         | `test/production/getserversideprops-export-error/getserversideprops-export-error.test.ts`                                                                                                                                   |
| `test/integration/prerender-export`                        | `test/production/prerender-export/prerender-export.test.ts`                                                                                                                                                                 |
| `test/integration/config-output-export`                    | `test/development/config-output-export/config-output-export.test.ts`                                                                                                                                                        |
| `test/integration/middleware-src`                          | `test/e2e/middleware-src/middleware-src.test.ts`                                                                                                                                                                            |
| `test/integration/middleware-src-node`                     | `test/e2e/middleware-src-node/middleware-src-node.test.ts`                                                                                                                                                                  |
| `test/integration/repeated-slashes`                        | `test/e2e/repeated-slashes/repeated-slashes.test.ts`                                                                                                                                                                        |
| `test/integration/api-support`                             | `test/e2e/api-support/api-support.test.ts`                                                                                                                                                                                  |
| `test/integration/custom-routes`                           | `test/e2e/custom-routes/custom-routes.test.ts`                                                                                                                                                                              |
| `test/integration/telemetry` (3 test files)                | `test/e2e/telemetry/{telemetry,config,page-features}.test.ts`                                                                                                                                                               |

### Score-10 (Originally Blocked by Ranker)

49 additional suites were scored 10 by the ranker and excluded from conversion. These typically involve:

- `runNextCommand`/`runNextCommandDev` CLI testing
- Programmatic `nextServer()` API
- Complex multi-config test matrices
- Custom server implementations

See `scripts/integration-to-e2e/ranker-results/all-scores.jsonl` for the full list with per-suite notes.

## Summary

| Category                          | Count   |
| --------------------------------- | ------- |
| Converted (Phase 1, score 1-3)    | 102     |
| Converted (Phase 2, score 4-6)    | 75      |
| Converted (Phase 3, score 7-9)    | 5       |
| Converted (large multi-fixture)   | 4       |
| Converted (external HTTP proxy)   | 6       |
| Converted (output:export / mixed) | 21      |
| **Total converted**               | **213** |
| Blocked (Phase 1-3, score 1-9)    | 11      |
| Blocked (score 10, ranker)        | 49      |
| **Total blocked**                 | **60**  |
| **Grand total**                   | **273** |
