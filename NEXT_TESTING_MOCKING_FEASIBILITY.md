# Module mocking: bounded feasibility handoff

Workstream G; base `602a2aba900e45fb2edd694f463f435430678e1f`.
Worktree: `/Users/timneutkens/.codex/worktrees/802a/next.js-2`.
Status: coordinator accepted the private registry boundary. Registry implementation
and 12 component tests pass; A explicitly defers its compiler bridge. No integrated
module mocking capability is implemented or advertised.

## Findings

- `turbopack/crates/turbopack-ecmascript-runtime/js/src/shared/runtime/runtime-utils.ts:467`
  implements synchronous `esmImport` using the emitted module ID. Adding a map here
  cannot by itself await an asynchronous factory or hoist its registration.
- `turbopack/crates/turbopack-ecmascript-runtime/js/src/nodejs/runtime/build-base.ts:32`
  creates and caches a module before invoking its factory. Its parent lookup at
  line 75 reuses that cache. Replacing exports after evaluation is too late to
  prevent subject side effects and does not establish cycle semantics.
- `turbopack/crates/turbopack-ecmascript/src/references/esm/base.rs` represents
  export/evaluation module parts and selects referenced parts. A replacement must
  be visible to the graph before export optimization; intercepting only whole-file
  runtime IDs cannot establish production correctness.
- `turbopack/crates/turbopack-ecmascript-runtime/js/src/shared-node/base-externals-utils.ts`
  has separate external import/require paths. Internal module interception does not
  imply external or native-module support.
- The read-only Vitest reference implements hoisting in
  `packages/mocker/src/node/hoistMocksPlugin.ts`, manual factory validation/cache in
  `packages/mocker/src/registry.ts`, and original resolution in
  `packages/vitest/src/runtime/moduleRunner/moduleMocker.ts:128`. These are semantic
  references, not runtime dependencies. The reference `vi.resetModules` contract
  explicitly retains mock registrations and cannot reevaluate existing top-level
  imports (`packages/vitest/src/integrations/vi.ts:455`).

## Proposed minimum producer boundary

A owns compilation and emits a test-only graph bridge, rather than rewriting
already-emitted imports. Its requirements are:

1. Recognize the supported literal factory declaration and register it before
   subject dependencies evaluate, preserving declaration order. Preserve source
   mapping and reject unsupported captures/hoisted forms explicitly.
2. Resolve the target from the actual importing module and its Next compilation
   context. Produce an opaque target key incorporating layer/context identity;
   neither G nor C resolves a raw path using Node or invents an alias table.
3. Keep the original compiled target available. Supply a realm-local original
   import function that bypasses substitution for this target, while retaining
   substitutions on its dependencies. Never toggle a global bypass flag.
4. Represent the substituted module through the graph's async machinery so the
   factory settles before consumers execute. Preserve all required export edges
   and validate requested exports. Unmocked edges retain normal compilation.
5. Include mock dependencies/variant identity in revision invalidation and report
   substitutions separately from the inherited profile. Reject unsupported
   cycles, transitions, externals and framework-internal targets before execution.

G implements private realm-local `MockRegistry` in
`packages/next/src/experimental/testing/mocking/registry.ts`: register an opaque target key,
factory and original-import callback; resolve once per registration; dispose at
file teardown. Concurrent consumers share the same in-flight result. Factories
must return a non-null, non-array exports object. Missing requested exports throw
clear errors; factory errors preserve their cause. Disposal prevents late work
from populating a later registry. No closure crosses IPC.

B creates/disposes this registry with the file realm. A fresh registry plus fresh
emitted-runtime realm is the first isolation guarantee. Clearing the registry
alone is not a module reset. C owns compatibility exports and must keep module
mock APIs unsupported until the compiler bridge and conformance checks exist.

## Graph variants versus runtime indirection

Graph variants express replacement and original identity before optimization and
give invalidation explicit dependencies, but can multiply compiled work. Runtime
indirection can share more compilation and factory machinery, but must still be
represented in the graph to preserve exports, async propagation and original
access. Neither is a standalone TypeScript registry solution. Prefer a narrow
graph-owned mock bridge for the first factory; leave the final implementation
choice to A. No performance claim is possible before a real compiler prototype.

## First verification increment

Generate `next-testing-mocking` unit tests for registry behavior only after the
boundary is accepted. Verify one factory, asynchronous deduplication, partial
exports through original import, errors and two isolated registries. These are
component tests, not evidence that Turbopack honors a mock declaration.

The integration gate then requires actual Next-compiled fixtures in development
and production: factory registration before subject side effects; original import
preserves the real target and mocked dependencies; aliases/importer conditions
identify the correct target; identical specifiers in separate layers cannot
collide; a second file sees original state; and an unmocked oracle matches the
normal application. Compiler tests must prove unsupported patterns fail rather
than silently executing originals. Mocked results cannot certify deployment
artifact behavior.

Initially gate automock, `spy: true`, dynamic reconfiguration/`doMock`, cycles
through mocks, mutable live bindings, cross-layer substitutions, external/native
modules, and `vi.resetModules`. Static factory support is itself gated until the
real graph bridge exists. Never replace Client/Server references with plain
functions or mock React/Flight/AsyncLocalStorage internals in fidelity suites.

## Outstanding dependencies

- A: provide compiler-resolved identities, declaration ordering, async bridge,
  original-target access and rejection diagnostics.
- B: establish file-realm registry ownership and disposal in emitted bootstrap.
- C: route supported authoring calls through compiler-provided context; gate
  unsupported calls in the Vitest facade.

## Implementation and validation

`MockRegistry` exposes `register(targetKey, factory, importOriginal)`,
`resolve(targetKey)`, `readExport(targetKey, name)` and idempotent `dispose()`.
Registration closes on the first resolution; before that, later registrations
replace earlier ones. Factories share one promise, including failures. Disposal
rejects unfinished results and original-import callbacks; it does not cancel
arbitrary user work, which remains the worker owner's responsibility.

The generated suite is
`test/unit/app-dir/next-testing-mocking/next-testing-mocking.test.ts`.
All 12 tests passed with `pnpm exec jest --runInBand --runTestsByPath` targeting
that file. Tests use explicitly supplied identities/import callbacks, so they
establish registry behavior only, not compiler resolution or original-import
fidelity. Focused ESLint and Prettier passed.

`pnpm new-test --args true next-testing-mocking unit` stalled while finding its
generator. Running the cached matching `@turbo/gen` 2.9.4 CLI with the same
arguments generated the fixture scaffold successfully. The repository contains
no unit test template, so the test body was added to that generated directory.

The watch build was started before source edits. After supplying a root tooling
dependency symlink, it reached compilation but reported missing
`source-map-loader` in this fresh worktree. It was stopped. No full build or
compiler/runtime integration is validated by this increment.

`pnpm typescript` completed with exit 2: missing per-package dependencies and
unrelated existing/generated type diagnostics; none reference the registry or
its tests. The saved checkout resolves `fast-glob`, `dotenv`, `@playwright/test`
and `source-map-loader` from their owning packages, while this worktree does not.
This is not a passing repository-wide type check.
