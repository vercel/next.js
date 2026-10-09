# Waves eight and nine: independent validation

Current runtime status: the actual default five-profile CLI, browser positive/
retry/failure/cancellation/cleanup corpus, and bounded ordinary production gate
pass. The history below preserves the failures that drove the reviewed fixes.
Production test profiles and the separate worker-thread loader lifetime remain
outside this accepted evidence.

## Initial parent orchestration batch

Applied exact parent-orchestration aggregate SHA-256
`5eab8defb8ff3ea63491b24d008eaf91af3bae0e1042a6977fa7c4e03b302bd5`
after accepted wave seven, retaining native `75f662135924`. Hash/apply checks,
targeted `experimental_testing` build, package types, and 54 CLI checks passed.
The positive browser profile has explicit 60-second case, 15-second hook, and
180-second file budgets for first compilation/navigation.

The first actual browser CLI run failed before fixture acquisition. The emitted
worker dynamically imports `../browser/fixture` without `.js`; native Node
resolution rejects it. Both final cases fail and exit status is 1. Subsequent
page/cleanup assertions fail because the first fixture never existed. This is
not accepted browser execution evidence despite passing component checks.

The same run logged a native panic in the parent CLI, after server startup:
restoring task 104 failed because `00000006.meta` referenced missing
`cache/turbopack/temp/00000002.sst`. The application server's retained stdout
shows normal startup (194ms); its stderr is empty. Existing generated cache was
preserved for owner investigation. A post-run process inventory found no managed
server/browser leftovers. Browser acceptance remains unresolved for both the
worker import and compiler shutdown/cache lifetime issues.

Original evidence (preserved):
`/tmp/next-testing-L-wave8-browser-positive.log` and
`/tmp/next-testing-L-wave8-browser-positive.events.jsonl`.
Server attachment paths are recorded in those files. Targeted gates:
`/tmp/next-testing-L-wave8-{build,types,unit}.log`.

The independent acceptance driver runs the actual CLI and records reporter
events and resource ownership using an explicitly instrumented preload. It does
not replace the compiler, lifecycle runner, application server, or Chromium.
The first preload observed reporter events but its resource wrappers did not
intercept native `import()`; subsequent driver instrumentation was self-checked
against native imports before use. Its explicit service-cleanup fault is thrown
only after real server disposal, to verify final file status without orphaning
resources. All injected evidence must be labelled as such.

The compiler owner independently reproduced the panic with fresh output and no
browser: parent compilation and awaited shutdown, then another compiler using
the same configured output and a watched source mutation. The owner's backtrace
identifies `DiskWatcher.watch_thread -> invalidate_with_reason -> backend
restore` after shutdown. Owner evidence:
`/tmp/next-testing-a-shutdown-probe-before3.log` and
`/tmp/next-testing-a-shutdown-probe.cjs`. This confirms a shutdown defect rather
than establishing that deleting stale cache resolves it. Independent L acceptance
still requires the reviewed correction and matching native provenance.

Applied reviewed B11 SHA-256
`267d0c01c581e855fb7bd0b1d4dbc4971d836d669fbba555964a3740825589a6`.
Forward/reverse apply checks passed. Rebuilt only `experimental_testing` and
verified the emitted worker now uses `import('../browser/fixture.js')`.
No unsafe browser handoff was repeated on native `75f662` after the watcher
cause was confirmed. The acceptance driver rejects native failures in both the
CLI output and retained application-server logs, regardless of case status.

## Reviewed shutdown correction and independent browser evidence

The combined wave-nine aggregate is exactly B11 plus A10, SHA-256
`10b3710a426a29c16b1024332667e274ca47961eaad9816029fd48cd54118fde`.
Its reverse apply check passed; already-applied B11 was not applied twice.
A10 delta SHA-256:
`41ccdc03fa4d53200b1eaf4aa32d3dabaf1691b968753daf9db8e61ab362f610`.
All twelve Rust source hashes match immutable provenance at
`/tmp/next-testing-a-native-v10-1b147d674547/provenance.json`.
Actual native SHA-256:
`1b147d674547cd457b1913bd479ff2d5337b61744cbfe8c3c1fcea076f581a67`.
The prior `75f662` binary is preserved separately.

