# Next test collector and lifecycle

This is an internal runner. It does not load application modules or
start Vitest/Vite. The emitted Next test entry must expose this module as its
`testRunner` namespace and resolve the Vitest facade to this same module instance.
The execution host calls `initializeTestFile`, `collect(loadTestModule)`, `run`,
and `dispose`. Isolated files require fresh evaluated realms; explicit serial
development Node cohorts retain one compiler closure and worker across files.

The supported authoring surface is `test`/`it`, `describe`/`suite`, `skip`,
`only`, `todo`, `fails`, `skipIf`, `runIf`, callback-name and callback-less todo
declarations, `test.each`/`test.for`, `describe.each`/`describe.for`, synchronous
and asynchronous suite declarations, `beforeAll`, `afterAll`, `beforeEach`,
`afterEach`, `aroundEach`, `aroundAll`, returned
setup cleanup, `onTestFinished`, `onTestFailed`, test timeouts, numeric retries,
and repeated execution. Declaration options support `skip`, `only`, `todo`,
`fails`, `repeats`, and inherited boolean `concurrent` settings. `test.concurrent` and
`describe.concurrent` schedule adjacent concurrent declarations together;
`concurrent: false` restores ordered children. Parameterized cases receive stable
individual declaration IDs and formatted names before focus, filtering, retries,
snapshots, or reporting. Hook order uses Vitest's default stack ordering. Setup
runs outside-in; teardown runs inside-out in reverse registration order. Cleanup
continues after individual failures and retains each error. Before-all failures
block descendants; after-all failures fail the file.
Suite hooks and their returned cleanup have separate assertion scopes, without a
case/attempt identity. Assertions finalize even when the hook fails or times out;
hook errors retain their phase. Snapshots require a real case and are rejected in
suite hooks. Disposing a setup hook's assertion scope preserves its spies across
cases until file disposal restores them.

`test.extend<T>()` supports static values and asynchronous `use` factories with
test/file/worker scopes and automatic fixtures. Factories resolve lazily from
object-destructured dependencies, including aliases and defaults. Dependencies
finish setup before their consumers, and teardown reverses that order. Test
fixtures are recreated for every retry and repeat; file fixtures live until the
file finishes. `test.override({...})` replaces known fixtures for the current
suite and descendants, can depend on the base fixture by its own name, and
inherits the original scope and automatic setting when omitted. A wider scope
cannot depend on a narrower scope or attempt context. Rest/nested/computed
destructuring and fixture options beyond `scope`/`auto` remain unsupported. The
stable additions below describe builder forms and worker lifetimes.

Other unsupported modifiers/options fail explicitly. The facade
exposes D's `expect` runtime and the verified spy, global/environment stub, and
fake-timer subset on `vi`. `expect.soft`, `expect.poll`, and attempt-owned custom
snapshot serializers are supported. Polling and every runner/parent deadline
retain captured real timers, so a case's fake clock cannot stall scheduling,
cancellation, or cleanup. Unsupported named exports fail during compilation.
There is no fallback to the actual Vitest runtime.

Each internal attempt context remains the resource owner for one retry. The
public test context, its local expectation instance and its signal retain case
identity across retries and repeats. Public methods dispatch through the current
attempt's asynchronous scope, so retained work cannot borrow another attempt.
Internal cleanup registration rejects registration after sealing. Assertion
integration begins before setup, finalizes after teardown, and disposes before
sealing. Raw failures remain local to the realm; the execution
host serializes C-originated case callbacks through the reporting contract. The
assertion runtime initializes before setup/spec collection and finishes during
file disposal, including collection failures. Snapshot I/O creates missing snapshots
locally and in watch, and remains read-only in CI unless updates are requested.
External, inline, and raw updates stage a coordinated byte set only; the
execution parent commits after clean worker exit and cleanup. Inline writes also
require the source hash captured across compilation, so a concurrent edit refuses
the entire plan. The historical stage-two implementation preserved every unchecked snapshot.
The stable policy below now prunes obsolete keys after complete selected execution;
custom snapshot environments remain unsupported. Public compiled execution uses
file-owned spies, stubs and clocks, with configured per-try resets as described
below. The private component isolation mode still restores attempt-owned resources
immediately; it is separate from the public Vitest defaults.

Node AsyncLocalStorage retains the originating collection, hook, attempt, or file
fixture context across asynchronous continuations. Scope tokens close after their
owned cleanup. A closed-scope API access fails with its original identity and is
recorded as a file failure even if another case catches it; it cannot borrow that
case's assertion state. The execution host's late-failure sink remains installed
through worker shutdown. File fixtures have file lifetime and never inherit the
first consuming attempt's identity.

