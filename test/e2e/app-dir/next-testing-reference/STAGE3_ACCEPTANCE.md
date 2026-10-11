# Stage-three independent acceptance

Status: independent stage-three acceptance passed for the scoped capabilities
below. The earlier checkpoints are historical; their pending statuses are
superseded by the final acceptance record at the end of this document.
L3 owns this canonical matrix; implementation-owner checks are inputs, not substitutes
for independent execution of the combined compiler, worker and public command.

## Materialized baseline

L3 worktree: `/Users/timneutkens/.codex/worktrees/6bd1/next.js-2`.
Task: `01a0ae2f-b60c-72b3-91be-8dc5c1d57b7a`.
The clean worktree already pointed at base
`602a2aba900e45fb2edd694f463f435430678e1f`.
The full snapshot `/tmp/next-testing-stage2-accepted-final-v1.patch` was applied
exactly once after checking SHA256
`722d2581ebd8fde2fe379660369c117557667337a62b5970078a0a015396e966`.
All 448 authored file hashes matched its source manifest. No old incremental
patches were layered over that snapshot. Frozen stage-three plan SHA256:
`9397b4d8ddeab033bfa29210e49293c179be422f18f03ee055dbe8732673a1c2`.

Stage-two d484 is eligible only with all 21 paired source inputs unchanged.
Eligibility is not evidence that a binary was loaded: each compiler run must
record actual native realpath and SHA256 from the loading process. A3 owns all
new native builds. Its first expensive window precedes L3 bootstrap or execution.

## Small combined matrix

| Gate                             | Real producer/consumer assertion                                                                                                                                                    | Negative and isolation assertion                                                                                                                                                                  | Required owners                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Production Node                  | Actual production test compilation and worker execution; application `NODE_ENV` and conditional exports agree with an ordinary production route; ordered setup runs before the spec | Development-only branch absent within inspected emitted application modules; independent second file state; original-source failure; workers and immutable leases close                           | A3, B3, I3                          |
| Production RSC                   | Real Flight rendering of the canonical async server-only subject; client reference and serializable props; distinct request cookies agree with the ordinary route                   | Invalid serialization rejects; request/render cleanup; no claim of prerender, PPR, layout inference or action transport                                                                           | A3, B3, E3, I3                      |
| Production browser driver        | Real production-compiled Node driver starts the built Next app; Chromium navigates, hydrates and increments the counter                                                             | Fresh context per attempt; owned server/browser processes and output lock released after success, failure and cancellation                                                                        | A3, B3, H3, I3                      |
| Instrumented application         | Explicit testing flag enables the existing `instant()` shell/release flow against the actual production app                                                                         | Testing cookie removed after release; no inference about an ordinary uninstrumented build                                                                                                         | H3; existing canonical oracle       |
| Ordinary application             | Separate uninstrumented production build renders, navigates and hydrates; testing cookie cannot pause completion                                                                    | Inspect emitted application JS and route traces, excluding maps and installed framework package; no fixture endpoint or reachable testing harness within that scope                               | A3, E3, H3; existing omission suite |
| Registered development component | Compiler-issued fixture identity reaches real Next Flight/SSR/client chunks; async server-only subject hydrates and responds to a click                                             | Unknown identity and nonserializable input fail; no hydration errors; fresh mount/context; all resources close; standalone fixture does not imply route/layout context                            | A3, B3, E3, H3, I3                  |
| Node development line coverage   | Opt-in public command reports exact authored executable line sets for two imported project sources; retry contributions follow the agreed contract                                  | No generated/spec/harness lines; malformed/incomplete payload, worker failure, cancellation and missing map cannot yield a successful complete report; rejected unsupported modes remain explicit | A3, B3, K3, I3                      |
| Packed public consumer           | Frozen archives installed outside repository; actual public types plus Node, RSC, browser, component and coverage commands for accepted capabilities                                | Installed bytes match archives; actual local native loads match provenance; no repository fallback, declaration overlay, Vitest/Vite runtime or leaked owned process                              | P3, L3; accepted combined source    |