L repeated the frozen owner probe with only its checkout root substituted:
parent and child both shut down/disposed, child exited 0, and no panic occurred.
Log: `/tmp/next-testing-L-wave8-a10-shutdown.log`. The initial failed cache was
copied intact to `/tmp/next-testing-L-wave8-initial-failure-next-cache`; the actual
canonical `.next` stayed in place. No cache cleanup occurred between acceptance
runs.

Actual browser CLI evidence with corrected native:

| Run                                                 | Independent result                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Positive                                            | Exit 0, two final cases pass across three attempts, six valid artifacts                        |
| Positive repeated on same output                    | Same result, no native failures                                                                |
| Deliberate case failure                             | Exit 1, one failed and one passed case, four valid artifacts                                   |
| Injected parent cleanup failure after real disposal | Exit 1, exactly one failed file result, two final cases preserved passing, six valid artifacts |

Positive cases exercise actual instant shell/release, nested server content,
Counter hydration, fixture reuse within one attempt, and fresh cookies/local
storage between attempts. The expected first retry failure retains its own
artifacts. All PNG chunks pass CRC and decompression checks, traces pass ZIP
integrity checks and contain trace entries, and screenshot/trace paths are
unique per attempt. Each attachment matches the original case/attempt and
precedes its terminal event. Files remain readable after CLI exit. A screenshot
was also visually inspected: shell title, anonymous visitor, server sum 10, and
hydrated Count 11 are visible.

For these completed stages, both recorded server/Chromium PIDs are gone, the
output flock is available, and the single file-end follows both parent disposal
records. Parent/server logs contain no native panic or cache-restoration error.
The service-cleanup fault is explicitly injected after real server disposal;
it tests reporting without pretending that actual disposal failed.

Logs, raw events and checked result JSON use the prefix
`/tmp/next-testing-L-wave8-browser-`, with suffixes `positive-a10-first`,
`positive-a10-repeat`, `failure-a10`, and `cleanup-a10`.

## Initial SIGINT cancellation failure (resolved by H6)

The first SIGINT run reached the browser ready marker, then exited 130 without
case/file/run terminal events or screenshot/trace attachments. The browser
process exited, but the recorded application server remained orphaned; L sent
SIGTERM only to that recorded PID and confirmed termination. Evidence:
`/tmp/next-testing-L-wave8-browser-cancel-a10.log` and `.events.jsonl`.
Exit 130 is the CLI's documented cancellation status; the defect is missing
cleanup and terminal reporting, not that status itself. The CLI owner confirmed
its cancellation handler exists and identified Playwright's default signal
handling as the likely preempting handler. Browser acceptance is not complete
until a reviewed correction passes this actual CLI signal test.

## H6 closes actual cancellation gate

Applied reviewed H6 SHA-256
`9f6c9a610ffe82c05b60cd8f75409eeef46551d233029226d559a28f78e4b7c8`,
verified forward/reverse applicability, rebuilt the testing runtime, and passed
package types. Native and application config are unchanged. Playwright's own
SIGINT/SIGTERM/SIGHUP handlers are disabled so Next retains cleanup ownership.

The unchanged ready-marker fixture now passes independent **actual CLI SIGINT
and SIGTERM** acceptance. Both runs exit 130 only after screenshot/trace capture,
case cancellation, one cancelled file-end, and one cancelled run-end. The next
case is marked cancelled without executing its throwing body. Each run retains
two valid uniquely attributed artifacts before the originating case terminal.
Recorded server and Chromium PIDs are gone, output flock is available, both
parent disposal records precede file-end, and parent/server logs contain no
native panic. No CLI SIGHUP support is claimed.

Logs, raw events, and checked result JSON:
`/tmp/next-testing-L-wave8-browser-cancel-h6.*` and
`/tmp/next-testing-L-wave8-browser-cancel-term-h6.*`. The original failing SIGINT
run is preserved separately; its missing cleanup was not accepted merely
because exit 130 was expected. All six completed acceptance runs were checked
for exactly one run-end with the correct final status.

The development browser acceptance gate is now complete for this corpus.
Following the full 18-task bootstrap, the actual unchanged Node corpus passed
three files/three final cases, and the RSC render corpus passed three cases with
the audited final native. Logs: `/tmp/next-testing-L-final-node-cli.log` and
`/tmp/next-testing-L-final-render-cli.log`. Ordinary production has separate
bounded evidence in `PRODUCTION.md`; production test profiles remain unsupported.
Root consumer typecheck import-boundary correction is still under owner review.

