# Stable release compatibility acceptance contracts

This suite compares public Next testing behavior with pristine published Vitest
5.0.4. It asserts the desired behavior rather than treating unsupported-feature
diagnostics as completed functionality. The explicitly named compiler-option
diagnostic gate checks the migration diagnostic; it does not grant a stable
compatibility exception.

`contracts.json` is the executable manifest. Its 208 contracts select authored
fixtures under `fixtures/`, copied unchanged to both runners. The test file also
contains type, watch, terminal, reporting, rendering and reliability probes that
need more orchestration than a manifest entry. Keep those probes runnable and
preserve their behavioral assertions.

## Running the suite

The suite was generated with
`pnpm new-test --args true next-testing-stable-release-gaps unit`. It uses the
bootstrapped native compiler and built package; rebuild normally after changing
the implementation. A watch build is unnecessary for records-only changes.

```sh
NEXT_TESTING_RELEASE_GAP_EVIDENCE=/tmp/next-testing-release-gap-evidence \
  pnpm exec jest --runTestsByPath \
  test/unit/app-dir/next-testing-stable-release-gaps/release-gaps.test.ts \
  --runInBand --json --outputFile=/tmp/next-testing-release-gaps.json
```

The harness installs the reference in an owned, isolated pnpm project and checks
its exact package integrity and absence of primitive patches. Positive reference
fixtures must pass before a Next result can establish a compatibility gap.
Deliberate assertion, type, collection and timeout failures must produce their
specified reference outcome. When the evidence variable is set, the harness
retains per-contract outcomes, reports and stdout/stderr. Use those current
results to assess status; historical pass/fail counts are not maintained here.

Install the Chromium/headless-shell revisions required by both the pinned
Playwright 1.64.0 reference driver and the workspace Playwright driver. If setting
`PLAYWRIGHT_BROWSERS_PATH`, use a cache containing both revisions. Browser Mode
references execute in Chromium itself; Node substitutes do not qualify them.
Production mounting also exercises the workspace browser driver.

Python 3 and a POSIX PTY are needed for terminal interaction checks. Those probes
clear the reference's recognized agent flags when testing ordinary interactive
watch behavior. Separate probes retain agent detection, CI defaults and explicit
`--run`. Windows terminal/process behavior requires its own platform execution.

Subprocess type inputs live in `.txt` files and are copied into isolated
TypeScript consumers. Invalid programs have their own fixture tsconfig so
ancestor include rules cannot hide errors. The Next adapter resolves the shipped
public wrapper without a `.js` extension, allowing TypeScript to find its
declarations. Root TypeScript and ESLint check the harness itself.

## Contract mapping

Each manifest entry carries its exact ID, numbered surface, runner settings and
required outcomes. These groups summarize its coverage without duplicating the
manifest or recording an implementation status.

| Surface | Manifest contracts | Behavioral scope |
| --- | ---: | --- |
| Imports and types | 6 | Public config imports, optional globals, shared helpers, compiler-backed type checking and in-source collection. Separate subprocess probes cover fixture/context types and matcher augmentation. |
| Declarations, lifecycle and fixtures | 28 | Context identity and signals, around hooks, concurrent/sequential/shuffled suites, hook order and budgets, worker/scoped fixtures, collection and cleanup failures. |
| Assertions and utilities | 32 | Assertion instances, Chai, unawaited assertions, equality extensions, spies, clock draining, waiting, reset defaults/options, compiled environment stubs and delayed import settling. |
| Mocks and resets | 39 | Hoisted helpers, actual imports, automatic/manual/spy factories, cycles, setup ordering, file isolation, runtime registration/reset and Node/RSC/Browser profiles. CommonJS implementations are consumed through ESM; mocking `require()` is not promised. |
| Snapshots | 16 | Names, serializers and precedence, file ownership, filtered/obsolete entries, retries, error/property matching, raw-file updates and production/Browser compilation. |
| Environments and Browser Mode | 22 | DOM options, per-file/custom/Edge environments, Testing Library, actual browser execution/rendering, async semantics, hook failures and serial file lifetime. |
| Configuration and migration | 34 | Config factories/TLA/services, provided values, global/setup lifetime and ordering, external/glob projects, discovery, CLI precedence, aliases and compiler transforms. |
| CLI, selection, projects and sharding | 10 | Bail, retries, timeouts, focus/empty selections, projects, changed/related tests and complementary shards. |
| Coverage | 8 | Standard metrics/reports, thresholds, custom-provider lifecycle, retry/failure/mock interactions and production/Browser profiles. |
| Reports and tooling | 13 | Custom/built-in reporters, reporter crashes, JSON/error metadata, empty modules, worker debugging and editor API discovery. |

Additional probes in `release-gaps.test.ts` exercise collected-case listing,
upstream blob merging, JUnit output, source/setup/config/addition/deletion watch
edits, coverage watch and config changes, snapshot cancellation and crash/restart
recovery, and actual terminal controls. Next-specific fidelity probes first run a
normal application before comparing route/request rendering or production
component mounting. Reliability probes check worker exits, run locks and owned
compiler output across repeated runs.

## Interpreting qualification

A passing prerequisite does not qualify every downstream interaction. Inspect
which phase a run reached and its actual results; a missing adapter cannot prove
later lifetime, rendering, mapping or reporting behavior. Preserve original
sources, exact errors, identities, bytes and causal ordering where the probe
requires them. Parallel project reports normalize only their permitted case-array
ordering.

The finite corpus does not establish exhaustive overload, terminal, editor,
route/layout/cache/action, browser-engine or cross-feature compatibility. It also
does not replace unmodified downstream migrations, clean OS/architecture/package
manager runs, sustained resource qualification or release/support ownership.
Those decisions and evidence belong in the current implementation inventory and
release ledger. Performance benchmarking remains deferred.
