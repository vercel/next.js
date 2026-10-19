# Stable release compatibility acceptance gaps

These are deliberately runnable release acceptance tests for published Vitest
5.0.4. They assert the desired contract and are expected to fail until the
experiment implements it. They never expect an unsupported-feature error as the
success outcome, except the explicitly named compiler-option diagnostic gate,
which checks the required migration diagnostic rather than granting an exception.
Do not skip the suite or replace a behavioral assertion with a TODO or an
unconditional failure.

The suite was generated with
`pnpm new-test --args true next-testing-stable-release-gaps unit`. It edits no
implementation code. A watch build is unnecessary because these unit acceptance
fixtures run against the already bootstrapped native compiler and built package;
rebuild normally if the implementation changes before using the suite.

## Run and evidence

```sh
NEXT_TESTING_RELEASE_GAP_EVIDENCE=/tmp/next-testing-release-gap-evidence \
  pnpm exec jest --runTestsByPath \
  test/unit/app-dir/next-testing-stable-release-gaps/release-gaps.test.ts \
  --runInBand --json --outputFile=/tmp/next-testing-release-gaps.json
```

The reference is installed in an owned, isolated pnpm project. Its exact package
integrity is checked and it has no Next primitive patches. `contracts.json`
selects real fixture files under `fixtures/`; each body and helper is copied
unchanged to both runners. Positive reference fixtures must pass before their
Next result counts as a confirmed gap. Deliberate assertion/type/timeout failures
must have their specified reference exit code. Raw outcomes, reports and stdout/
stderr are retained per contract when the evidence variable is set.

Install the Chromium/headless-shell revisions required by both the pinned
Playwright 1.64.0 reference driver and the workspace Playwright driver. If setting
`PLAYWRIGHT_BROWSERS_PATH`, use a cache containing both revisions. The pristine
Browser Mode provider uses its exact pinned driver; production mounting also
exercises the workspace browser driver. A cache containing only the reference
revision cannot qualify that production prerequisite. Browser tests run in
Chromium itself; a Node driver is not accepted as the Browser Mode reference.
Python 3 and a POSIX PTY are needed for terminal interaction checks. They directly
exercise default watch behavior, help and test-name filtering in an xterm
terminal. Windows terminal/process qualification needs its own CI execution.

Assertions in subprocess type inputs live in `.txt` files and are copied into
isolated TypeScript consumers. Intentionally invalid type tests have their own
fixture tsconfig, so ancestor include rules cannot hide their errors. Root
TypeScript and ESLint should pass for the acceptance harness itself.

## Observed red baseline

The complete unfiltered run on October 14, 2026 reached **118 probes: 106 red,
12 green, zero skipped**. Every pristine-reference fixture had its required
outcome; there were no invalid reference/type/provider/app/PTY setup fixtures.
`baseline.json` records each result and the earliest observed failure stage.
Raw evidence is in `/private/tmp/next-testing-stable-release-gap-evidence-complete`,
with the complete runner log at
`/private/tmp/next-testing-stable-release-gaps-complete.log` and structured Jest
results at `/private/tmp/next-testing-stable-release-gaps-complete.result.json`.

The 12 green controls cover helper assertion state, an unset environment value,
parallel snapshot publication, a package-import alias mock, the target's strict
unawaited-assertion diagnostic, twelve repeated-run ownership checks, cancellation
in four reached phases, and genuine PTY help/test-name filtering. The separate
inlined environment case is red: Next retains the literal `compiled` value after
`vi.stubEnv` without a specific boundary diagnostic. The custom coverage provider
has a clean reference lifecycle/payload handoff and is blocked by Next's coverage
configuration adapter. These observations do not turn 106 probes into 106
independent bugs or claim downstream semantics behind a failed prerequisite.

Root TypeScript, ESLint, Prettier, Python syntax and whitespace checks pass for
the added harness/fixtures. The main checkout and production implementation are
unchanged; the tests and evidence are intentionally kept in the attached
implementation worktree without committing or pushing.

## Type-adapter correction

The historical baseline used the runtime `.js` path as TypeScript's `paths`
target. TypeScript 6.0.2 resolves an explicit JavaScript target directly and
bypasses its adjacent declaration file, making all three Next type probes fail
before their contracts were checked. The harness now resolves the shipped public
`next/experimental/testing/vitest` wrapper without an extension. The `.txt` type
inputs, strict/no-emit settings, pristine reference checks and required outcomes
are unchanged. The baseline is preserved as historical evidence; later runs
separate actual type-contract failures from that resolved adapter defect.

