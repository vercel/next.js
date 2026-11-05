# Next testing implementation status

`next test` is an experimental Next-owned compiler and runtime with a supported
subset of Vitest 5.0.4 authoring APIs. It does not declare full Vitest compatibility
or stable release readiness.

Run `next test --capabilities` for current feature and execution-profile support.
The [capability definitions](packages/next/src/experimental/testing/capabilities.ts)
are the maintained source for those facts. Unsupported profiles fail explicitly;
accepting an option or exposing a declaration alone does not establish support.

## Using the implementation

- [Test TypeScript opt-ins](packages/next/experimental/testing/README.md)
- [Installed consumer setup and CI](test/e2e/app-dir/next-testing-package/MIGRATION.md)
- [Editor controls](packages/next/experimental/testing/editor-api.md)
- [RSC route response ownership](packages/next/experimental/testing/rsc-route-rendering.md)
- [File scheduling and CI shards](NEXT_TESTING_SCHEDULING.md)
- [Internal contracts](NEXT_TESTING_CONTRACTS.md)

## Current scope and known gaps

The implementation includes test declarations, lifecycle hooks, fixtures,
assertions, snapshots, mocks and module resets, with Node, RSC and Browser
execution in their supported profiles. These features do not imply every API,
syntax, configuration, module graph or environment combination is compatible.

Remaining work includes broader fixture/concurrency/timeout and module-graph
combinations; Browser frame, error-stack, provider and action-promise behavior;
additional route/layout/cache/PPR and Server Action fidelity; and advanced pool,
sequencer, debugger, editor and typecheck controls.

Known failures remain in reporter Proxy/provider continuation, shared task-log
watch qualification and Browser action promise-matcher interoperability. The
empty-watch profile has not completed qualification. Coverage retains its existing
profile/mapping/provider limitations, including the nested-imported CommonJS
omitted-entry failure. Historical acceptance results are not an all-green current
release result.

## Maintenance and release qualification

The maintained fixture baseline is Node 20.9.0. Regression tests use focused
behavioral assertions and retain small exact snapshots, output formats and source
maps where those values are the behavior. Retired whole-report and descriptor
captures are no longer maintained compatibility guarantees.

Changes require focused verification and the repository build/type/style checks.
Those checks do not replace coherent full acceptance, installed-package,
downstream, platform/browser/CI, cleanup-stress or production-omission qualification.
Linux qualification and performance benchmarking remain deferred.

The [stable release requirements](NEXT_TESTING_STABLE_RELEASE.md) describe
graduation beyond the experiment. The current implementation does not claim that
all of those requirements have been satisfied.
