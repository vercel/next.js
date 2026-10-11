# Wave-six independent validation: core and shutdown gates passed

Validated on 2026-09-16 atop accepted wave five with native v1 preserved.
Aggregate SHA-256: `a97f134999dcc1f7fff0970e9959f3dc0b91c8b474afb1d6776ce0e55fff494e`.
Hash/apply check passed. No dependency or native change. Actual CLI native loads
were audited against `495503637921907503a86a617e35744846045cd344ceb88ff0004b6292df3949`.
This batch is D7 + final C5 + B9 v1 late sink + E12 normalized observer.

| Check                                                   | Result                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Core build/types                                        | Passed, 22.88s                                                                                     |
| Five affected D/C/B/E focused suites                    | 79/79 passed, 3.835s                                                                               |
| Unchanged canonical unit/lifecycle/assertion CLI corpus | 3 files / 3 final cases passed, exit 0; previous afterAll failure resolved                         |
| Normalized canonical render CLI                         | 3/3 passed, exit 0, 4.878s                                                                         |
| Seven caught stale APIs across scopes                   | Expected file failure/exit 1; both completed cases remain passed; seven original-scope diagnostics |
| Caught late hook callback at disposal drain             | Expected file failure/exit 1; completed case remains passed                                        |
| Instrumented real-worker terminal IPC callback          | Passing payload sent, then worker exit 1; parent rejects stale success and fails file              |
| Fixture ESLint/format                                   | Passed                                                                                             |

## Unchanged compatibility corpus

`--project reference-conformance --run` runs the original three corpus files.
No lifecycle, unit or assertion expectations were weakened. The retry case still
fails twice then passes, and root `afterAll` validates its cleanup/attempt totals.
The reporter retains the two failed-retry diagnostics while final file/case
outcomes correctly pass. Snapshot writes remain disabled.

## Actual normalized renderer

`--project reference-render --run` now checks normalized server text, including
the nested async server-only child's `server sum: 10`, for concurrent alice/bob
renders and a repeated alice render. It finds one client boundary with props
exactly `{ initial: 10 }`.

The expected Counter identity is resolved from the actual initialized client
manifest using the imported server reference's `Counter.$$id`: exact-key lookup
first, then last-`#` module/export resolution, following the real Flight encoder.
The observed candidates must contain that exact manifest module ID and export
name. This does not infer identity from a path substring or assume aliases have
one unique wire identity. Existing file-cache/after checks and precise invalid
serialization rejection still pass. Observed text excludes client rendering;
this remains a server-subtree observation, not DOM, HTML or hydration evidence.

## Deterministic late-access regressions

The three new `conformance/late-*.case.mjs` files are intentionally failing
fixtures, excluded from the default positive project selections. To run one,
temporarily select that exact file in an explicit development RSC project; the
validation harness restored canonical JSON in `finally` after each run.

`late-scopes.case.mjs` creates a deferred gate in the file, schedules callbacks
under the originating hook/attempt, and releases them from a later case. It
catches all seven errors: hook assertion, cached spy API, cached clear API,
cached mock mutator, earlier-attempt assertion, retained assertion chain, and
cached matcher method. Each error must retain its original hook or named attempt
identity. The later case requires exactly three assertions, checks that its mock
call history is intact, and sees the unchanged setup spy value. Both cases pass;
the file nevertheless fails from the seven late diagnostics. Thus old callbacks
do not satisfy later assertion counts or revise completed case outcomes.

`late-disposal.case.mjs` schedules a caught assertion via `setImmediate` in
`afterAll`. The real worker's final turn runs it after the hook scope closes;
its late sink fails the file while the earlier case stays passed.

`late-terminal-ipc.case.mjs` is explicitly an **instrumented worker transport
regression**, not an ordinary authoring example. Inside a case it captures an
`AsyncResource.bind` callback and wraps the real `process.send`, forwarding the
original send before invoking the caught callback on the terminal `complete`
message. The log proves the forwarded payload status was `passed`. The late
closed-attempt access then makes the worker exit 1; B waits for process close and
fails the file instead of trusting the already-sent success. It retains both the
original scope diagnostic and the process-exit failure. The prior case remains
passed. This uses the real compiled entry and B worker, not a replacement worker.

Logs under `/tmp/next-testing-L-wave6`: `-build.log`, `-unit.log`,
`-conformance-cli.log`, `-observer-cli.log`, `-late-scopes.log`,
`-late-disposal.log`, `-late-terminal-ipc.log`, and `-fixture-lint.log`.
Exit records: `-late-results.json`. Temporary harness: `-late-cli.py`.
Commands use the same native audit preload as wave four.

## Shutdown gate outstanding at the initial handoff

The coordinator identified a separate guard-order issue: after RSC binding
disposal, `rsc.render` can reject as unavailable before checking C's original
closed scope, so a caught late call can miss the late sink. An immutable E
followup and an actual late-render callback test are still required before final
wave-six acceptance. No mutable fix or artifact-v2/browser candidate was pulled.
All processes started for the recorded checks have completed; no watcher remains.

## E13 and C6 final targeted correction evidence

Applied reviewed E13 SHA-256
`077d1f869ed199deafe551a48d2cedca50f7a28419353b0d0d333433fd835b1b`
and reviewed C6 SHA-256
`b6491530ef290c0fd47e5c9efd7ca72fcbb63136181a802f9fa7fff6e0f0896a`.
Each hash/apply check passed. Only affected `experimental_testing` outputs and
package declaration/types were rebuilt; all targeted checks passed. No native
or dependency change occurred. Existing successful broad gates were not rerun.

`late-render-terminal.case.mjs` independently reproduced the E12 false success
before applying E13: a real terminal `complete` payload reported `passed`, then
an `AsyncResource`-bound callback caught the generic disposed-binding error and
the CLI exited 0 with a passing file. The unchanged fixture after E13 emits the
original `closed render origin` attempt diagnostic, exits 1, and fails the file
while preserving its completed passing case. B rejects the stale terminal
payload at worker close. A Proxy records any render-option access and the
component records execution; neither marker appears before or after the fix.
This exercises rejection before resource setup/render entry. E's focused bridge
suite passed 10/10, and package types passed.

`late-declaration-terminal.case.mjs` retains both `it.skip` and a `test.extend`
handle from collection, then calls them in a caught, original-attempt-bound
terminal callback. After C6 both calls emit the original `declaration origin`
identity. The CLI exits 1; the file fails with two scope diagnostics plus worker
exit failure, while exactly one case remains passed and zero skipped/new cases
appear. The focused lifecycle wrapper passed 17/17 Jest tests, including its
24/24 fresh-process C/D integration checks. Package types passed again after the
C6 source change.

These are instrumented real B-worker shutdown tests, not ordinary authoring
examples or replacement workers. Temporary JSON selection is restored in
`finally`; the negative files stay excluded from positive projects. Fixture
format/lint passed. The earlier E12 log is preserved, not overwritten.

Additional logs: `/tmp/next-testing-L-wave6-render-disposal-before.log` and
`-after.log`; `/tmp/next-testing-L-wave6-e13-{build,types,unit}.log`;
`/tmp/next-testing-L-wave6-c6-{build,types,unit,declaration-cli}.log`; and
`/tmp/next-testing-L-wave6-corrections-fixture-lint.log`.

The wave-six late-render and retained-declaration gates are now closed by actual
runtime evidence. This does not widen support to artifact v2, browser execution,
production test entries, arbitrary external cache/data isolation, or snapshot
writes. No current-v1 followup was pulled outside the reviewed corrections.