## Requirement-to-test mapping

| Stable requirement | Runnable contracts and acceptance probes | Exact scope and prerequisite limits |
| --- | --- | --- |
| Imports, subpaths, globals and helpers | `public-config-import`, `optional-globals`, `workspace-helper-state` | Tests actual config subpath import, optional globals and shared helper assertion state. It does not equate a config import with every public subpath adapter. Editor/controller APIs additionally have tooling gates below. |
| Public overloads, generic/scoped fixtures, matcher augmentation and provided context types | `fixture-overloads`, `context-public-types`, `matcher-augmentation` subprocess type probes | Clean pinned-reference compiles are required; Next must accept the same declarations. These are distinct from runtime import failures. |
| Compiler-backed types and in-source tests | `compiler-backed-typecheck`, `in-source-tests` | The reference must detect a deliberately wrong type and collect the in-source body. Next currently rejects the typecheck CLI or config discovery setting; production omission of an eventual supported in-source form remains blocked behind that support. |
| Task/context/tag metadata and cancellation signal lifetime | `context-expect`, `context-task`, `context-annotation`, `context-signal-lifetime`, `tags-and-meta`, `context-benchmark` | Inspects actual task and annotation values. Benchmark probe checks the published regular-run diagnostic; it does not qualify a dedicated benchmark project/provider. |
| Concurrent/sequential/shuffled declarations | `concurrent-isolation`, `sequential-inside-concurrent`, `shuffled-suite` | A two-owner promise barrier proves real concurrency and separate assertion counts; sequential children check guaranteed order. Shuffle compares a fixed-seed trace rather than accepting arbitrary interleaving. |
| Around hooks and hook/listener ordering | `around-each`, `around-all`, `hook-list-order`, `failure-listener-context`, `timeout-next-case` | Nested wrapping and configured hook order are asserted; a cooperative timed-out case cannot silently discard its successor. The existing stable conformance suite separately covers collection failure, async nesting, retry/repeat/count/skip interactions. |
| Worker/builder/scoped fixtures | `worker-fixture`, `builder-fixture`, `scoped-fixture-hooks`, `fixture-builder-override`, `worker-lifetime-across-files` | Distinct declaration and lifetime bodies exist. The cross-file worker case is currently blocked at the unsupported isolation setting, not proof that its later worker lease semantics were exercised under Next. |
| Assertion instances, Chai, ecosystem matchers and asynchronous observation | `create-expect`, `chai-should`, `testing-library-react`, `unawaited-passing-assertion` | Published React Testing Library and jest-dom run unchanged in the reference. DOM compatibility is blocked before those Next bodies can execute. Unawaited assertions compare the reference's deliberate failure and diagnostic heading. |
| Clock/utilities/reset/lifetime and compiled environment stubs | `mock-object`, `fake-microtasks`, `fake-animation-frame`, `async-timer-microtasks`, `wait-for-fake-clock`, `mock-reset-option`, `mock-global-restore-option`, `compiled-env-stub`, `inlined-env-stub-boundary` | The async timer body exposes promise-created timers. The animation-frame body is additionally blocked at jsdom. Config reset probes are blocked at their unsupported options; they are not proof of downstream reset behavior. The unset environment-stub control is distinct from `inlined-env-stub-boundary`, which supplies an actual compile-time application value and verifies it before attempting the stub. |
| Hoisting, actual imports and dynamic mock registration | `hoisted-helper`, `import-actual`, `dynamic-do-mock` | Separate graphs exercise each API; registration, reset and unregistration all have assertions. |
| Automatic/manual/spy/partial/cyclic/external/CommonJS-backed ESM mocks | `automatic-module-mock`, `manual-module-mock`, `module-spy-mode`, `module-reset`, `external-esm-target`, `cjs-implementation-esm-import`, `partial-factory-cycle`, `alias-partial-mock`, `mock-setup-order` | CommonJS implementation is consumed through ESM. The suite does not promise mocking `require()`, which upstream excludes. Green partial/alias graphs remain controls rather than being forced red. |
| Mock profiles and isolation | `rsc-module-mocks`, `browser-module-mocks`, worker and watch probes | Browser fixture must first pass real Browser Mode. Retry/file/watch combinations beyond the named bodies remain downstream interactions blocked by their relevant API/environment prerequisite. |
| Snapshot names, serializers, partial selections and parallel writes | `filtered-snapshot-pruning`, `snapshot-serializer-config`, `snapshot-name-format`, `snapshot-parallel-files`, `watch-snapshot` | Exact bytes are compared where configured. Existing stable conformance covers local/CI modes, obsolete entries and inline/read round trips; these are not rerun solely to produce red output. |
| Snapshot publication and user edits | `snapshot-parent-crash-false`, `snapshot-parent-crash-true`, cancellation phase probes | Fault injection kills only the owned parent immediately after a real managed snapshot rename. Immediate mixed state is saved as evidence; coherence is required at a subsequent read-only CLI restart. User source edits must remain byte-identical during recovery. No impossible simultaneous multi-file rename is required. |
| DOM, options, per-file environments and custom/Edge environments | `jsdom-options`, `happy-dom-options`, `per-file-environment`, `testing-library-react`, `custom-environment`, `edge-runtime` | Each reference has its actual environment. Passing a Node equivalent does not qualify DOM, custom or Edge behavior. Engine/platform limits are separate below. |
| Actual Browser Mode, React rendering and browser watch | `browser-execution`, `browser-react-render`, `browser-module-mocks`, `watch-browser` | Browser bodies assert a real client realm; rendering uses the published `vitest-browser-react` helper. Current Next failures may be at subpath/environment support before interaction/cleanup semantics. |
| Executable config, migration, global setup, provide, ordering and projects | `executable-next-config`, `vitest-config-migration`, `provided-context`, `global-setup`, `config-setup-order`, `cli-projects`, reset/serializer/environment contracts | Actual executable configs and settings are supplied. Rejection is recorded as the missing adapter, not as evidence that its later project/setup isolation is correct or incorrect. |
| Compiler configuration mapping/diagnostics | `compiler-option-mapping`, `alias-partial-mock`, `compiled-env-stub` | A real Vite alias is supplied and must be translated or named precisely in the migration diagnostic. This diagnostic gate cannot approve the incompatibility as a stable exception. Package-import aliases independently have behavioral coverage. |
| CLI listing/filtering/changed/related/bail/retries/timeouts/focus/empty selections | collected-case listing, `cli-related`, `cli-changed`, `cli-bail`, `cli-retry`, `cli-timeout`, `cli-forbid-only-ci`, `cli-allow-empty`, `cli-projects` | Changed selection owns a temporary Git repository and modifies its committed dependency. It never fetches, pushes or changes the user's checkout. Existing conformance already checks ancestor-qualified name patterns. |
| Shards, serial/parallel/watch/incremental selection | `cli-shard-first`, `cli-shard-second`, `watch-source`, `watch-setup`, `watch-addition`, `watch-deletion`, `watch-rapid`, `watch-config`, `watch-parallel`, `watch-browser` | JSON watch probes are blocked by the machine reporter prerequisite in Next. Bodies remain present for the later semantics; those semantics are not counted as independently observed Next failures. Deletion checks the actual remaining case name, not just a stale result count. |
| TTY defaults/help/keyboard controls | `pty-default`, `pty-help`, `pty-filter` | Real POSIX terminal bytes and staged interactions are retained. No static formatting string or mocked key handler replaces the public CLI. Complete redraw/colors/all shortcut and resize combinations remain additional terminal qualification. |
| Statement/branch/function/line coverage, unimported files, exclusions, thresholds and standard outputs | `standard-coverage`, `coverage-threshold`, `custom-coverage-provider` | A branching application function, unused function and unimported source are included; a separate source is excluded. Istanbul-compatible JSON and LCOV output are required. The CLI currently blocks these at the standard coverage options, before Next metrics/shard/watch/profile semantics can be evaluated. The separate stable custom provider records real registration, initialization, worker collection, suite payload handoff, final generation/reporting and stop hooks; it is not classified as an undecided provider contract. |
| Reports, metadata, custom reporters, crashes and upstream CI blobs | `json-metadata`, JUnit parser/schema probe, `custom-reporter`, `reporter-crash`, built-in reporter contracts, upstream blob merge | Schema attributes and actual files are consumed. A custom reporter failure cannot make a run pass. Unsupported reporter adapters block their later callbacks. Next's own blob is not accepted as a substitute for an actual Vitest blob. |
| Debugging and editor/control interfaces | `debug-individual-test`, `editor-api-discovery`, collected-case listing, PTY filter, watch/snapshot gates | Debug body verifies its worker inspector and selected original test. The API flag is an explicit missing entry-point gate; it does not claim full existing editor RPC/run/rerun/cancel/update compatibility. The supported Next editor adapter/protocol still needs to be selected before a full integration fixture can target it. |
| Next route/request/normal-app fidelity | normal development app versus `route-rsc-fidelity` | A real dynamic route/request-header response is validated before invoking the route-aware RSC profile with the existing public render API. Current failure precedes rendering because routes are rejected. This does not fabricate a layout-aware API. |
| Next production mounting/hydration | normal production app versus `production-component-fidelity` | Build and start both use production conditions, stable project React and a real browser interaction before testing production component registration/mounting. |
| Reliability, ownership and cancellation | `repeated-resource-cleanup`, `cancel-body`, `cancel-beforeEach`, `cancel-fixture`, `cancel-finished`, crash/restart and watch probes | Twelve real runs check exited worker PIDs, removed run locks and owned compiler artifacts. Cancellation at four reached phases preserves snapshot bytes. Green ownership controls remain green; this finite corpus is not sustained platform/heap/handle qualification. |