A timeout initially poisons the realm. A timed-out body can release later cases
only after its actual returned work settles and its owned assertion, fixture,
cleanup and asynchronous scopes close. Unbounded work and hook/around deadlines
retain poisoning; timeout retry/repeat behavior remains release work. Every
deadline retains the interruption veto on snapshot publication even when later
cases safely run. JavaScript promise cancellation cannot stop uncooperative code.
The execution host must enforce its independent hard deadline and destroy the
worker. File disposal is idempotent after execution settles.

The focused corpus at `test/unit/next-testing-lifecycle` is pinned to Vitest source
revision `0780a8e5b7967a4168173599e9c74fb79aab2483`. It verifies component semantics,
not emitted compiler context fidelity or compatibility with all Vitest APIs.
The additional fresh-process cases execute C with D's actual assertion runtime
through the facade, including unawaited failures, retries, cleanup, and snapshots.
The `next-testing-stage2-api-compiled` acceptance fixture exercises the expanded
declarations and fixtures through real Turbopack-compiled entries and the public
runner.

## Historical stage-two compatibility inventory

Reference: Vitest source `0780a8e5b7967a4168173599e9c74fb79aab2483`,
`packages/vitest/src/runtime/runner/{hooks,run,context,types}.ts`, and
`packages/snapshot/src/{client,port/state}.ts`. The reused assertion, spy and
snapshot primitives were pinned to 5.0.1 at that stage. The table records that
historical implementation, including limits superseded by the additions below.
The current reference is Vitest 5.0.4; current bounded support is described by
[`capabilities.ts`](../capabilities.ts), not this historical table.

| Surface                       | Supported behavior and limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup registration            | The same `collect` callback awaits ordered compiled setup modules then the spec. Root hooks, `test.extend`, `expect.extend` and spies share one file realm. Assertions still require a case or suite-hook identity.                                                                                                                                                                                                                                                                                                                                                                           |
| Parameterized declarations    | `each` spreads rows into callbacks; `for` passes one row plus the supported test context. Array and tagged-template tables expand during collection, so every case has its own stable ID, formatted name, selection state, attempts, and snapshot name.                                                                                                                                                                                                                                                                                                                                       |
| Repeats and expected failures | Every repeat starts a new attempt identity and fresh test fixtures, with retries nested inside that repeat. `fails` listeners observe the real failure before the final expected-failure result is inverted; an unexpected pass fails with `Expect test to fail`.                                                                                                                                                                                                                                                                                                                             |
| Fixture overrides             | Object-form `test.override` is suite-scoped, rejects unknown names, preserves base access through a same-name dependency, and retains LIFO cleanup. Explicit scope or `auto` changes are rejected. Builder forms and worker scope remain unsupported.                                                                                                                                                                                                                                                                                                                                         |
| Failure listeners             | `onTestFailed(fn, timeout?)` and the context method run per failed attempt, in reverse registration order, after teardown and finished listeners. Listener failures accumulate and do not prevent remaining listeners. Passing/skipped attempts do not invoke them.                                                                                                                                                                                                                                                                                                                           |
| Listener context              | Receives the same supported `TestContext` as the test. Full Vitest task/result introspection is not implemented. The pinned implementation passes context, despite its older documentation example destructuring `errors`.                                                                                                                                                                                                                                                                                                                                                                    |
| Listener registration         | Registration from another finished/failed listener is rejected. Retained asynchronous scope guards remain active. Listener timeouts poison the realm and prevent retries/following execution.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Assertion lifecycle           | A checkpoint captures pending assertions/count errors after finished listeners, before failure listeners. Listener assertions remain active and their pending failures finalize once. This records the historical after-teardown count timing; the stable increment below moves counts before `afterEach`. Final assertion/spy disposal errors fail the attempt but do not re-enter failure listeners.                                                                                                                                                                                        |
| Snapshot update               | Explicit one-shot update supports route-less development/production Node, RSC, and browser profiles; watch `u` supports development Node/RSC. The child stages coordinated external, inline, and raw bytes. The parent owns final-success commit after worker cleanup and, for browser files, after browser/server disposal. Failed collection, final cases, cleanup, cancellation and known late failures cannot release a write plan. Failed retries may be superseded by a successful final retry. Files with no snapshots in final selected attempts do not produce normalization writes. |
| Snapshot retention            | All unchecked keys survive. No stale-entry pruning, even for full selection. Parent validates contained paths, the compiled inline-source hash, and every original byte before staging and again before replacement; concurrent edits reject the coordinated update.                                                                                                                                                                                                                                                                                                                          |
| Assertion utilities           | `expect.soft`, awaited `expect.poll`, attempt-owned serializers, global/environment stubs, and the documented fake-timer subset are restored at attempt disposal. Runner deadlines and polling use captured real time.                                                                                                                                                                                                                                                                                                                                                                        |
| Deferred APIs                 | Concurrent execution, shuffled or asynchronous suites, around hooks, broad timer compatibility, custom snapshot environments and broad task introspection remain unsupported. Static module mocking is separately compiler-gated; an untransformed `vi.mock` remains rejected.                                                                                                                                                                                                                                                                                                                |