## Initial default multi-profile failure (resolved by A11)

A separate actual invocation with the unchanged five-profile canonical config
and **without `--project`** failed on the corrected native/H6 runtime. The first
`reference-rsc` file completes two passing cases; creating the second compiler
project throws uncaught `Worker creator already registered` from
`loaderWorkerPool.js` through `ProjectImpl`. The CLI exits 1 without a run-end,
and the remaining four profiles do not execute. Individual-profile browser,
Node and RSC passes do not establish this default path.

Evidence: `/tmp/next-testing-L-default-cli.log` and `.events.jsonl`. No application
server or browser was acquired before the failure; the output lock is released.
The scheduler registration defect is assigned to the compiler/orchestration
owners. No profile is removed or silently counted as passing.

## Initial root type correction and Jest loading failure

Applied reviewed K23 test-only patch SHA-256
`651a743d0d9bd2596215e7c45b95263e298b51aa2000f79ba319b87e975b7a2f`.
Independent comparison established the 397 root type errors were introduced by
new tests importing Next source internals into the consumer type context, not a
pre-existing baseline failure. The reviewed emitted-import boundary correction
makes actual `pnpm typescript` pass with the unchanged root config. Log:
`/tmp/next-testing-L-k23-root-types.log`.

The subsequent single batch of all 19 affected unit suites is **not green**:
18 suites pass, with 234 passing tests and 24 failing tests overall (131.942s).
Only the CLI orchestration suite fails: emitted native `import()` reaches Jest
without its VM-module support (`A dynamic import callback was invoked without
--experimental-vm-modules`), including two 60-second timeouts. All behavioral
assertions remain intact. Log: `/tmp/next-testing-L-k23-unit.log`.
The test-loading correction remains assigned to the owners; no passing typecheck
or unrelated runtime evidence substitutes for this suite's required validation.

## A11 closes the default multi-profile gate

Applied reviewed source-only scheduler delta SHA-256
`5336a476e4ba88549694602355af308de1664a3849f8106c641b581eae5bda7e`.
Forward/reverse checks passed; `nextbuild` and `nextbuild_esm` rebuilt the wrapper,
and package types passed. Native `1b147` and its twelve-source provenance are
unchanged.

The exact canonical command without `--project` now exits 0. All five configured
profiles execute: nine distinct selected file/profile entries, thirteen passing
final cases, and eighteen attempts. The five earlier failed attempts are the
expected retry probes. Independently checked events contain exactly one passing
run-end; no profile is removed or silently omitted. All six browser artifacts
remain valid, unique, and attributed to their original attempts before terminal
events. Both owned PIDs are gone, output flock is available, and parent disposals
precede browser file-end. Neither parent nor server logs contain native failures.

Evidence: `/tmp/next-testing-L-default-cli-a11.log`, `.events.jsonl`, and
`.result.json`. The initial failing `/tmp/next-testing-L-default-cli.log` remains
unchanged. This proves the default child-process loader strategy used here; a
separate owner-reproduced worker-thread idle-lifetime issue is not claimed fixed.

## Final Jest correction and type gates

Applied reviewed exact-path Jest transform correction SHA-256
`c929016bc1bc937cd08aaf3b7889deef10c074029dd71d0e83f6bc0fbaf50250`.
Only the emitted testing orchestrator enters the existing transformer so Jest's
mocked dynamic imports work; runtime code is unchanged. The previously failing
CLI suite now passes 54/54 with actual exit 0 (0.42s). The other eighteen suites
were not rerun: their 204 passing tests remain valid, totaling 258 passing tests
across nineteen suites over the original batch and focused correction. Native
import resolution is independently exercised by the actual CLI, not inferred
from Jest's transform. Log: `/tmp/next-testing-L-k24-cli-unit.log`.

Final actual `pnpm typescript` after A11 and the Jest correction passes with exit
0 and the unchanged root config. Package types after A11 also pass. Logs:
`/tmp/next-testing-L-final-root-types-accepted.log` and
`/tmp/next-testing-L-a11-types.log`. All processes started for these completed
checks have exited; no watcher is retained.