## Additional interaction audit (October 14, 2026)

The follow-up audit adds 32 contracts instead of duplicating the existing 118
release probes. `added-contracts.json` lists their exact IDs. The reference
fixtures passed unchanged under pristine Vitest 5.0.4 with its published package
integrity; deliberate collection, teardown and unhandled-error fixtures require
exit 1 while retaining their reported cases. These are behavioral failures,
never an assertion that an API is absent.

| Remaining item | New contracts | Observable contract |
| --- | --- | --- |
| Executable configuration and shared helpers | `config-factory-mjs`, `config-factory-ts`, `config-factory-mts`, `config-factory-cjs`, `config-factory-cts`, `config-top-level-await` | Both runners load the same actual config file, factory, helper and Promise/TLA export. Test bodies assert config environment and provided values. |
| Configuration module/service lifetime | `config-service-lifetime` | A real config-owned HTTP server remains reachable from the isolated test. The temporary server uses an ephemeral loopback port and is owned by its runner process. |
| Public config helpers/defaults/merge | `config-merge-helper` | Identity helpers, array/alias precedence, `ssr.noExternal`, published defaults and discovery exports are inspected from `vitest/config`. This does not claim every Vite merge special case. |
| Provided-value transport | `provided-structured-values` | Date, Map and BigInt retain their types and values across the actual worker boundary. JSON coercion cannot satisfy the test. |
| Global setup/teardown and failures | `global-setup-teardown-order`, `global-setup-teardown-failure` | Setup precedes the body, two teardown forms run in reverse order, and teardown failure changes exit status after a reported passing body. Exact order bytes are validated in the reference and compared with Next. |
| Default utility ownership | `default-global-lifetime`, `default-env-lifetime`, `default-timer-lifetime`, `default-spy-lifetime` | Globals/env/clock/spies persist across cases under reference defaults until explicitly restored; default mock calls are cleared. These are separate from existing enabled-reset gates. |
| Configured reset interactions | `reset-option-mockReset`, `reset-option-restoreMocks`, `reset-option-unstubEnvs`, `mock-clear-retry-repeat` | Implementations, original methods and environment state reset at the promised boundary; calls reset on retries and repeats. |
| Remaining clock/wait semantics | `timer-pending-async`, `timer-next-async`, `wait-until-fake-clock`, `date-without-fake-timers` | Promise-created timers are observed at the correct drain boundary; waiting returns its truthy value; date-only mocking retains actual real timers and wall time. |
| Collection/lifecycle/context failures | `async-suite-rejection`, `context-retry-repeat-identity`, `fixture-teardown-failure`, `setup-failure-cleanup-order` | Collection errors retain their actual report, context/expect/signal identities survive retries/repeats, teardown failure retains a successor, and failed setup still reaches defined cleanup order. |
| Mock file isolation and production | `mock-cross-file-isolation`, `production-module-mock` | Concurrent selected files distinguish original versus mocked exports; production Node compilation preserves the same factory body. Browser/RSC gates already exist separately. |
| Snapshot retry and error/property semantics | `snapshot-retry-numbering`, `snapshot-error-property-matchers` | Real external snapshot bytes cover retry counters, error snapshots and asymmetric property matchers. |
| Unhandled error reporting | `late-unhandled-rejection` | A real unhandled rejection fails the invocation while preserving the passing case result; unsupported-option diagnostics cannot substitute for error evidence. |