`test/unit/next-testing-stage2-api` uses built `next/dist` modules in a fresh
process to check these components. Actual setup compilation and the authoritative
worker-pass-then-nonzero snapshot veto belong to B/A/L integration acceptance.

## Stable compatibility work

The selected stable reference is Vitest 5.0.4 at
`6a11cf66f99fa610b7364363d5ca42b66d994f40`. The historical stage-two inventory
above records the experiment's earlier scope and exceptions; those limitations
have not been approved as stable exceptions.

`aroundEach` and `aroundAll` wrap inherited test lifecycles and local suite
lifecycles, respectively. Registration order determines nesting independently of
`sequence.hooks`. Setup and teardown each have a hook timeout; the wrapped work
does not consume either phase's timeout. A continuation must be called exactly
once. Wrapper failures retain their own phase, and outer teardown still runs
after an inner failure. Around-each fixture dependencies stay alive through their
wrapper teardown; fixtures first used by the body are released earlier.
Suite wrappers accept file-scoped fixtures and reject test-scoped dependencies.
Existing realm poisoning after a timeout remains in force.

Returned before-each cleanup is published only if every inherited setup hook
completes. Before-all cleanup likewise requires its entire local setup group to
succeed. A failed after-each hook stops later hooks and returned setup cleanup;
framework-owned resource disposal still runs. Runner retry defaults apply when
a case has no override. Bail counts final failed cases after retries and expected
failure inversion, drains teardown, and retains unexecuted cases in reporting.
The empty-file option permits an empty root while nested empty suites still fail.

Builder fixtures now support `test.extend(name, valueOrFactory)` and the options
form, with matching `override` forms. Factories return their value and may register
one `onCleanup` callback. Test builders are recreated for retries and repeats;
file builders retain their file owner. Setup failures do not publish a cleanup
callback, and failed initialization can be retried without retaining a rejected
file-cache entry. Callback dependency metadata follows the original factory.

Extended test APIs expose fixture-aware `beforeAll`, `afterAll`, `beforeEach`,
`afterEach`, `aroundAll` and `aroundEach`. Suite hooks can resolve file fixtures
and suppress automatic test fixtures; requesting a test fixture there fails.
Builder types retain file/test scope information, while legacy object forms keep
the selected reference's broad type behavior and enforce scopes at runtime.
Suite overrides are resolved when a case or hook executes, including declarations
that precede the override. Successful root teardown releases file fixtures before
around-all teardown. The runner still attempts owned file disposal after a failed
suite teardown; complete failure-path equivalence remains release work, not an
approved compatibility exception.

Worker fixtures retain real execution-worker ownership. Explicit `isolate: false`
now shares that owner across serial development Node files through an immutable
compiler cohort, as described below. Broader profiles and fixture interactions
remain release work.

The facade now exposes Chai's `assert` API with scope-access guards, `assertType`,
and the pinned standalone `expectTypeOf` implementation. Public type contracts
include positive and negative assertions and typed mock inference. One-shot
`tsc` type-test files run through an owned consumer compiler with original AST
locations. Alternate checkers, watch/list/debug and full type-tooling conformance
remain unqualified.

Inline snapshot invocation locations are captured before assertion wrappers or
promise continuations, mapped using the execution host's immutable artifact,
and normalized with the pinned snapshot primitive. Compiled update/read tests
cover ordinary, property-matcher and resolved-promise assertions. External
snapshot headers match the selected reference. Snapshot pruning policy and the
rest of the stable lifecycle/fixture contract remain release work.

Async suite callbacks now retain collection context across awaits, including
nested and parameterized suites. Collection drains all registered jobs before
execution and retains rejected siblings. The unchanged-body 5.0.4 corpus verifies
suite ownership and outcomes. Concurrent cases and seeded ordering are supported
with the separate scopes and remaining interaction limits described below.

The public CLI now uses the reference's new-only snapshot mode for local and
watch runs, read-only mode in CI, and all mode for explicit updates. External,
inline, and file snapshot bytes and mismatch refusal are compared against 5.0.4.
The mode crosses the execution broker without weakening parent authorization.
Full read-only selections now fail on obsolete snapshots; full explicit updates
prune obsolete keys and remove empty managed snapshot files. Skipped snapshot
keys remain checked. Complete partial/focused updates preserve skipped and unselected test keys while
pruning obsolete selected and absent keys, including when selected tests no longer
call a snapshot matcher. Filtered read-only runs report unchecked keys without
failing solely because they are obsolete, matching published 5.0.4.
Publication failures restore earlier writes unless a user has edited the target;
in that case, the edit survives and original bytes remain in a recovery backup.
The earlier read-only/default, retention, and async-suite restrictions above are
historical.

