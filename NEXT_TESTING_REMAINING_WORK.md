# Next testing: remaining implementation work

Baseline: [PR #98869](https://github.com/vercel/next.js/pull/98869) at `3371432a55`, updated October 13, 2026. This includes parallel execution and CI sharding, expanded declarations/lifecycle/fixtures, assertions and snapshots, module mocking, and live terminal redraw with interactive commands. Earlier stage plans describe historical milestones; their deferred-work lists can include capabilities that have since landed. Workstream numbers below are retained for existing task references.

Next continues to own compilation, execution, isolation, rendering, and resource cleanup. Vitest-compatible authoring is the compatibility target. New capabilities must use the actual Next compiler and runtime and have a clearly advertised support boundary.

## Implemented baseline

- Development and production Node tests, route-less RSC tests, and Node browser drivers using real Next applications.
- Ordered setup, parameterized tests and suites (`each`/`for`), declaration options, expected failures, retries/repeats, suite-scoped fixture overrides, source-mapped failures, and browser artifacts.
- Soft and polling assertions, custom snapshot serializers, attempt-scoped global/environment stubs, and a bounded fake-timer API.
- External, inline, and file snapshot APIs, with explicit one-shot updates across development/production Node, RSC, and browser profiles; the watch `u` command remains development Node/RSC only. Parent-owned writes require successful cleanup and inline updates check source revisions. End-to-end inline update validation remains a follow-up below.
- Compiler-transformed static factory mocks for development Node specs with ordered setup files, typed literal import targets, partial factories, and live inherited ESM exports.
- Bounded one-shot Node/RSC file execution (`--max-workers`, default 1, range 1–64), deterministic CI sharding (`--shard INDEX/COUNT`), and mixed development/production Node/RSC projects with isolated, serialized compiler profiles. Browser files remain serial.
- Development Chromium mounting of registered standalone component fixtures, including SSR and client-boundary hydration.
- Development Node/RSC watch, live terminal redraw, keyboard commands, filename/project/test-name filtering, and cancellation.
- Initial one-shot development Node line coverage, plus public package exports and clean external-consumer checks.

These capabilities have focused tests and prior integration coverage. The current PR head still needs complete build, type, and native CLI acceptance validation; implementation status does not establish release readiness. Remaining work extends the supported boundaries and strengthens that evidence.

## Remaining workstreams

### 1. Incremental compilation and affected-test selection

**Current limit:** Watch starts fresh compilation/execution generations and conservatively reruns the selected files. The selection contract exists, but emitted-output evidence is explicitly incomplete.

**Approach:** Produce trustworthy input-to-test dependencies in the compiler, connect them to watch scheduling, and retain reusable compilation across generations. Cover setup, configuration, mock graphs, unresolved imports, assets, and application routes. Keep evaluated application state isolated and widen selection whenever evidence is incomplete.

**Acceptance:** Incremental results agree with full runs across source/configuration edits, added and deleted files, and rapid cancellation. Measured warm reruns improve without leaking state or losing tests.

**Coordination:** One compiler owner and one watch owner; agree revision and invalidation contracts before implementation.

### 2. Scheduling extensions beyond the implemented parallel execution and CI sharding

**Implemented:** Bounded one-shot file workers, deterministic disjoint shards, mixed development/production Node/RSC selections, shared-output exclusion, supervised cancellation/cleanup, and aggregate reporting are in the PR.

**Current limit:** Watch rejects sharding and worker limits above 1. Browser files and compiler profiles run serially; mixed-mode browser selections are unsupported. Worker limits bound active file lifetimes, not native compilation CPU or memory. Shards require separate checkouts/output directories, and cross-shard report merging is absent. Concurrent cases within one file remain a separate authoring capability.

**Approach:** Build on the existing scheduler for watch integration, browser parallelism, and additional resource controls where required. Add cross-shard reporting and more advanced CI balancing as separate increments. Preserve compiler, server, worker, snapshot, and report ownership across every extension.

**Acceptance:** Extended scheduling produces equivalent results to serial runs and complete reports. Crashes and cancellation reclaim every owned resource; concurrent profiles and shards cannot corrupt shared outputs or fixtures.

**Coordination:** Execution owner with compiler, browser, and CLI owners.

### 3. Vitest declaration, lifecycle, and fixture compatibility

**Implemented:** Parameterized tests/suites, expected failures, retries/repeats, callback-less todo declarations, declaration options, and suite-scoped object-form `test.override` are available. Fixture dependencies support destructured names, aliases, and defaults.

**Current limit:** Concurrent cases, shuffled suites, asynchronous suites, around hooks, worker-scoped/builder fixtures, and rest/nested/computed fixture dependencies remain unsupported. Assertion-count timing and failure-listener behavior retain documented Next-specific differences; full Vitest task/result introspection is absent.

**Approach:** Extend the remaining declaration and fixture semantics in independently verified increments. Coordinate concurrent cases with the scheduler and attempt-owned utilities. Resolve or explicitly retain the documented lifecycle differences.

**Acceptance:** Each advertised addition matches the pinned Vitest reference in execution order, failures, retries, teardown, and public types. Unsupported combinations continue to fail clearly.

**Coordination:** Runner owner; coordinate concurrent execution with workstream 2 and assertion lifecycle with workstream 4.

### 4. Assertions, test utilities, and snapshot expansion

**Implemented:** Soft/polling assertions, attempt-owned global/environment stubs and bounded fake timers, custom serializers, and inline/file snapshot APIs are present. Explicit snapshot updates extend to browser and production profiles after complete resource cleanup.

**Current limit:** The utility and matcher surface remains an explicit subset of Vitest. Automatic watch snapshot updates, implicit new snapshots, and unchecked-snapshot pruning remain unsupported. Scheduling integration recorded an inline snapshot update that passed without writing the source, followed by a failing read-only run; it also reproduced without the scheduling supervisor and remains a validation/fix follow-up.

**Approach:** Resolve and verify compiled inline snapshot round trips, then expand the remaining utilities and matcher compatibility where required. Keep utilities within Next-owned attempt lifetimes and snapshot writes within the parent-owned, source-revision-checked model. Strengthen cross-profile, cancellation, and concurrent-edit acceptance.

**Acceptance:** Utilities cannot leak into later tests or interfere with framework scheduling. Snapshot updates preserve concurrent user edits and unselected snapshots, and failed or interrupted execution cannot authorize new writes.

**Coordination:** Assertion owner with runner, execution, and browser owners. Retain explicit updates and unchecked-snapshot preservation unless their policy is separately changed.

### 5. Module mocking beyond the initial subset

**Implemented:** Development Node mocks support ordered setup files, string and typed literal import targets, supported synchronous/asynchronous factories, partial `importOriginal` spreads, live inherited ESM exports, and shared static/dynamic consumer identity.

**Current limit:** Mocks still require compiler-transformed top-level factories with statically known exports and project-local ESM targets. Automatic mocks, `vi.importActual`, `vi.hoisted`, runtime registration, CommonJS/external targets, cycles involving mocked originals, and RSC/browser/production mocking remain unsupported.

**Approach:** Expand the remaining factory, registration, module-reset, and target capabilities one supported combination at a time. Add environments through real compiler contexts, with explicit acceptance for each profile.

**Acceptance:** Mocked and original imports preserve module identity and the promised ESM behavior. Setup ordering, retries, separate files, and watch reruns remain isolated. Ordinary application builds remain free of mock infrastructure.

**Coordination:** Mocking owner owns mock behavior; one compiler owner integrates shared native changes. Production/RSC/browser mocking needs explicit scope and separate acceptance.

### 6. Browser watch and production component mounting

**Current limit:** Browser drivers work in development and production. Registered component mounting is development-only, and browser watch is unsupported.

**Approach:** Add browser watch with coordinated compiler, application-server, browser, and artifact lifetimes. Add registered component mounting against actual production output. Preserve fresh attempt contexts and define server/cache reuse explicitly. Keep `instant()` tied to the application's real, explicitly enabled testing instrumentation.

**Acceptance:** Edits update rendered components and application routes without stale assets or state. Production mounting matches a normal production application. Interruptions, hydration errors, server crashes, and retries clean up correctly.

**Coordination:** Browser owner with compilation, execution, rendering, and watch owners. Chromium remains the initial reference browser.

### 7. Route-aware rendering and cache fixtures

**Current limit:** Isolated RSC rendering covers dynamic subtrees without route/layout context and uses explicit file-scoped persistent caches. It does not establish isolated prerender/PPR or Server Action transport support.

**Approach:** Define explicit route and layout context where needed, broaden controlled cold/warm cache fixtures, and support custom cache/data isolation where it can be guaranteed. Add prerender/PPR and action-transport testing as separately scoped capabilities with real application comparisons.

**Acceptance:** Request APIs, routing context, cache behavior, serialization, and rendering agree with the corresponding Next application. Parallel fixtures cannot clear or reuse another test's state accidentally.

**Coordination:** Rendering/request owner with compiler and browser owners. Agree the public fixture contract before extending runtime state.

### 8. Coverage beyond the first line metric

**Current limit:** Coverage is one-shot development Node coverage of imported project sources, with JSON/text output. It does not include branch/function metrics, thresholds, unimported sources, mocked artifacts, watch, production, RSC, or browser execution.

**Approach:** Define each additional metric and reporting promise, then extend collection and original-source mapping through the relevant execution profiles. Add thresholds, uncovered-file discovery, and additional report formats as separate increments. Deduplicate multiple compiled representations of the same source where required.

**Acceptance:** Reports identify original application sources, exclude generated harness code, retain retry/failure evidence, and cannot appear complete after interrupted collection. Any advertised coverage compatibility has direct reference checks.

**Coordination:** Coverage owner with compiler and execution owners; browser/rendering owners join for their profiles.

### 9. Configuration and CLI completeness

**Current limit:** Configuration is JSON-only. Worker limits and CI sharding are implemented. Interactive test-name filtering exists, but a corresponding one-shot name-filter option and broader run controls are absent.

**Approach:** Define a Next-owned typed configuration API and safe executable-config lifecycle if included in the release scope. Extend noninteractive filtering and run controls, keeping them consistent with existing scheduling options. Specify environment/configuration precedence and migration diagnostics while preserving Next's compilation conditions.

**Acceptance:** Public options behave consistently across one-shot and watch execution, types describe the supported surface, and conflicting compiler settings receive actionable errors.

**Coordination:** One integration owner controls configuration, CLI, capability declarations, and shared contracts. Vitest/Vite compiler plugins remain outside the ownership model.

### 10. Reporters, editor integration, and debugging

**Current limit:** The default human reporter and interactive terminal are implemented. Structured events exist internally; public JSON/JUnit result reporters, custom-reporter adapters, editor run/debug integration, and automatic agent-specific reporter selection remain separate work.

**Approach:** Expose a stable Next-owned result/control interface, implement machine-readable reporters, and build editor run/debug/cancel/snapshot actions on that interface. Complete additional terminal behavior against the pinned reference as needed. An optional Vitest tooling adapter must delegate execution to Next.

**Acceptance:** Tools can identify and run a single original test, navigate mapped failures, preserve retries and attachments, and cancel safely. Debugging attaches to the actual isolated test process. Reporter failures never hide execution failures.

**Coordination:** Tooling owner with CLI, execution, and reporting owners. Result/control contracts precede editor-specific adapters.

### 11. Adoption, compatibility maintenance, and release hardening

**Current limit:** The experiment has package-consumer fixtures and implementation documentation. A supported public release still needs a complete user journey, a declared compatibility policy, and broader operating evidence.

**Approach:** Publish user-facing setup, migration, configuration, RSC/browser, watch, mocking, and coverage documentation; add scaffolding and runnable examples for the accepted subset. Keep authoring declarations, capability output, examples, and dependency updates aligned. Expand platform acceptance, isolation stress tests, production artifact inspection, and measured performance budgets.

**Known follow-up:** Investigate the intermittent filesystem-watcher and process-cleanup test failures observed during terminal validation. The final combined run passed, but the original causes were not established.

**Current validation gap:** The October 13 scheduling publication passed focused unit tests, changed-file lint, and formatting. Full bootstrap/declaration/type checks remain incomplete because of workspace dependency/build issues and reported API/type mismatches; native CLI acceptance was not rerun on this PR head. Re-establish full validation for the integrated revision, including the inline snapshot round-trip issue in workstream 4, before claiming release readiness.

**Acceptance:** A clean installed consumer can follow the documentation without repository-only setup. The advertised host/runtime matrix passes, ordinary deployment artifacts exclude active test infrastructure, and pinned compatibility checks and performance budgets are repeatable.

**Coordination:** Adoption and independent-validation owners can start immediately and follow every integrated capability. Existing package and omission checks are the starting point.

## Suggested parallel sequence

1. **Establish the integrated baseline:** Complete build/type/native acceptance for the current PR, investigate recorded snapshot and cleanup failures, and choose the next supported subset.
2. **Start independent increments:** Incremental compilation/selection, remaining authoring and utility compatibility, broader mocks, reporter contracts, and adoption work can proceed independently. Define browser and rendering extensions against their current supported boundaries.
3. **Integrate dependent capabilities:** Connect browser watch and production mounting, extensions to the existing scheduler, expanded coverage, and editor tooling as their producer/consumer contracts become available. Keep shared native builds and broad acceptance runs coordinated.
4. **Accept the release subset:** Verify each addition through the public CLI and packed consumer, update the capability inventory, and finish the platform, production-artifact, isolation, and performance gates.

Each task should own a narrow file area, state its dependencies and acceptance result, and hand off a reviewable change with evidence. Retain unsupported-feature errors until the complete compiled/runtime path is verified.

## Scope decisions to keep explicit

- **Windows, additional CPU/OS targets, and browser engines:** POSIX process ownership and Chromium are the current execution baseline. Wider support needs equivalent lifecycle guarantees and its own acceptance matrix.
- **Edge, webpack, and Pages-specific behavior:** These require deliberate execution/compiler profiles and fidelity checks; preserve the current App Router/Node/Turbopack focus until selected.
- **Type tests, benchmarks, DOM emulation, and ecosystem plugins:** Treat these as separate products or compatibility surfaces. Reusing test-authoring syntax does not establish their support.
- **Full Vitest parity:** Choose and publish a supported subset for each milestone. The remaining unsupported API inventory is a planning input; release requirements follow the agreed scope.

## Source of truth

This update was checked against the published [capability inventory](https://github.com/vercel/next.js/blob/3371432a5561c33bc3d1ec36309b3e537b130a99/packages/next/src/experimental/testing/capabilities.ts) and [scheduling implementation and validation notes](https://github.com/vercel/next.js/blob/3371432a5561c33bc3d1ec36309b3e537b130a99/NEXT_TESTING_SCHEDULING.md) at the baseline commit. The architecture and earlier implementation plans remain background context. Published capabilities and recorded validation limits take precedence over historical deferred-work lists and older local checkouts.
