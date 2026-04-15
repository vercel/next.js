# Blocked Integration Test Suites

These suites cannot be automatically converted to the `nextTestSetup()` e2e format due to architectural incompatibilities.

## Blockers by Category

### External HTTP Server Required

These tests spin up auxiliary HTTP servers (proxies, CDN simulators, external APIs) alongside the Next.js server.

| Suite                                     | Reason                                                        |
| ----------------------------------------- | ------------------------------------------------------------- |
| `test/integration/filesystempublicroutes` | Custom server via `initNextServerScript(server.js)`           |
| `test/integration/image-optimizer`        | External HTTP server + shared test runner + custom server API |

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

### Score-10 (Originally Blocked by Ranker)

22 additional suites were scored 10 by the ranker and excluded from conversion. These typically involve:

- `runNextCommand`/`runNextCommandDev` CLI testing
- Programmatic `nextServer()` API
- Complex multi-config test matrices
- Custom server implementations

See `scripts/integration-to-e2e/ranker-results/all-scores.jsonl` for the full list with per-suite notes.

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
| **Total converted**               | **242** |
| Blocked (Phase 1-3, score 1-9)    | 12      |
| Blocked (score 10, ranker)        | 22      |
| No test files                     | 1       |
| **Total blocked**                 | **35**  |
| **Grand total**                   | **277** |