Suite completion now publishes separate structural metadata and outcomes, including
empty suites and skipped/todo suites. A runnable empty suite fails, while skipped
and todo empty suites remain unexecuted. A nested after-all failure fails its suite
and ancestors without changing successful case results. Retry outcomes use the
final attempt of each repeat. Cancellation does not invent empty-suite failures.
Module collection exceptions report no cases, matching the pristine 5.0.4 runner;
already declared bodies are not executed. Name filtering also applies to todo
cases, so an unmatched todo becomes skipped in the reference-compatible counts.
The unchanged-body corpus compares these outcomes and suite totals. This does not
complete task introspection, collection timeouts, concurrency or the remaining
lifecycle compatibility matrix.

Assertion counts now finalize after setup and the body, before `afterEach`, fixture
teardown and finished/failed listeners. Cleanup assertions cannot satisfy a missing
body assertion or invalidate an already satisfied count. An existing body failure
or cooperative cancellation does not add a missing-count failure. Later pending
assertions and resource disposal remain observed. The pristine reference corpus
compares setup/body counts, late count declarations, both count APIs, finished
listeners, original failures, cleanup order and retries.

Expected-failure inversion now precedes numeric retry selection: an expected
failure succeeds on its first attempt, while an unexpected pass retries when
configured. Fixture cleanup and finished/failed listeners precede inversion, and
each repeat follows the same rule. The unchanged-body reference comparison
retains errors from unexpected passing retries and verifies actual attempt order.

Final case outcomes retain the last retry of each repeat, then fail if any repeat
failed. Worker file results and snapshot authorization use the same aggregation.
An earlier failed repeat cannot be replaced by a later passing repeat. Interrupted
or poisoned runs also cannot release snapshot writes, even when an expected-failure
modifier makes an individual timed-out case appear passed. This retains Next's
existing realm-poisoning policy; full timeout/isolation conformance remains open.

Soft matcher failures do not suppress missing-count failures. A rejected async
body/promise bypasses the count check, retaining its original failure. Standard
JSON follows the reference's single-level aggregate failure expansion; the full
aggregate diagnostic remains available in Next event evidence.

Runtime `context.skip()` now supports an optional note, a conditional boolean,
and calls from setup, bodies, test fixtures and test listeners. Only literal
`false` continues execution. A caught skip still marks the case skipped, and a
skip stops all remaining retries/repeats before expected-failure inversion.
Skip signals carry the reference's `VITEST_PENDING` code, task identity and note;
their class name is preserved through production compilation. Runtime skipping
requires its owning attempt, including conditional false calls.

The runner follows the reference's state transitions for soft errors and skip
signals. A skip thrown from `afterEach` stops the remaining suite hooks/returned
setup cleanup and defers test fixture teardown until after finished/failed
listeners. Framework-owned cleanup continues to release its resources. Standard
reports use the reference's final skipped outcome; Next event evidence retains
superseded body/cleanup errors and skip notes. Runtime skips can override an
already failed retry or repeat. This is distinct from a later passing repeat,
which still leaves an earlier repeat failed. Timeout/poisoned-realm interactions
remain subject to the existing interruption veto and require broader conformance.

Structured retries accept `count`, `delay` and a `condition` RegExp or predicate.
Conditions inspect the last processed failure after fixture cleanup, listeners
and expected-failure inversion, including one-level aggregate/array expansion.
A stateful RegExp retains its `lastIndex`; an empty aggregate retains earlier
attempt errors, and no available error prevents a retry. Delay uses captured real
timers, so fake timers cannot stall it, and cancellation releases the delay.

Published Vitest 5.0.4 removes function conditions from the collected task tree
before its RPC notification, which also removes them from worker execution. The
public Next file runner reproduces that measured behavior. Standalone lifecycle
predicates remain implemented and separately tested with the pinned serialized
error shape. The unchanged-body CLI corpus explicitly proves function predicates
are not invoked in either public runner; this is target-version behavior, not a
claim that the advertised predicate filtering works in the published CLI.

Thrown arrays expand into separate failures, as in the target runner. Standard
JSON preserves bare messages for failures without an error name or saved stack,
including primitive throws. Next event diagnostics retain their structured phase.

### Independent assertion instances