Production tests, instrumented application tests and ordinary deployment-artifact
checks are three independent lanes. A passing lane never certifies another.
The deployment-artifact lane here is local production build/start, not a hosted
platform or CDN deployment claim.

## Regression selection

Retain immutable `STAGE2_*.md` records and their original logs. The accepted setup,
API, mocks, snapshots, public watch/mutations, default multi-profile command,
browser cleanup and ordinary-production checkpoints remain the baseline.
Rerun the affected actual compiler/worker checkpoints when their producers change;
do not broaden a run solely because the stage number changed. In particular:

- Compiler/context changes require actual Node/RSC setup and narrow static mocks.
- Worker/terminal/coverage changes require snapshot commit and late-failure checks.
- Compiler shutdown or orchestration changes require public watch and cleanup.
- Browser hosting changes require default/browser cancellation and omission checks.

No unit stub, inventory flag, owner statement, old built output or type-only import
constitutes runtime acceptance of a newly changed source path.

## Evidence required per increment

Freeze the exact combined patch against the accepted snapshot (or name the exact
predecessor), producer-source hashes, package/dependency inputs, native source and
binary hashes, commands, selected profiles, exit codes, and unmodified logs.
Record initial failures separately from bounded corrections. Inspect saved output
before rerunning, and rerun only when changed inputs or an unresolved check justify it.
Record actual process/native ownership, terminal ordering and cleanup, not merely
an absence of currently visible errors. Final package archives must come from this
accepted combined build; compare regular files against output and independently
audit P3's clean installed files, type inputs, execution logs and process records.

The minimum line-coverage fixture will use explicit, hand-audited source-line
expectations once K3's schema is agreed. Expectations must not be derived from the
report under test. New suites must be generated with `pnpm new-test`; temporary
configuration and fixture mutations must be restored in `finally`.

## L3 preparation checkpoint

The frozen dependency install completed with `--frozen-lockfile --ignore-scripts`.
The initial offline attempt failed because one package tarball was absent from the
store; `/tmp/next-testing-L3-install-initial.log` retains that failure. The normal
network-enabled install passed in 55.2 seconds without dependency overlays,
registry changes or release-age changes; log:
`/tmp/next-testing-L3-install-network.log`.

After A3 explicitly released its first window, L3 acquired the shared slot in a
separate successful atomic operation. The required baseline `CI=1 pnpm build-all`
completed 18/18 tasks (16 cache hits) in 3m53.122s; log:
`/tmp/next-testing-L3-baseline-build.log`. It spent most of that time at Turbo
startup. No native dlopen was observed in this bootstrap, so this is package build
evidence only. The fail-closed audit descriptor and preload are
`/tmp/next-testing-L3-baseline-native-manifest.json` and
`/tmp/next-testing-L3-native-audit.cjs`. All 21 source inputs were paired with d484;
this bootstrap says nothing about new stage-three producer source. L3 released its
slot after the owned command ended and did not start a watch while awaiting A3.

The required generator command was
`pnpm new-test --args true next-testing-stage3-reference e2e`.
Its first attempt stalled in npm dependency retrieval and was stopped; its parent
exit code alone was not accepted as generation. The network-enabled bounded retry
created the suite successfully. Logs:
`/tmp/next-testing-L3-generator.log` and
`/tmp/next-testing-L3-generator-network.log`.

The generated fixture has real production Node inputs (conditional exports,
production branch, asynchronous setup, fresh second-file state), an ordinary route
oracle, and bounded emitted-JavaScript/route-trace omission assertions. Its driver
uses the existing independent process supervisor. Exact summary assertions reject
skipped/cancelled cases and hidden failures. Separate prepared configurations cover
production RSC serialization and development registered-component hydration and
invalid-input rejection; they are not included in the initial Node command.
Fixture format and ESLint checks passed. The unchanged repository `pnpm typescript`
passed for the production fixture increment; log:
`/tmp/next-testing-L3-fixture-types.log`. No new runtime capability has been executed
or accepted by these preparation checks.

## Coverage and snapshot updates

