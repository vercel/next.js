# Blocked Integration Test Suites

These suites cannot be automatically converted to the `nextTestSetup()` e2e format due to architectural incompatibilities.

## Blockers by Category

### External HTTP Server Required

These tests spin up auxiliary HTTP servers (proxies, CDN simulators, external APIs) alongside the Next.js server.

| Suite                                            | Reason                                                         |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `test/integration/css-client-nav`                | HTTP proxy to stall CSS requests for timeout testing           |
| `test/integration/custom-routes-i18n`            | External HTTP server as rewrite destination                    |
| `test/integration/filesystempublicroutes`        | Custom server via `initNextServerScript(server.js)`            |
| `test/integration/i18n-support`                  | External HTTP server + massive shared test runner (3772 lines) |
| `test/integration/i18n-support-base-path`        | External HTTP server + shared test runner from i18n-support    |
| `test/integration/image-optimizer`               | External HTTP server + shared test runner + custom server API  |
| `test/integration/next-dynamic-css-asset-prefix` | External HTTP proxy (CDN simulator)                            |
| `test/integration/preload-viewport`              | External HTTP proxy (`http-proxy`) to intercept/stall requests |

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

### Large Multi-Fixture Suites

These suites use dozens of separate fixture directories, making 1:1 conversion impractical.

| Suite                                | Fixture dirs | Reason                           |
| ------------------------------------ | ------------ | -------------------------------- |
| `test/integration/next-image-legacy` | 14           | 15 test files, 101 fixture files |
| `test/integration/next-image-new`    | 20+          | 24 test files, 202 fixture files |

#### Converted (formerly blocked)

| Suite                          | Converted to                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/integration/css`         | `test/production/css-features/{valid-invalid-css,basic-global-support,css-compilation,css-rendering}.test.ts`, `test/e2e/css-features/css-and-styled-jsx.test.ts`, `test/development/css-features/dev-css-handling.test.ts` |
| `test/integration/css-modules` | `test/production/css-features/{css-modules-support,css-modules-ordering}.test.ts`, `test/e2e/css-features/css-modules-ordering.test.ts`, `test/development/css-features/css-modules-support.test.ts`                        |

### Score-10 (Originally Blocked by Ranker)

70 additional suites were scored 10 by the ranker and excluded from conversion. These typically involve:

- `runNextCommand`/`runNextCommandDev` CLI testing
- Programmatic `nextServer()` API
- `output: 'export'` static export without server
- Complex multi-config test matrices
- Custom server implementations

See `scripts/integration-to-e2e/ranker-results/all-scores.jsonl` for the full list with per-suite notes.

### No Test Files

These directories contain only fixtures, no test files:

- `test/integration/bundle-size-profiling`
- `test/integration/css-fixtures`
- `test/integration/scss`

## Summary

| Category                        | Count   |
| ------------------------------- | ------- |
| Converted (Phase 1, score 1-3)  | 102     |
| Converted (Phase 2, score 4-6)  | 75      |
| Converted (Phase 3, score 7-9)  | 5       |
| Converted (large multi-fixture) | 2       |
| **Total converted**             | **184** |
| Blocked (Phase 1-3, score 1-9)  | 15      |
| Blocked (score 10, ranker)      | 70      |
| No test files                   | 3       |
| **Total blocked**               | **88**  |
| **Grand total**                 | **275** |