`createExpect()` creates its own matcher state and counters. A test's
`context.expect` lazily creates an instance bound to that test; fixture context
copies preserve its getter without reading it. Assertions from every instance
use the current attempt's asynchronous assertion queue and snapshot owner.
Bound instances reject access from another test or a closed asynchronous scope.

For published Vitest 5.0.4 parity, accessing `context.expect` selects its state
for runner assertion-count checks. Manual instances are not selected by the
runner. Global counters reset for each try; a test-local instance retains its
counters and assertion-count declaration across retries and repeats. The
unchanged `local-expect.case.mjs` body checks that behavior against the separately
installed published runner, including fixture setup and lazy context access.

### Task/context metadata and annotations

A test context exposes its stable public task, file and suite graph. Root tests
have no `task.suite`; their file owns them directly. Task metadata remains mutable,
and live results expose processed errors, hook state, retry/repeat indices and
final outcomes. Error serialization uses copies so task introspection cannot
change the raw assertion values used by diagnostics. Public `Assertion` and
`AsymmetricMatchersContaining` interfaces support the pinned augmentation forms,
including chained assertion modifiers.

Declaration `tags` and `meta` are supported. Project `tags` definitions supply
options/metadata with the published priority ordering; suite tags inherit and
are deduplicated, while task metadata merges tag, parent suite and own values in
that order. Project `strictTags` checks declarations against those definitions.

`context.annotate(message, type?, attachment?)` and its attachment overload
record awaited or unawaited annotations in the owning attempt. Annotation failures
are observed before completion, while explicitly handled failures stay handled.
Annotations require the task's running state and reject retained/finished owners.
Compiled locations come from the immutable artifact's original source maps.
Local attachment files are copied to `attachmentsDir` (default
`.vitest/attachments` under the project); inline string/binary bodies and HTTP(S)
URLs retain the reference representation. Original annotation objects stay in
`task.annotations`, and worker events retain annotation/attachment/location data.

The test signal stays live after ordinary success/failure and is shared across
retries/repeats. Timeout and run cancellation still abort it; closed asynchronous
scope guards and process/resource ownership remain independent. Access to the
regular-run `bench` context function produces the pinned diagnostic. Dedicated
benchmark execution/provider support remains release work.

The unchanged `task-context.case.mjs` body compares task identity/history,
configured tag priority/inheritance, retained files and inline/URL annotations,
source locations, finished/failed listener state and signal lifetime against the
pristine published 5.0.4 runner. This does not qualify every task/controller field,
context identity interaction, editor API or custom artifact/provider contract.

### Public utility lifetime and configured resets

The public compiled runner now uses file lifetime for spies, clocks and global/
environment stubs. They survive ordinary case, retry and repeat completion until
explicit restoration or final file disposal. Before every try, configured reset
options run in the pinned order: restoreMocks, mockReset, clearMocks, unstubEnvs,
then unstubGlobals. clearMocks defaults to true; the other flags default to false.
Assertion counters/queues and retained callback guards still own each attempt.
Collection and suite hooks share the file utility state.

The private assertion runtime retains its explicit attempt-ownership mode for
component isolation tests. The fresh-process assertion integration corpus opts
into that mode to keep testing immediate disposal and sealed-owner safety. This
is not a public configuration switch or the public Vitest lifetime default.

sequence.hooks accepts stack or list. The selected order applies to same-suite
after hooks, returned setup cleanups, and finished/failed listeners; nested suite
teardown still runs inside-out. sequence.setupFiles list uses ordered compiled
setup loading. Parallel hook/failed-listener/returned-cleanup groups now share a bounded file budget
(default maxConcurrency 5) while retaining nested suite boundaries. Public setup
loading defaults to list, with explicit parallel setup supported.

Reset and utility methods return the public vi facade, including async utility
results, without exposing the private resource dispose method. Remaining timer
operations, callback/fixture interactions and complete upstream types still need
independent conformance evidence.

### Standalone fake clock and waits

The public clock delegates to the independently bundled patched fake-timers
15.4.0 engine used in published Vitest 5.0.4. The Next-owned timer class adapts the
pinned implementation without loading Vitest/Vite. Clock creation is lazy, so
registered global timer/RAF providers are captured at the same point. Standard
fakeTimers project settings merge with per-call options. Microtasks, async drains,
next-timer/frame advancement, tick modes, Date-only mocking and real-clock
observation use the pinned clock behavior. Child-process workers reject nextTick
faking; profile/pool expansion remains separate work.

waitFor and waitUntil advance an active fake clock while keeping their polling
and deadline timers real. Generic waitUntil types exclude falsy results. Closed
scopes cannot borrow later attempts; pending polling/deadline resources are owned
and cancelled at utility disposal. Broader callback, environment and unawaited
operation interactions still require their independent release evidence.