The initial coverage scope rejects `--coverage --update` explicitly. Coverage
remapping can fail after worker completion, so a snapshot write must not be
advertised as part of the same successful transaction. Acceptance requires the
specific unsupported-combination diagnostic, no case-body execution, unchanged
authored snapshot bytes, and clean process ownership. The prepared rejection
driver restores its temporary development configuration in `finally`. Existing
snapshot-only update acceptance remains unchanged.

## Independent execution checkpoint: component-v7

This historical checkpoint used the coherent source manifest
`/tmp/next-testing-stage3-component-candidate-v7.json` (151 authored paths).
Its runtime matches component-v6. Actual native loads are pinned to
`bf3a816d5b789d01340c913bfd20134a98b486baf413fcffb6ac4a522ce111d2`,
with all 27 native source inputs verified. The component-v5 combined bootstrap
passed 18/18 after a sandbox port-binding failure was preserved separately.
The component-v6 core build, repository `pnpm typescript`, and explicitly selected
CLI suite passed (85/85). The accidentally broad `pnpm test-unit <path>` invocation
was stopped and is not an accepted aggregate result.

- Production reference: 3/3 checks passed. The public Node command ran two files
  and two cases with ordered asynchronous setup, fresh file state and production
  conditions. The ordinary production route checked server-only work, concurrent
  cookie isolation, client props, emitted-code omission and route-trace exclusion.
  The internal production RSC producer passed two cases, including the precise
  invalid-function serialization error, after the native emitted-file inventory
  fix. Its initial missing-artifact failure remains recorded. All six supervised
  processes were independently confirmed absent; the RSC artifact was removed.
  Evidence: `/tmp/next-testing-L3-reference-v4-evidence.json`.
- Public production RSC: one file/two cases passed through the installed candidate
  CLI. No configured route context is claimed. Public development Node coverage
  passed both the multiline and two-worker/retry checks, with retained JSON and
  text reports and strict supervision. Evidence:
  `/tmp/next-testing-L3-public-v6-evidence.json`.
- Production browser: all seven checks passed, including instrumented `instant()`,
  hydration, output-lock rejection, unsupported production mounting, ordinary
  build omission, phase-dependent build rejection, and the compiled driver.
  Thirteen supervised processes were independently confirmed absent. Evidence:
  `/tmp/next-testing-L3-browser-production-v2-evidence.json`.

### Coverage metric and independent oracle

Expectations were frozen after independent emitted-source-map review and before
any worker execution or coverage remapping. The multiline source has executable
lines `[1,2,3,4,5,6,7,8,9,10,12,13,14,15,17]` and covered lines
`[1,2,3,4,5,6,7,8,9,10]`: 10/15. In particular, multiline arithmetic operands,
template interpolations, and unused-function operands are retained. The price and
label sources merge to 9/15, including the discount branch executed only in the
failed first attempt before a successful retry. Unused bodies remain uncovered.

This is an original-line metric for non-whitespace mapped generated spans, not
Istanbul statement/branch parity. Mapped delimiters count; eliminated syntax does
not. The multiline closing template delimiter on line 9 has explicit mappings,
while the eliminated closing parenthesis on line 16 has none. Both actual reports
matched the fixed line sets, source identities, and totals. Internal evidence and
raw captures: `/tmp/next-testing-L3-coverage-producer-evidence-v1.json`.
The external-consumer oracle is
`/tmp/next-testing-L3-reviewed-coverage-expectations-v1.json`.

### Preserved browser failures and current limits

The first production driver passed its cases but failed strict supervision because
Next's Node-option formatter collapsed repeated `--require` values, discarding the
startup audit from six build workers. A separate actual formatter/fork control
reproduced this. Using `--import` for the independent native audit retains the
unchanged startup `--require` and every strict descendant check; the complete
production browser suite then passed. No audit exemption was introduced.

Development mounting initially passed four cases and failed the base-path restart
with an installed `@swc/helpers` resolution error. The dependency exists. A traced
rerun passed 5/5, but an untraced bounded reproduction returned 500 on both servers;
the trace changed realpath-cache behavior and is not acceptance. A3 and H3 each
reproduced the failure in Node 20.20.0 without Next or a native binding: a pipe/FIFO
stat can make a later cached-prefix symlink resolution return the logical path.
The original logs, traced result and untraced reproduction are preserved. No
framework workaround or extra application dependency was added. Unmodified-source
validation on a supported runtime without this defect remains required.