The authoritative targeted run after the completed core release build reached
**32 new probes: 26 red and 6 green**, with zero invalid reference fixtures.
`added-contract-evidence.json` records each result. The six passing controls are
async collection rejection, parallel file mock isolation, snapshot retry
numbering, both async timer drain variants and fixture teardown failure. The
other 118 existing probes were not selected in this focused run; no definitions
were skipped or disabled. The combined suite now defines 150 runnable probes.
An earlier run overlapped a watch rebuild and temporarily lost built CLI files;
its three missing-module results are discarded, not recorded as compatibility
gaps. Final logs and reports are in
`/private/tmp/next-testing-new-gap-final.log` and
`/private/tmp/next-testing-new-gap-final-results.json`; per-contract data is in
`/private/tmp/next-testing-new-gap-final-evidence`. Root TypeScript, ESLint and
Prettier pass for the harness and added fixtures.

The existing requirement mapping above still covers declarations, mocking,
environments, browser rendering/watch, selection/sharding, coverage, reports,
editor/debug entry points, snapshot recovery, cancellation, resource cleanup and
normal-app fidelity. Later semantics blocked by an earlier public prerequisite
remain **unreached**, even though their runnable test body now exists. Passing
controls remain in the corpus and are not altered to make them fail.

This audit does not claim exhaustive conformance for every overload, modifier,
merge special case, clock/matcher method, task-controller field, report field or
cross-feature combination in the full inventory. The external platform,
downstream, editor protocol, route/layout/cache/action API, sustained reliability,
maintenance/canary and deferred performance gates listed below still need their
specified inputs or explicit contracts. They cannot honestly be converted into
an arbitrary failing test on this host.