### Snapshot error matchers and configured serializers

The error snapshot matchers capture thrown Error and primitive values and support
promise modifiers. Inline error assertions capture their original call site before
wrappers or promise continuations. Paired compiled fixtures compare inline and
external snapshot bytes against published 5.0.4.

Configured snapshotSerializers load in configuration order before ordinary setup
modules through the actual Next compiler graph. Relative and package-import
references use project resolution in Node and RSC compiler contexts. Public
serializer registration persists through file execution and is removed at file
disposal. The private component assertion mode retains bounded attempt ownership.
Native test-entry setup ABI 2 carries serializer modules explicitly and rejects
older bindings when serializers are requested.

The compiler provides an inert vitest/config alias for supported configuration
helpers and public defaults. It does not instantiate a Vitest controller.
Durable snapshot crash recovery, broader custom environment/serializer cases and
remaining watch policy interactions still require their release acceptance gates.

### Runtime utilities and equality extensions

setConfig shallowly updates a file-owned runtime configuration object; resetConfig
assigns the shallow snapshot captured by the first mutation. These methods return
void. Clock settings are read when installing the clock, mock-reset flags before
each try, polling settings when creating a poll, and test/hook defaults when
registering declarations. Concurrent resource interactions remain under qualification;
console/controller and broader runtime configuration interactions still require
independent conformance.

addEqualityTesters uses the pinned shared registry for recursive, asymmetric and
custom matcher comparisons, including independent expectation instances. File
disposal removes only owned registrations, preserving earlier entries.

dynamicImportSettled uses the compiled entry's actual Turbopack context. A file
owns loader descriptors for chunk/on-demand and external ESM loads and observes
asyncModule evaluation promises in that context's module cache. Repeated real
turns include unreturned nested imports and work under fake timers. A CommonJS
module exporting a pending Promise does not imply pending evaluation. File
cleanup restores owned loader descriptors and cancels settling timers/waits.
The ordinary application templates do not install this test-only adapter.

### Parallel hooks and compiled setup

sequence.hooks accepts parallel in addition to stack/list. Before/after hooks,
returned cleanup functions and failed listener groups use the file's
maxConcurrency budget. A queued hook starts its timeout when it acquires a slot.
Finished listeners always use stack order in published 5.0.4.
Nested suites retain parent-before-child setup and child-before-parent teardown;
parallel work inside one group does not reorder those boundaries. Native
Promise.all retains first-rejection behavior, and remaining owned hook work is
observed before releasing file fixtures/publication. Full delayed-failure, timeout,
skip, retry and concurrent-case interaction matrices still require qualification.

The Node/RSC templates accept list/parallel setup selection. The native compiler
emits actual setup module imports, with configured serializers awaited first.
Public execution defaults to list, matching 5.0.4, awaiting each module in
declaration order. Explicit parallel starts the modules together. The native binding reports test-entry setup ABI 3,
and the compiler rejects older bindings when parallel loading is requested.
The parameterless private template call retains its earlier list default.

Setup and specification collection now have an explicit assertion scope. Ordinary
expect calls run during module evaluation, and collection finalization drains
tracked async assertions before sealing that scope. Case counters are reset
before execution. Collection serializers and stubs retain file ownership; retained
closed-scope access still fails with its original collection identity. Snapshots
continue to require a test owner. The default-order controls include real setup
assertions in development Node and production Node/RSC.

### Concurrent scheduling and asynchronous assertion owners

Adjacent children with the same concurrency flag form a group. Concurrent groups
have a bounded sibling budget; a separate file-wide leaf-case budget bounds active
tests across nested groups. Sequential groups await each child, including its
cleanup, before starting the next. Test retries remain serial within their own
case and retain independent fixtures, public context and internal attempt owners.
Suite teardown waits for every child even after an unexpected host error.

Assertions now retain a registry of actual asynchronous owners instead of a
single active slot. Concurrent local expectations retain separate counters and
promise/check queues. Retained matchers and closed asynchronous work still fail
with their original scope; another live test cannot lend them assertion state.
Around-all scopes suspend while inner work runs and verify their own asynchronous
descendants are disposed before resuming, while unrelated sibling owners may
remain active. Ancestors come from captured AsyncLocalStorage parents.

As in published 5.0.4, local `context.expect` supplies isolated concurrent counts;
the global expectation's state is shared. Broader concurrent snapshot, timeout,
resource mutation, cancellation and hook failure interactions still require
independent release qualification. This increment does not qualify shuffled
execution, worker sharing or the full upstream concurrency matrix.

### Seeded sequence settings