Final frozen archives, external installed-byte/type/runtime verification, and the
remaining regression checks are still pending. Passing lanes above do not certify
these outstanding checks.

## Verified Node 24.21.0 checkpoint

The official Node 24.21.0 binary was selected per command after the coordinator
verified its archive and reproduced the upstream realpath correction with a bare
Node control. No project or global Node selection changed. Binary SHA256:
`e4b5a3af0e05c75de2eae013904145f40fe7fc2a6e6f17510128bf45cca4e79b`.
Verification: `/tmp/next-testing-stage3-node-v24.21.0/verification.json`.
This symlinked local acceptance environment requires an unaffected Node runtime;
earlier installed versions reproduced the upstream pipe/FIFO realpath defect.
This is recorded host-test provenance, not a new Next package engine requirement.

With unchanged component-v7 source and the same bf3a native binary, the full
untraced development browser suite passed 5/5, including the base-path restart.
There was no resolver trace, realpath-warming operation, extra dependency, or
framework workaround. The independent audit checked five actual native loads and
14 Node startup records for version 24.21.0. Evidence:
`/tmp/next-testing-L3-component-dev-node24-v1-evidence.json`.

Public coverage was rerun because the V8 collector changed. Both frozen oracles
still matched exactly: multiline 10/15 and two-worker/retry 9/15. JSON/text output,
source line sets, strict process supervision and independent process-exit checks
passed. Evidence: `/tmp/next-testing-L3-public-coverage-node24-evidence-v1.json`.

The first explicit serial regression run passed 417/423 tests across 20/26 suites.
Five failures came from wrappers assuming Node 20's default TAP reporter while
Node 24 selected its default spec reporter; all inner cases passed. Explicitly
selecting `--test-reporter=tap` preserves the existing count/error assertions, and
the corrected five suites passed all 21 tests. The remaining watcher unit mixed a
synthetic null event with real native startup events; its deterministic correction
and focused verification remain pending here.

Actual compiler/CLI regressions passed the worker, snapshot-update and watch
suites. The static-mock alias case exposed an absent shipped fixture configuration
for `@/dependency`; its assertion remains unchanged and the explicit alias fixture
correction still requires focused verification. Original failed runs remain
retained, separate from corrected runs. Frozen archives and clean external consumer
acceptance remain pending.

## Component-v9 focused regression completion

The final coherent candidate manifest is
`/tmp/next-testing-stage3-component-candidate-v9.json` (158 authored paths).
All 27 native input hashes and the bf3a binary remain unchanged. The five TAP
wrapper changes are part of this candidate, not the separate L3 fixture patch.

The deterministic missing-filename watcher test retained its exact assertion and
passed the complete 20-test watcher suite on Node 24.21.0. The static-mock fixture
now ships a nonignored `jsconfig.json` declaring `@/*`; the actual compiler suite
passed all four tests without weakening alias or factory assertions. Logs:
`/tmp/next-testing-L3-watch-unit-node24-v2.log` and
`/tmp/next-testing-L3-static-mocks-node24-v2.log`.
Together with the initial and corrected-wrapper results, every one of the 26
explicit unit suites and four actual integration suites has a passing result.
This is the union of focused corrected runs, not a claim that the original failed
aggregate passed. Formatting and ESLint checks passed for all four final-delta
paths. Product source and native code did not change, so no rebuild was repeated.

Package archives were frozen from these exact built outputs. Final external
consumer acceptance remains pending and must verify installed bytes, public types,
all selected runtime lanes, native/runtime provenance and process cleanup.

## Frozen package handoff

`/tmp/next-testing-stage3-L3-packages-v1/` contains the four immutable archives and
`artifacts.json`, `source-manifest.json`, `archive-verification.json`, and
`manifest-hashes.json`. Every regular archive file was compared against built
bytes: Next 8,714 files, env 4, native 3, and Playwright helper 6. No archive
symlinks were admitted. Source hashes were checked before and after packing, and
all archive and manifest hashes were checked again before handoff. The final
repository type check passed after the test-only corrections.