## External fixtures, infrastructure and unsettled contracts

These are still release gates, but cannot honestly be replaced with an arbitrary
failing assertion:

- **Representative downstream repositories:** no downstream repositories or
  revisions were selected by the user. The suite exercises real published helper
  packages, but generated bodies are not unmodified existing repository suites.
  Node-library, monorepo, snapshot-heavy and CI integration migrations need
  pinned downstream source fixtures, their install steps and recorded allowed
  configuration translations. Missing config/environment adapters currently
  prevent qualifying their subsequent behavior.
- **Supported OS/Node/architecture/package-manager matrix:** this host supplies
  macOS ARM64 evidence only. Clean Windows/Linux and other advertised Node and
  architecture runners, npm/Yarn/pnpm package artifacts, and native binaries
  are required. POSIX process groups/PTYs cannot stand in for Windows ownership.
- **Firefox/WebKit:** this task has a Playwright 1.64.0 / Chromium 156 binary cache. Firefox and
  WebKit binaries and direct advertised-engine CI jobs are needed; no browser
  test is silently relabeled as multi-engine acceptance.
- **Full editor integration:** the Next-owned discovery/control/debug adapter or
  public protocol has not been chosen. A fixture cannot invent an endpoint or
  assert against Vitest's private controller and call that Next compatibility.
  The concrete entry-point, listing and inspector gaps above are executable.
- **Prerender/PPR, isolated Server Action transport, layouts and cache scopes:**
  the release requirements ask for explicit support decisions and application
  reference contracts. The existing public renderer exposes file cache scope
  and component subtree rendering. No isolated prerender/action/layout-aware
  invocation exists to target without inventing a new API. Route and production
  registration blockers are executable; the exact additional invocation and
  cold/warm/cache-sharing ownership contract must be defined first. Ordinary
  Next application/driver action transport must not be represented as an
  isolated action-renderer guarantee.
- **Dedicated benchmark providers and advanced APIs:** inventory
  and support decisions remain required. The regular-run benchmark diagnostic
  and standard coverage gates do not qualify dedicated benchmark provider projects. Stable custom coverage-provider registration and lifecycle are separately executable through `custom-coverage-provider`.
- **Sustained resource/reliability/platform qualification:** the finite reached
  cancellation/crash/watch/cleanup corpus is executable. Longer platform runs,
  compiler/server crash injection, memory/file-handle/port tracking and
  downstream canary duration need the corresponding runners and fixtures.
- **Release/support/maintenance ownership, documentation/scaffolding, canary and
  rollback:** these require owners, an agreed stable public range, selected
  canary consumers and an actual promotion/rollback mechanism. Text presence is
  not a behavioral test of those human/release decisions.
- **Performance:** the user explicitly deferred performance targets. No invented
  cold-start, warm-rerun, RSS or scaling threshold has been added as a red test.