`describe.shuffle` and the boolean suite `shuffle` option inherit through nested
suites. A nested explicit false preserves its child order. The pinned scheduler
partitions concurrent/sequential boundaries first. Inside each sequential group
it shuffles the nested-suite/direct-test buckets, then each bucket, restarting the
same seed for every operation. Concurrent groups retain declaration order.

Project `sequence.concurrent` supplies the leaf-test default; explicit false in a
suite or test overrides it. The published 5.0.4 API has no `sequential` modifier.
Chain modifiers take precedence over an opposing explicit option.

Configuration accepts seed, concurrent and boolean/object shuffle settings.
The root configuration owns the seed and file-order flag; project settings can
choose their own test order. A seed of zero, a negative value or a fraction is
preserved. When omitted, the invocation captures one real-time seed. File shuffle
happens once at the actual file-worker lease boundary, so isolated compiler
handoffs do not shuffle an already shuffled input again. Multi-project grouping,
custom sequencers, watch seed lifetime and the wider sequence matrix remain
independent release work.

### Static discovery and explicit runtime collection

`next test --list` displays selected files. Default `--list --json` parses
declaration syntax through the native SWC parser without evaluating configured
global setup, setup or specification modules. It preserves literal/expression
names, parameter placeholders, explicit project names, original UTF-16 locations
and cross-file focus across selected files before applying name filters. Tables
and conditions remain syntax rather than evaluated values. Configuration still
loads in its isolated retained realm; custom application transforms and
re-exported declaration helpers are not applied during static discovery.
Complete transform, project/focus and source-location parity remain unqualified.

Static parse errors and forbidden focus with `allowOnly:false` withhold public
JSON. `--list --json --staticParse=false` explicitly evaluates configured global
setup, setup and test modules through the Next compiler and owned file worker.
Hooks, fixture factories and test bodies do not run; this path publishes name/file
facts without the static path's location/project metadata. Runtime listing still
rejects focused trees with `allowOnly:false`, including focus inside a skipped
suite, until the pinned failed-task projection is modeled. Ordinary no-focus CI
collection remains supported.

Successful runtime name/file facts remain separate from execution outcomes and
are published only after worker, process group, cache, compiler, configuration
and run-lock cleanup. Collection-only assertions skip snapshot
setup/finalization, summaries and staged publication while still restoring their
owned resources.

### Isolated execution worker fixtures

Worker-scoped object and builder fixtures have an explicit execution-worker owner.
Its cache uses the actual fixture-definition owner and registration identity. A
derived extended test API has a distinct owner, matching the pinned reference.
Retries/repeats and concurrent cases within one declaration reuse its worker value. Worker factories and their cleanup run in a separate asynchronous
scope, without borrowing the first consuming attempt. Worker fixtures can depend
only on worker fixtures; file fixtures can depend on worker fixtures, and test
fixtures can depend on all three scopes. Scope and automatic-option override
validation remains unchanged.

The default scheduler starts one isolated process per file. That process owns the
worker phase independently: file fixtures finish during execution, while worker
fixtures drain in reverse dependency order during host disposal, before assertion
resource restoration and snapshot publication. Cleanup failures drain remaining
worker fixtures and fail disposal; retained closed worker continuations retain
that worker identity and veto publication. The parent process deadline remains
responsible for terminating uncooperative worker setup or cleanup.

The public declarations model `$worker` values and worker-to-file dependencies,
and builder contexts exclude narrower scopes. Focused reference proofs include
the unchanged single-file worker fixture and fixture-overload contracts. This is
the foundation for isolated file workers and the serial development Node shared
cohorts below. It does not qualify the full worker/profile, watch, Browser Mode
or fixture-type interaction matrix.

### Shared-worker runtime and public cohorts

`initializeTestWorker` owns one fixture owner across sequential file collectors.
Cached extended declarations, bound hooks and parameter tables dispatch to its
currently collecting file while preserving actual fixture-definition ownership.
New declarations still require that file's collection scope. A closed earlier
collection, hook, attempt or file-fixture continuation rejects with its original
identity, even while a later file is active. Raw process rejections use an
origin-owned asynchronous sink; unknown origins poison the worker without
borrowing the next file. Errors retain their raw identity and first-file routing.

File utilities/assertions finish separately. Staged snapshots cannot be taken
until all file disposal and final worker-fixture cleanup succeed. Interrupted
execution, unexpected runtime/collection errors, cleanup failures and late owners
retire the worker and veto every file's staged writes.

The public scheduler connects this runtime to one immutable native compiler
cohort and a parent-owned worker for serial development Node `isolate:false`
files. The original cross-file fixture bodies pass with one shared fixture
initialization. Setup, serializers, mocks, coverage, inspection, collection,
custom realms, in-source/type-test entries and broader profiles remain outside
this bounded shared-worker execution path.


