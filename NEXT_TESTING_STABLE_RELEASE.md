# Next testing: stable release requirements

Status: proposed release requirements, October 13, 2026. This document defines the target for graduating the experiment; it does not claim that these requirements are implemented or verified.

Original implementation baseline: [PR #98869](https://github.com/vercel/next.js/pull/98869) at `3371432a55`. The October 13 [remaining-work document](NEXT_TESTING_REMAINING_WORK.md) describes historical gaps. Use the [reviewed compatibility inventory](packages/next/src/experimental/testing/compatibility-inventory.md), [runtime capabilities](packages/next/src/experimental/testing/capabilities.ts) and [progress ledger](NEXT_TESTING_STABLE_PROGRESS.md) for current implementation scope and verification. The requirements below remain the stable release target.

## Release goal

An existing Vitest user should be able to run their tests through Next with as few changes as possible. Existing test bodies, `vitest` imports, helpers, custom matchers, fixtures, and snapshots should continue to work. The normal migration should be changing the runner command and mapping configuration that genuinely depends on the compiler or execution environment.

Target the full stable Vitest test-authoring surface of a declared version, rather than freezing the experiment's current subset. Compatibility includes observable behavior, TypeScript types, errors, configuration, CLI output, and everyday tooling. Matching function names is insufficient.

Next retains control of compilation, module evaluation, scheduling, isolation, rendering, and cleanup. Compatible APIs and tooling adapters must operate through that runtime. Loading Vitest's controller or Vite pipeline as a fallback is not an acceptable way to make a test pass.

## Compatibility contract

Before release, select a published stable Vitest version and pin its exact revision as the conformance reference. Publish the supported version range and the policy for adopting upstream changes. The experiment currently inventories Vitest `5.0.4` at revision `6a11cf66f99fa610b7364363d5ca42b66d994f40`; those pins do not establish full compatibility. Reconcile the inventory with the chosen release and its [migration guide](https://vitest.dev/guide/migration/) before freezing the public contract. The supported version range and upstream adoption policy remain release decisions.

Maintain one compatibility inventory covering public exports, overloads, modifiers, types, configuration, environments, CLI options, and tooling interfaces. For each capability, record the applicable profiles, implementation status, conformance evidence, and any exception. Documentation and runtime capability reporting must agree with it.

Use these release classifications:

| Classification        | Requirement                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Compatible            | Existing usage has equivalent observable behavior and types, backed by reference tests.                                                  |
| Next extension        | Additional Next functionality is clearly named and does not change existing Vitest behavior implicitly.                                  |
| Approved exception    | A specific incompatibility has a technical reason, affected workflows, a migration path or diagnostic, and an explicit release decision. |
| Missing or unverified | Remains a release blocker for an in-scope stable capability. Documentation alone does not close it.                                      |

Default to compatibility. Implementation difficulty or the experiment's existing restrictions are not sufficient reasons to exclude common APIs. Experimental or deprecated upstream features must still be inventoried, with an explicit support decision appropriate to the selected version.

Report conformance by surface and environment. A single compatibility percentage must not hide missing mocking, fixtures, or browser behavior behind a large matcher test count.

## Required compatibility surfaces

### 1. Imports, types, and existing test helpers

Preserve direct imports from `vitest`, supported public subpaths, and optional globals. Tests, setup files, workspace helpers, and third-party matchers must share the same active test and assertion state. Compatibility must not depend on editing installed packages or globally redirecting ordinary application imports.

Provide correct inference, overloads, generic fixtures, typed mocks, matcher augmentation, and editor resolution. Include runtime assertions and type-testing APIs such as `expectTypeOf` and `assertType`, using the selected version's [type-testing contract](https://vitest.dev/guide/testing-types.html). Inventory [in-source testing](https://vitest.dev/guide/in-source.html) and ensure any supported form disappears from ordinary production artifacts.

**Release evidence:** Unmodified JavaScript and TypeScript test/helper packages install, type-check, and run from a clean consumer project. Unsupported public subpaths produce specific diagnostics rather than starting a second runtime. Private Vitest internals are not a compatibility promise.

### 2. Declarations, lifecycle, and fixtures

Complete the selected version's [declaration API](https://vitest.dev/api/), including parameterization, modifier combinations, dynamic skip behavior, asynchronous collection, concurrent/sequential execution, repeats, retries, expected failures, and suite options. Include stable metadata, tags, and test-context features from that version.

Match [hook behavior](https://vitest.dev/api/hooks.html), including nesting, returned cleanup, around hooks, ordering, timeout handling, and failure listeners. Close the experiment's assertion-count timing and failure-listener differences unless a specific exception is approved.

Complete [fixture compatibility](https://vitest.dev/guide/test-context.html): supported declaration forms, lazy/automatic initialization, dependency ordering, overrides, scopes, teardown, and types. Worker-scoped fixtures must have a meaningful, documented lifetime in the Next scheduler.

**Release evidence:** Reference tests produce equivalent collection and lifecycle guarantees for success, failed setup, failed teardown, retries, timeout, and concurrency. Failures cannot disappear because collection aborted or cleanup failed. Concurrent tests cannot attribute another test's assertions, snapshots, or errors to themselves.

### 3. Assertions, spies, timers, and utilities

Cover the stable [assertion surface](https://vitest.dev/api/expect.html), including custom and asymmetric matchers, asynchronous assertions, soft assertions, polling, assertion counts, assertion state, and useful failure output. Include the selected version's Chai-compatible `assert` surface and matcher extension types.

Complete [spy behavior](https://vitest.dev/api/mock.html) and the remaining [test utilities](https://vitest.dev/api/vi.html), including mock implementations/results, restoration, fake-clock operations, date control, environment/global stubs, and async waiting. Match documented lifetime and reset options, including interactions with retries and concurrent tests.

**Release evidence:** Established matcher/helper packages work unchanged, with both passing and deliberately failing cases. Virtual test clocks cannot freeze compiler supervision or cleanup deadlines. Runtime environment stubs must not claim to change values already inlined by Next compilation; that boundary needs a precise diagnostic or documented exception.

### 4. Module mocking

Expand beyond static project-local factories to the selected version's stable [module-mocking contract](https://vitest.dev/guide/mocking/modules): hoisted helpers, actual imports, runtime registration/unregistration, automatic mocks, manual `__mocks__`, spy mode, module resets, and supported package targets.

Validate setup-file ordering, aliases, package exports, dynamic imports, partial factories, cycles, and ESM identity through the actual Next compiler. Mocked and original graphs must preserve the observable bindings promised by the API. Application modules must not acquire mock behavior outside a test invocation.

**Release evidence:** Existing mocking suites pass unchanged in each advertised environment, including isolation across files, retries, watch generations, and workers. Distinguish upstream limitations from Next gaps: Vitest itself excludes mocking imports made with `require()` in its [utility reference](https://vitest.dev/api/vi.html). Do not invent a broader compatibility promise or silently reject supported ESM imports of packages merely because their implementation uses CommonJS.

### 5. Snapshots

Make existing external, inline, and file snapshots portable, including serializers, property matchers, naming, source locations, formatting, and update behavior. Match the chosen version's [snapshot policy](https://vitest.dev/guide/snapshot.html) for local runs, CI, watch, missing snapshots, obsolete snapshots, filtered runs, and explicit updates.

The experiment's read-only default and unconditional preservation of unchecked snapshots must be evaluated as compatibility gaps, not automatically carried into stable behavior. Any retained difference requires an explicit release decision. Preserve coordinated writes and source-revision checks while implementing the intended policy; an update request must never authorize deleting snapshots belonging to unselected tests.

**Release evidence:** Existing snapshots survive an update/read round trip through the public compiled CLI. This includes inline source edits, parallel files, browser and production profiles, retries, and cancellation. Resolve the recorded case where an inline update succeeds without writing its source. Cleanup failure or a concurrent user edit must not result in a partially published update.

### 6. Environments and browser compatibility

Support migration of ordinary Node and DOM unit/component tests, including `jsdom` and `happy-dom`, their relevant options, and supported per-file environment declarations. These are explicit test environments, following the selected [environment contract](https://vitest.dev/guide/environment.html); they do not establish RSC or real-browser fidelity.

Treat [Vitest Browser Mode](https://vitest.dev/guide/browser/) as a separate compatibility surface. The experiment's Node driver controlling a browser is not equivalent to executing test code in the browser. Provide a Next-owned browser test environment for existing client-component tests, with compatible context, interactions, assertions, module mocks, and supported React rendering helpers. Preserve the real Next client compilation conditions.

**Release evidence:** Representative Testing Library and browser-component suites run without rewriting test bodies. Browser watch, cancellation, isolation, and component cleanup work reliably. Cover Chromium, Firefox, and WebKit wherever advertised; narrower support must be an explicit exception. Evaluate custom environments and Edge separately rather than treating them as automatic Node compatibility.

### 7. Configuration, projects, and migration

Provide typed executable configuration and a documented precedence model. Preserve familiar discovery, exclusions, project selection, globals, setup/global setup, provided context, timeout, retry, isolation, ordering, mock-reset, snapshot, reporter, coverage, and environment settings from the [Vitest configuration contract](https://vitest.dev/config/).

Offer a compatibility loader or migration tool for existing `vitest.config.*` files and shared test configuration. Translate compatible test settings automatically. Inspect compiler-dependent configuration and report exactly which settings require changes. Never silently ignore a setting that changes selected tests or their behavior.

Next configuration remains authoritative for application compilation. Vite plugins, aliases, transforms, and compile-time defines require an equivalent Next configuration or an explicit incompatibility; accepting the option name must not silently change the tested application graph.

**Release evidence:** Single-project and monorepo migrations preserve discovery, setup order, environment selection, and results. Missing configuration support yields actionable errors. Independent projects cannot leak globals, configuration, caches, or setup state into one another.

### 8. CLI, watch, parallel execution, and CI

Match the selected [CLI behavior](https://vitest.dev/guide/cli.html) for common commands and controls: one-shot/watch defaults, listing, file/test-name/project filtering, changed/related selection, retries, bail, timeouts, snapshots, workers, sharding, and exit status. Keep the `next test` command while preserving compatible arguments wherever their meaning applies.

The default terminal output must match Vitest's layout and behavior: collection/progress, summaries, failure presentation, console attribution, colors, interactive shortcuts, redraw, and piped/CI output. Normalize dynamic paths and timings in comparisons; explicitly identify unavoidable Next compilation diagnostics or branding differences.

Complete incremental compilation and affected-test selection with conservative fallback when dependencies are uncertain. Extend the existing file scheduler to required watch/browser workflows. Deterministic sharding is implemented, but its exact selection/order semantics still need reference verification. Add usable cross-shard results and report merging.

**Release evidence:** Serial, parallel, sharded, and watch runs agree on collected tests and outcomes. Source/config/setup edits, additions/deletions, rapid edits, interrupts, and crashes cannot lose tests, retain stale results, or leave owned processes behind. Empty selections and accidental focused tests obey the documented local/CI policy.

### 9. Coverage

Replace the initial imported-line metric with production-quality statement, branch, function, and line coverage where promised. Support source exclusions, unimported files, thresholds, watch behavior, standard outputs, and CI/shard aggregation following the selected [coverage contract](https://vitest.dev/guide/coverage.html).

Measure original application sources and distinguish generated harness code. Define how multiple RSC, SSR, and browser compilations of a source contribute to the report. Verify mocks, retries, failure, and cancellation instead of assuming a successful unit-only report generalizes to every profile.

**Release evidence:** Representative fixtures produce validated original-source metrics and threshold outcomes, with no inflated coverage from duplicate compilations or missing files. Existing CI consumers can read standard reports. Provider implementations may remain Next-owned; any unsupported provider selection needs an explicit compatibility decision.

### 10. Reports, editors, and debugging

Provide the built-in [report formats](https://vitest.dev/guide/reporters.html) needed for existing workflows, including human output, JSON, JUnit, and mergeable CI artifacts. Preserve collection errors, unhandled errors, retries, attachments, console output, and original source locations.

Support public [custom-reporter contracts](https://vitest.dev/api/advanced/reporters.html) through adapters where feasible. Tooling must discover, run, rerun, debug, cancel, and update snapshots through Next-owned execution. Validate compatibility with existing [editor integrations](https://vitest.dev/guide/ide.html), or provide an adapter with equivalent everyday actions. Do not claim existing extensions work merely because test imports look familiar.

**Release evidence:** Users can run and debug an individual original test, navigate a mapped failure, and update its snapshot from an editor. CI parsers and representative custom reporters consume real results. Reporter crashes cannot turn failed execution into a successful exit. Any missing UI, advanced programmatic API, or plugin compatibility appears in the public inventory.

## Next-specific stable requirements

Vitest compatibility alone does not establish that the runner tests the same application Next serves. Every stable Next profile also needs an independent application reference.

| Area                   | Stable requirement                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compilation fidelity   | Use actual Next resolution, exports/conditions, transforms, assets, CSS, environment handling, and React identities. Test instrumentation must not silently alter the unmocked application graph.                               |
| RSC and requests       | Verify streaming, request APIs, client boundaries, serialization, errors, and cancellation against a normal Next application. Explicitly define route/layout context and cache isolation.                                       |
| Browser and production | Complete browser watch and production component mounting for the advertised feature set. Test hydration, application-server failures, production conditions, and artifact retention.                                            |
| Caches and parallelism | Define cold/warm fixture behavior and ownership of persistent data. One test or shard cannot clear or reuse another's state accidentally.                                                                                       |
| Advanced rendering     | Make explicit support decisions for isolated prerender/PPR, Server Action transport, and route-aware rendering. Unsupported Next extensions cannot be implied by broad RSC claims.                                              |
| Packaging and omission | A published installation includes working types, runtime exports, native support, and browser setup. Ordinary applications and production builds exclude active test instrumentation, mocks, fixtures, and test-only endpoints. |

Next-only rendering behavior should be compared with normal Next applications, not with Vitest running a different compiler or an emulated environment.

## Exceptions must be narrow and visible

Architectural differences are expected to concentrate in Vite compilation plugins, Vitest's private internals and worker/pool implementation, and APIs that directly control those systems. Prefer adapters for public test and tooling APIs before accepting an exception.

An exception must name the exact API/option and affected environment, explain the conflict, show the user-facing diagnostic, and give a migration path where possible. It must be reviewed as part of the release contract. A broad statement such as “Vitest subset supported” is insufficient for stable release.

The existing limitations on concurrent tests, fixture forms, module mocking, DOM environments, snapshot defaults, and utilities are work to close. They are not pre-approved permanent exceptions. Benchmarks, custom providers, alternative environments, and advanced APIs must be assessed against the selected upstream version; they must not disappear from the inventory simply because they were outside the experiment.

## Evidence required to graduate

### Behavioral conformance

Build a versioned corpus that runs unchanged under the pinned Vitest reference and the Next-owned runner. Compare collection, guaranteed ordering, outcome, errors, fixture lifetime, mock behavior, snapshots, public types, reports, and exit status. For concurrency, compare allowed outcomes and ordering constraints rather than incidental interleaving. Include negative cases and interactions between features, not just isolated happy-path API calls.

Normalize only irrelevant differences such as temporary paths, elapsed time, and approved compiler-specific diagnostics. Do not normalize away lost tests, different hook ordering, changed errors, missing assertions, or incorrect snapshot policy. Track every mismatch against the compatibility inventory.

### Real migrations

Validate clean published-package consumers and representative existing suites: Node libraries, React DOM tests, real-browser component tests, monorepos, matcher/fixture packages, mocked dependencies, snapshot-heavy suites, and CI/reporting integrations. Record the required changes. Rewriting assertions or test bodies is a compatibility failure unless tied to an approved exception.

Keep Next RSC, browser-driver, cache, and production fixtures as a separate application-fidelity corpus. Both corpora must run through the public CLI with the actual native compiler and runtime.

### Reliability, platforms, and performance

Test supported Next Node versions, operating systems, architectures, package managers, and browser engines from clean installations. Windows process ownership and filesystem behavior need direct evidence before advertising support; current POSIX evidence does not cover them.

Exercise repeated watch cycles, cancellation during each lifecycle phase, worker/compiler/server crashes, and long runs. Owned processes, ports, locks, file handles, memory, timers, mocks, and globals must remain bounded and clean up reliably. Errors after a test finishes must still be reported.

Set measurable cold-start, warm-rerun, memory, and parallel-scaling budgets before release qualification. Publish repeatable measurements against the experiment and comparable Vitest workloads. Evaluate equivalent work and environments; faster execution caused by skipping compilation or tests is not an improvement.

### Release and maintenance

Choose stable public exports, configuration, commands, and diagnostics. Remove the experimental designation only after the acceptance gates pass. Document setup, Vitest migration, supported environments, RSC/browser workflows, mocks, snapshots, coverage, CI, debugging, and every approved exception. Ship runnable examples and scaffolding.

Assign ongoing ownership for compatibility regressions, upstream upgrades, reused primitive patches, platform failures, and public deprecations. Run conformance in CI and require evidence before expanding the supported Vitest version range. Include downstream canary adoption and a rollback path before stable promotion.

## Stable release checklist

- [ ] A published Vitest target/version range and complete compatibility inventory are agreed.
- [ ] In-scope stable authoring APIs, types, behavior, environments, and workflows pass reference conformance; every exception is explicit and approved.
- [ ] Existing representative suites migrate without test-body rewrites outside those exceptions.
- [ ] Snapshot update/read round trips, coverage metrics, reporters, CLI output, and editor/debug workflows pass public-path acceptance.
- [ ] Incremental selection and serial/parallel/sharded/watch execution preserve complete results and isolation.
- [ ] Next compilation/rendering fidelity and production omission checks pass for every advertised profile.
- [ ] Clean-package builds, types, lint, native CLI tests, and platform/browser acceptance pass at the same release revision.
- [ ] Repeated-run, cancellation, crash, resource-cleanup, and agreed performance gates pass.
- [ ] Stable exports, migration documentation, examples, support policy, and maintenance ownership are ready.
- [ ] Downstream canary validation is complete and all release-blocking failures are resolved.

The current experiment is not yet at this gate: the [published scheduling handoff](https://github.com/vercel/next.js/blob/3371432a5561c33bc3d1ec36309b3e537b130a99/NEXT_TESTING_SCHEDULING.md) records incomplete build/type validation and no native CLI acceptance rerun for that publication, alongside the inline-snapshot follow-up. These are baseline findings to revalidate, not evidence that unrelated future revisions still fail.

## Decisions to settle before freezing the contract

1. Which stable Vitest version and supported range define compatibility?
2. What are the stable Next API/configuration entry points and the migration path for existing Vitest configuration?
3. Which environment, platform, browser, and Next rendering profiles carry the stable guarantee?
4. Which narrowly justified compatibility exceptions remain after attempting public adapters?
5. What corpus, downstream projects, reliability duration, and measured performance budgets determine release acceptance?

These decisions refine the release contract. They must not silently reduce the goal of preserving existing Vitest tests and workflows wherever Next can support them.