No row here closes the authoritative stable release ledger or grants a supported
version range/exception. Read the per-contract evidence and failure stage when
triaging; many later semantics are intentionally blocked by a named missing
public prerequisite rather than falsely claimed to have been executed.


### Additional reset and facade identity checks

The suite now contains 152 runnable probes. The two additional unchanged-body
contracts compare both actual public runners:

- `vi-chain-identity`: reset, global/environment and clock utilities return the
  same public `vi` object; async timer operations resolve to that identity.
- `config-clearMocks-false`: an explicitly disabled automatic clear preserves
  file-owned call history across three ordinary cases.

The public declaration fixture also checks fluent calls retain mock generics,
async utilities return `Promise<typeof vi>`, and the private resource `dispose`
method is absent from the fluent API. Original reference expectations and the
historical baseline remain unchanged.


### Additional standalone clock checks

The suite now contains 154 runnable probes. `fake-frame-node` installs a Node RAF
provider before lazy clock creation and compares actual next-frame draining with
the pristine runner. It does not replace the jsdom/Chromium environment gates.
`fake-timer-loop-config` verifies project fakeTimers.loopLimit reaches an actual
infinite interval and produces the expected caught limit error. Both unchanged
bodies pass in the reference and Next. Historical baselines remain unchanged.

## Remaining-requirement audit: additional 23 contracts

The user-requested follow-up audit compares every row of the remaining release
ledger with the actual fixtures. It adds 23 previously unrepresented contracts,
listed in `uncovered-contracts.json`, to the existing generated suite. The suite
now defines 182 runnable probes. Test bodies, setup helpers, project factories,
serializers and application sources remain identical between the public runners.
The reference is pristine published Vitest 5.0.4; Next continues to own its
compiler and execution. No production files, original requirements or historical
baseline evidence were changed by this audit.

| Remaining ledger row | Executable coverage and additions | What the evidence can establish |
| --- | --- | --- |
| Imports and types | Existing public-config/subpath, globals, shared-helper, fixture-overload, context-type, matcher-augmentation, compiler-typecheck and in-source gates; new `custom-equality-testers` | Direct imports and the selected concrete type/helper contracts are executable. The custom equality extension applies recursively and through asymmetric matchers. This is not exhaustive overload or installed downstream-package qualification. |
| Declarations/lifecycle/fixtures | Existing concurrent/sequential/shuffle, async collection failure, around, worker/builder/scoped fixture, retry/repeat/context/listener/count/timeout gates; new `parallel-hook-order` | Hooks must start in the promised parallel order. Unsupported configuration is the present blocker; later lifetime and failure interactions remain unreached until that prerequisite passes. |
| Assertions and utilities | Existing clocks, waits, stubs, default/reset/retry/repeat and Chai/Testing Library gates; new `runtime-config-reset`, `dynamic-import-settled`, `custom-equality-testers`, `spy-temporary-implementation` | Actual runtime fake-clock configuration and reset, nested unreturned import settling, equality extensions and temporary asynchronous spy implementations have separate bodies. Passing spy semantics remain a positive control. |
| Module mocks | Existing hoisted/actual/runtime/auto/manual/spy/reset/package/CommonJS/cycle/alias/setup/file/RSC/browser/production gates; new `coverage-module-mock` | The additional body requires a mock to leave original application branches uncovered. Current standard coverage-option rejection blocks Next metrics before mock/coverage interaction can be assessed. |
| Snapshots | Existing filtered/CI/obsolete/error/property/retry/parallel/watch/cancel/crash gates; new `serializer-precedence`, `serializer-file-isolation`, `file-snapshot-read-update`, `snapshot-production-profile`, `snapshot-browser-profile` | Actual bytes include serializer priority, file ownership, arbitrary file snapshots and compiled external/inline source updates. Browser snapshots require the real browser realm. Crash recovery and later watch interactions remain open. |
| Environments/browser | Existing DOM/options/per-file/custom/Edge/Testing Library/Browser Mode/react/mock/watch gates; new `coverage-browser`, `snapshot-browser-profile` | The reference runs actual Chromium test bodies and outputs. Next's coverage options and browser environment currently block the respective later semantics. This does not qualify Firefox, WebKit or a DOM substitute. |
| Configuration/migration | Existing executable factories/TLA/services/globals/provide/global-setup/reset/order/settings/helper gates; new `external-project-configs`, `glob-project-configs`, `parallel-setup-files`, `config-discovery-exclusion`, `config-cli-retry-precedence`, `compiler-plugin-transform` | Real external async project factories use explicit shared roots, distinct setup state and provided context; explicit and glob entries are separate. Parallel setup reaches a shared barrier. Discovery excludes a module that must never evaluate. CLI retry overrides executable configuration. An actual Vite transform changes the tested export, exposing the missing compiler mapping instead of approving its rejection. |
| CLI/watch/CI | Existing defaults/list/name/file/changed/related/bail/retry/timeout/focus/shard/watch/PTY/cancel gates; new `config-cli-retry-precedence` and `empty-module-results` | Precedence and an actual zero-test module have runnable public CLI contracts. Existing watch and terminal gates cover concrete controls; they are not exhaustive redraw/color/resize/shortcut or incremental dependency qualification. |
| Coverage | Existing metrics/exclusion/unimported/threshold/JSON/LCOV/custom-provider gates; new `coverage-retry`, `coverage-failure`, `coverage-module-mock`, `coverage-production`, `coverage-browser` | Each reference uses real original-source coverage and standard reports, including failed execution with reportOnFailure. Next currently rejects the standard coverage flags before these metrics can be compared. Cross-shard, watch, cancelled and multi-compilation aggregation remains a later interaction matrix blocked by that prerequisite, not an independently observed failure. |
| Tooling/reports | Existing JSON metadata/JUnit/custom/crash/built-in/blob/list/inspector/API/PTY gates; new `empty-module-results`, `error-cause-report` | Empty modules retain the reference's result/exit policy. Nested causes and original source locations are required in actual output or machine-report diagnostics, because Next's JSON-only reporter need not also print human failures. Full editor integration still needs a chosen Next control adapter. |
| Next fidelity | Existing independent normal-app route/request and production mounting references, normal compiler/profile/omission suites; new production/browser snapshot and coverage bodies | These extend real compiler/profile contracts without using a Vitest compilation as the oracle for Next-only rendering. Route/layout/cache/action/prerender support and ownership decisions remain explicit prerequisites to additional isolated-renderer tests. |
| Adoption/release | Existing packed-consumer/omission/native acceptance, cancellation/crash/watch and repeated-resource gates | Synthetic fixtures cannot replace selected unmodified downstream repositories, additional OS/Node/architecture/package-manager/browser runners, sustained resource tracking or release/support/canary/rollback decisions. The existing external-gate list remains open. Performance targets remain deferred by the user. |