### Runtime factory registration for isolated Node entries

Direct imported `vi`/`vitest` calls to `doMock` and `doUnmock` support literal
project-local leaf ESM targets in one isolated development Node file. Inline
factories stay at their original call site, retain lexical variables and run
lazily. Their initial export shape requires statically named object keys. Future
direct dynamic imports share the current factory result; replacement or
unregistration leaves already held namespaces intact. `resetModules` resets
actual module evaluations while preserving registrations and cached mock results.
The returned `Symbol.dispose` callback unregisters within the owning file.

The native compiler supplies target and entry identities from the actual module
graph. Dispatch delegates to the emitted asynchronous loader and normal native
importer. Mocked imports do not evaluate the actual target. Pending factories are
included in `dynamicImportSettled`; unfinished factory disposal vetoes publication.
An asynchronous continuation retains its originating scope and failure sink
across loader and factory awaits. Closing a file restores its owned loader binding.

Computed/nonliteral requests, import attributes, foreign user importers,
transitive user targets, CommonJS/external/symlink targets, queries/fragments,
non-inline factories, computed/accessor/spread export shapes, `then` exports and
prototype mutation remain unsupported. Static/hoisted mock mixtures, setup,
serializers, coverage, custom realms, in-source entries, inspectors, shared
cohorts, RSC/browser and production profiles require separate qualification.
These initial boundaries do not remove their stable release requirements.


### Named ESM consumers of a CommonJS spy

An isolated development Node entry can use `vi.mock(literal, { spy: true })`
for one project-local leaf CommonJS implementation. Turbopack's actual static
CommonJS export table certifies each name, and its unspecialized ESM import
references certify direct named consumers before namespace optimization or dead
code removal. The automatic spy reads the real compiler-owned original namespace
and retains function behavior and mock call state. No export names or module IDs
are inferred from paths or source text.

Default, namespace, reexport, dynamic and require consumers, unknown/dynamic
export tables, `__esModule` interop, helper graphs and cycles remain unsupported.
This slice also rejects factories/value mocks, setup, serializers, coverage,
custom realms, in-source entries, inspectors, shared cohorts, RSC/browser and
production profiles. These boundaries leave the broader stable requirements open.

### Current profile, watch and coverage qualification

The current static mock profile bounds are recorded in
[`capabilities.ts`](../capabilities.ts). Development Node also supports one
compiler-certified static ESM original cycle: deferred evaluation keeps existing
pending ancestor bindings while preserving new members' own awaits, namespace
identity and lazy fully mocked originals. Multiple mocked targets, dynamic-only
cycles, manual/setup layers and competing actual imports remain unqualified.

Development Node/RSC watch and bounded serial development Chromium client
watch retain fresh execution and parent-owned browser/application resources.
Standard V8 coverage is qualified for syntax-preserved JavaScript in development
and production Node and development Chromium clients. Explicit standard flags
also support development Node/client watch with per-entry replacement; RSC,
production client coverage and production watch remain unqualified. Type-erasure
TypeScript standard coverage is qualified for development/production Node with
uniquely associated authored declarations and real V8 counters, including proven
direct variable-arrow bindings. The converter checks binding, initializer,
parameter and body mappings while retaining the compiler's stack/error map.

Parent-selected untouched typed sources compile through the same native Node
profile without evaluation. Their distinct declaration facts contain zero hits;
publication requires exact agreement with runtime descriptors and unchanged
selected sources, checked config files and supported config filename inventory.
Arbitrary Next config import dependencies, custom TypeScript config paths, other
arrow forms, runtime-generating TypeScript and JSX remain unqualified. Ambiguous
or incomplete associations fail before publication. Named TypeScript watch
coverage has initial, added-file and full-rerun comparisons under both default
and retained coverage. The historical bare line-coverage mode has separate bounds.

Serial Chromium files send their immutable declaration manifest before execution.
The parent recomputes selection, accepts one active case at a time, requires every
declared case and suite to finish, and checks explicit setup-blocking facts before
accepting skipped descendants. Suite teardown failures cannot supply those facts.

Browser continuation controls cover native Promise awaits, ordinary final-return
object identity/getter counts, sampled microtask ordering and exact mapped
post-await errors. Awaited Proxy values can still trigger observable prototype
operations, including a trap that native await never invokes. Final
callable-thenable bodies can still lose their originating
scope and remain a release blocker. These focused results do not establish full
Promise/thenable, browser-engine or platform compatibility. See the recorded
implementation checkpoints in
[`NEXT_TESTING_STABLE_PROGRESS.md`](../../../../../../NEXT_TESTING_STABLE_PROGRESS.md).
Stable readiness remains false; focused batches do not replace full-corpus and
release qualification.