L3 explicitly released the atomic heavy-work slot to P3 after all owned work
finished. P3 must use verified Node 24.21.0 for preparation and all runtime lanes,
check installed bytes and actual native loads, run production Node/RSC and coverage
before installing browser dependencies, then verify production browser and `/docs`
component mounting. L3 will independently inspect the resulting evidence before
marking packed-consumer or final acceptance complete.

## Final independent acceptance

All five clean external-consumer phases passed on verified Node 24.21.0:

| Phase                     | Public runtime result                                                                                                             | Independent evidence                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Production Node           | JavaScript and TypeScript cases passed (2/2)                                                                                      | `next-testing-stage3-P3-production-node-v1/`    |
| Production RSC            | Dynamic subtree and server-only case passed (1/1)                                                                                 | `next-testing-stage3-P3-production-rsc-v1/`     |
| Development Node coverage | Two files/cases passed after the intentional retry; exact 9/15 line union, complete JSON/text report, update combination rejected | `next-testing-stage3-P3-coverage-v1/`           |
| Production browser        | Compiled driver built/served the actual app and interacted with its client (1/1)                                                  | `next-testing-stage3-P3-production-browser-v1/` |
| Development mounting      | JavaScript and TypeScript registered server fixtures hydrated and interacted beneath `/docs` (2/2)                                | `next-testing-stage3-P3-mounting-v1/`           |

These evidence directories are under `/tmp`. L3 independently inspected raw
supervisor results, command statuses, exact native/runtime loads, authoring-source
hashes, and strict JS/TS inputs for both bundler and Node16 resolution. Public
installed declarations were included and all type inputs stayed inside the clean
consumer. Node, RSC and coverage ran before browser dependencies were installed.
Vitest and Vite were absent. All recorded owned processes were independently absent
at readback: 7, 6, 8, 17 and 13 per phase respectively.

After all phases, L3 independently rehashed every installed regular file in all
four packages and matched the immutable archives. Browser screenshots and trace
ZIPs had the correct signatures and hashes, unique case/attempt attribution, and
artifact events preceding terminal case events. Trace records confirmed clicks
and both `/docs` mounting paths; production and JavaScript mounting screenshots
showed the incremented counter. No local declaration or implementation overlay was
used.

Coverage verification requires exactly the intentional first-attempt assertion
failure, its original `retry.case.js:11:19` location, and the successful retry with
the same case identity and a new attempt identity. Only that fixture admits one
retained diagnostic; all other phases still require zero errors. The coverage
report itself is complete with `errors: []`, and exact line sets/source hashes
match the independently frozen oracle. Unsupported `--coverage --update` fails
before any run starts. This verifier correction did not change product behavior.

Provenance is deliberately separated: package bytes and native inputs were frozen
from `component-candidate-v9`, while the verification harness is
`integration-candidate-v11`. Its separately reviewed retry-diagnostic delta is
`ced6a3bc79317ecaad1bc06e3f0a8e8577b4a1a88a2ebbfae27efa568c7afe7e`.
The original frozen source manifest was not rewritten to claim it contained that
later harness correction. The final canonical documentation update follows v11.

Final independent audit records:

- `/tmp/next-testing-L3-packed-final-audit-v1.json`
- `/tmp/next-testing-L3-packed-final-installed-audit-v1.json`
- `/tmp/next-testing-L3-packed-minimal-installed-audit-v1.json`
- `/tmp/next-testing-L3-packed-coverage-attribution-audit-v1.json`

Acceptance is limited to the declared scopes: production RSC is a route-less
dynamic subtree; development component mounting uses registered JSON props and
requires the browser dependencies; coverage is opt-in one-shot development Node
coverage of imported project sources with the mapped-line metric described above.
Production mounting, prerender/PPR RSC semantics, action transport, unsupported
production mocks/coverage, and coverage with watch or snapshot updates are not
certified by these results. The verified Node host and retained upstream runtime
failure evidence remain part of this acceptance record. All earlier pending
acceptance statements are historical checkpoints, not outstanding work.