Independent project reports can finish in either order under the pristine
reference. Only the two new external/glob project contracts normalize their
case-array order; exact case names, counts, outcomes and per-project setup/provide
assertions remain required. Other existing contracts and all their expectations
retain their comparison behavior.

The audit does not turn unresolved support decisions or missing infrastructure
into arbitrary failing assertions. The table identifies concrete coverage,
blocked subsequent semantics and the external or unsettled gates separately.
The finite corpus is not a claim that every overload, controller field, terminal
byte or cross-feature combination in the compatibility inventory is qualified.

The final unfiltered run completed with **182 probes: 98 red and 84 green**, zero
skips and zero invalid reference fixtures. The 23 additions account for **16 red
and 7 green**; the original 159 probes retain **82 red and 77 green**. The seven
new positive controls are temporary spy implementation, discovery exclusions,
serializer precedence, serializer file isolation, file snapshots, mapped nested
error causes and production external/inline snapshots. No passing control was
changed to force a failure.

`uncovered-contract-evidence.json` records the exact result and current failure
stage of each addition, along with the five actual reference coverage reports.
The reference coverage validation verifies statement/function/branch maps,
unimported-file zero hits, exclusions and LCOV branch records for retry, failure,
module mocking, production and Chromium. Missing Next standard coverage flags
still block comparing these metrics under Next. Earlier reference setup mistakes
were corrected; their runs are discarded and are not counted as release gaps.

Root TypeScript, ESLint for the harness and all added fixture modules, and
Prettier pass. Authoritative full-run logs/results are
`/private/tmp/next-testing-uncovered-full.log` and
`/private/tmp/next-testing-uncovered-full-results.json`; per-contract evidence is
in `/private/tmp/next-testing-uncovered-full-evidence`. No stable exception,
performance budget or release requirement is approved by these results.


### Additional delayed import control

