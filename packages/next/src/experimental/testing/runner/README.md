# Next test collector and lifecycle

This is an internal, sequential runner. It does not load application modules or
start Vitest/Vite. The emitted Next test entry must expose this module as its
`testRunner` namespace and resolve the Vitest facade to this same module instance.
The execution host calls `initializeTestFile`, `collect(loadTestModule)`, `run`,
and `dispose`. Each file requires a fresh evaluated realm.

The initial supported authoring surface is `test`/`it`, `describe`/`suite`,
`skip`, `only`, `todo`, `skipIf`, `runIf`, synchronous suite declarations,
`beforeAll`, `afterAll`, `beforeEach`, `afterEach`, returned setup cleanup,
`onTestFinished`, `onTestFailed`, test timeouts, and numeric retries. Hook order uses Vitest's
default stack ordering. Setup runs outside-in; teardown runs inside-out in reverse
registration order. Cleanup continues after individual failures and retains each
error. Before-all failures block descendants; after-all failures fail the file.
Suite hooks and their returned cleanup have separate assertion scopes, without a
case/attempt identity. Assertions finalize even when the hook fails or times out;
hook errors retain their phase. Snapshots require a real case and are rejected in
suite hooks. Disposing a setup hook's assertion scope preserves its spies across
cases until file disposal restores them.

`test.extend<T>()` supports static values and asynchronous `use` factories with
test/file scopes and automatic fixtures. Factories resolve lazily from plain
object-destructured dependencies. Dependencies finish setup before their consumers,
and teardown reverses that order. Test fixtures are recreated for retries; file
fixtures live until the file finishes. A wider scope cannot depend on a narrower
scope or attempt context. Overrides, worker scope, destructuring aliases/defaults/
rest, fixture options beyond `scope`/`auto`, and alternate callback forms are
explicitly unsupported in this increment.

Other modifiers/options fail explicitly, including concurrent, sequential,
parameterized, failing, repeated, and shuffled tests; async suites; around hooks;
and type assertions. The facade exposes D's `expect` runtime
and `vi.fn`, `vi.spyOn`, `vi.isMockFunction`, `vi.clearAllMocks`, `vi.resetAllMocks`,
and `vi.restoreAllMocks`. Module mocking, `expect.soft`, `expect.poll`, and custom
snapshot serializers remain explicitly unsupported. Unsupported named exports fail
during compilation. There is no fallback to the actual Vitest runtime.

The attempt context is the sole identity and resource owner for each retry. It
provides a signal and LIFO cleanup registration, which rejects registration after
sealing. Assertion integration begins before setup, finalizes after teardown, and
disposes before sealing. Raw failures remain local to the realm; the execution
host serializes C-originated case callbacks through the reporting contract. The
assertion runtime initializes before setup/spec collection and finishes during
file disposal, including collection failures. Snapshot I/O is read-only by default. Explicit updates stage bytes only; the execution parent commits after clean worker exit and cleanup. Every unchecked snapshot is preserved, including skipped, focused-out, absent and partially exercised tests. Pruning, inline snapshots and custom snapshot environments are not public update capabilities. Spies
created by an attempt are restored and calls cleared after that attempt; file and
suite-hook spies survive across cases and are restored at file disposal. This
does not implement Vitest's configurable mock reset defaults.

Node AsyncLocalStorage retains the originating collection, hook, attempt, or file
fixture context across asynchronous continuations. Scope tokens close after their
owned cleanup. A closed-scope API access fails with its original identity and is
recorded as a file failure even if another case catches it; it cannot borrow that
case's assertion state. The execution host's late-failure sink remains installed
through worker shutdown. File fixtures have file lifetime and never inherit the
first consuming attempt's identity.

A timeout poisons the realm: remaining cases are cancelled and no retry starts.
JavaScript promise cancellation cannot stop uncooperative code. The execution host
must enforce its independent hard deadline and destroy the worker. Cooperative
cleanup is still attempted. File disposal is idempotent after execution settles.

The focused corpus at `test/unit/next-testing-lifecycle` is pinned to Vitest source
revision `0780a8e5b7967a4168173599e9c74fb79aab2483`. It verifies component semantics,
not emitted compiler context fidelity or compatibility with all Vitest APIs.
The additional fresh-process cases execute C with D's actual assertion runtime
through the facade, including unawaited failures, retries, cleanup, and snapshots.
Real Turbopack compiled-entry execution remains a separate acceptance gate.

## Stage two compatibility inventory

Reference: Vitest source `0780a8e5b7967a4168173599e9c74fb79aab2483`,
`packages/vitest/src/runtime/runner/{hooks,run,context,types}.ts`, and
`packages/snapshot/src/{client,port/state}.ts`. The reused assertion, spy and
snapshot primitives are pinned to 5.0.1 in Next's package. This inventory describes
the bounded Next implementation; it does not advertise the entire Vitest API.

| Surface | Supported behavior and limit |
| --- | --- |
| Setup registration | The same `collect` callback awaits ordered compiled setup modules then the spec. Root hooks, `test.extend`, `expect.extend` and spies share one file realm. Assertions still require a case or suite-hook identity. |
| Failure listeners | `onTestFailed(fn, timeout?)` and the context method run per failed attempt, in reverse registration order, after teardown and finished listeners. Listener failures accumulate and do not prevent remaining listeners. Passing/skipped attempts do not invoke them. |
| Listener context | Receives the same supported `TestContext` as the test. Full Vitest task/result introspection is not implemented. The pinned implementation passes context, despite its older documentation example destructuring `errors`. |
| Listener registration | Registration from another finished/failed listener is rejected. Retained asynchronous scope guards remain active. Listener timeouts poison the realm and prevent retries/following execution. |
| Assertion lifecycle | A checkpoint captures pending assertions/count errors after finished listeners, before failure listeners. Listener assertions remain active and their pending failures finalize once. This retains Next's existing after-teardown count timing; Vitest's runner checks counts before `afterEach`. Final assertion/spy disposal errors fail the attempt but do not re-enter failure listeners. |
| Snapshot update | Explicit one-shot update or watch `u` command; child stages bytes and parent owns the final-success commit after worker cleanup and, in watch mode, generation cleanup. Failed collection, final cases, cleanup, cancellation and known late failures cannot release a write plan. Failed retries may be superseded by a successful final retry. Files with no snapshots in final selected attempts do not produce normalization writes. |
| Snapshot retention | All unchecked keys survive. No stale-entry pruning, even for full selection. Parent validates the default path and original bytes and uses atomic replacement; concurrent edits detected before replacement reject the update. |
| Deferred APIs | Concurrent/parameterized/failing tests, fake timers, soft/poll assertions, inline/raw snapshots, custom serializers and broad task introspection remain unsupported. Static module mocking is separately compiler-gated; an untransformed `vi.mock` remains rejected. |

`test/unit/next-testing-stage2-api` uses built `next/dist` modules in a fresh
process to check these components. Actual setup compilation and the authoritative
worker-pass-then-nonzero snapshot veto belong to B/A/L integration acceptance.