The suite now defines 183 probes. dynamic-import-settled-tla compares delayed
top-level-await modules and unreturned nested imports while the test clock is
faked. Its delay helper captures real timers before faking in both runners. A
CommonJS helper exports a permanently pending Promise; that value must not be
confused with pending module evaluation. The method resolves to void. Both public
runners pass the unchanged body. The original contract fixtures remain unchanged.


### Setup module evaluation controls

`parallel-setup-rsc-development` and `parallel-setup-rsc-production` require both
setup files to reach a shared top-level-await barrier before the test collects.
`setup-cjs-promise-node-production` and `setup-cjs-promise-rsc-production` verify
that a CommonJS setup exporting a pending promise finishes module evaluation
and retains its identity when imported by the specification. Each body runs
unchanged against pristine Vitest 5.0.4 and the real Next compiler.


### Compiler actual-import and hoisted-binding controls

Four additional contracts retain unchanged source under pristine Vitest 5.0.4
and the native Next compiler:

- `import-actual-only` checks that an actual import without any mock shares the
  ordinary static-import namespace and its exported object identity.
- `import-actual-tla-identity` checks concurrent and repeated actual imports,
  one original top-level-await evaluation, and the separate mocked namespace.
- `hoisted-aliased-destructured-spy` imports `vi as vitest`, a local utility name
  hoisted by the published reference, and shares a destructured spy between the
  hoisted helper, factory, static consumer and test body.
- `import-actual-partial-factory` spreads a literal actual import into a factory,
  preserving function/object identity and the reference's scalar snapshot: the
  original mutable counter advances while the factory's copied counter stays 0.

These controls extend the development Node/project-local ESM acceptance surface.
They do not qualify other profiles, external/CommonJS targets, setup-file mock
registration, dynamic requests, cycles or the full module-reset contract.

### Automatic module mock controls

`automatic-module-clone` and `automatic-module-import-target` check the same
source through string and literal `import()` targets. They verify deep object
clones, emptied arrays, class and function spies, shared export identities,
clearing/resetting tracked spies, top-level await, and repeated actual namespace
identity. The automatically mocked copy evaluates once; a subsequent actual
import separately evaluates the original, as published Vitest 5.0.4 does.
`automatic-module-default-options` and `automatic-module-false-spy-options` retain
those assertions with explicit `undefined` and `{ spy: false }` options.

These controls do not qualify manual mock discovery, `{ spy: true }`, dynamic
registration/reset, external/CommonJS/cyclic targets, setup-file mocking, or
additional environment/Next profiles. Original acceptance fixtures remain
unchanged and those stable requirements remain open until separately verified.

### Module spy controls

`module-spy-deep-state` and `module-spy-import-target` preserve original behavior
through string and literal `import()` targets with `{ spy: true }`. They verify
shared function identities, class and getter behavior, clear/reset/restore
semantics, copied mutable exports, top-level await, and separate actual-module
state and identity. `module-spy-package-alias` repeats those checks through a
package import alias and the imported `vi as vitest` utility alias.
`module-spy-manual-neighbor` proves that spy mode ignores a neighboring manual
mock and retains the actual target's behavior.

These controls do not qualify manual-mock redirects, direct namespace factories,
dynamic registration/reset, external/CommonJS/cyclic targets, setup-file mocking,
or additional environment/Next profiles. All original acceptance bodies remain
unchanged; those stable requirements still need their own verification.

### Manual module redirect controls

The `manual-module-live-namespace`, `manual-module-import-target`, and
`manual-module-package-alias` controls discover the adjacent `__mocks__` file and
preserve its exact namespace identity, live mutable exports, default function,
extra exports, dependency-relative imports, top-level await, and separate actual
module state. The alias control also uses the imported `vi as vitest` utility.
`manual-module-last-factory` and `manual-module-last-redirect` verify both orders
of an explicit factory and a manual redirect for the same target.

This slice still rejects compiler-only helpers inside manual files, dynamic
imports from earlier hoisted callbacks, manual mock cycles, symlink/directory or
external manual sources, and unsupported environment/Next profiles. Those are
remaining stable requirements, without approved exceptions. Original acceptance
fixtures remain unchanged.

### Controlled terminal environment

The ordinary-terminal PTY probes clear the agent flags recognized by pinned
Vitest 5.0.4/std-env 4.3.0 for both children. Inherited Codex flags otherwise make
the pristine reference deliberately execute once, so that environment cannot
qualify default interactive watch behavior. Original assertions and body sources
remain intact. Separate actual PTY controls retain agent detection, CI defaults,
and explicit `--run`; both public commands must execute the body once and exit.
