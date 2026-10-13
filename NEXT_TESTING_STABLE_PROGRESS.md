# Next testing stable compatibility implementation

October 13, 2026. Implementation checkout starts at PR #98869's verified head,
`3371432a5561c33bc3d1ec36309b3e537b130a99`. The main checkout and existing lifecycle,
scheduling and requirements worktrees were preserved. The two requirements
files were copied byte-for-byte from the specified older worktree; that older
code was not used as the implementation baseline.

The user selected **Vitest 5.0.4** as the compatibility target and deferred
performance targets/optimization until compatibility is established. The exact
reference source is `6a11cf66f99fa610b7364363d5ca42b66d994f40`; the package integrity
is recorded in the generated inventory and lockfile. The supported stable range
is undecided, `stableReady` remains false, and no stable exception is approved.
This is an implementation checkpoint, not graduation of the experiment.

## Completed increments

1. Re-established bootstrap, declarations, repository type checking and native
   CLI acceptance on the integrated baseline. Installed the exact workspace
   lockfile instead of borrowing a different checkout's dependencies. Fixed a
   lifecycle test's access to undeclared `TestContext.name`; it now checks the
   supported signal. Declared two existing Octokit packages' missing GraphQL 7
   type dependency, removing incidental resolution to GraphQL 9 after adding
   the reference runner.
2. Reproduced the compiled inline-snapshot failure through the public CLI.
   Invocation capture now precedes assertion wrappers and asynchronous promise
   continuations. The execution host maps it through the immutable artifact;
   unmapped locations fail explicitly. The pinned primitive strips indentation
   on reads. External snapshot headers match the selected reference. Regression
   tests assert actual source mutation and a subsequent read-only pass, rather
   than merely accepting an update exit code.
3. Pinned the reference runner and reused expectation/spy/snapshot/utilities to
   5.0.4. Its standalone snapshot primitive still needs the tested retry-rollback
   patch; the patch was carried to the new exact version and primitives rebuilt.
4. Added `-t`/`--testNamePattern` to one-shot and initial watch selection, using
   full ancestor-qualified names. Invalid regexes fail before compilation.
   Name-filtered listing is rejected explicitly because listing still exposes
   files, not collected cases.
5. Added one-shot JSON, JUnit and versioned Next-owned blob reports. JSON retains
   failed retry errors even when the final test passes, as the reference does.
   Event evidence retains all attempts, mapped errors, attachments, attributed
   output and snapshot summaries. JUnit includes cleanup/collection/run errors.
   Reports publish after authoritative completion; output errors fail the CLI.
   `--merge-reports` combines disjoint Next blobs without execution/compilation,
   rejecting unsupported/incomplete evidence, overlapping files and duplicate
   runs. Paths from distinct checkout roots resolve in the merging checkout.
   Next blobs are an explicit extension, not Vitest blob-format compatibility.
6. Added Chai `assert`, generic `assertType`, and standalone `expectTypeOf`, with
   public type contracts including negative cases and typed mock inference.
   Chai operations keep scope-access guards. Compiler-backed type-test execution
   remains missing; runtime type helpers are not presented as that feature.
7. Added an unchanged-body 5.0.4 reference corpus for collection, lifecycle,
   lazy fixtures, parameterization, retries, expected/deliberate failures,
   teardown errors, Chai/type APIs, and external/inline snapshot byte round trips.
   Comparison preserves failures, ordering and snapshot bytes; it does not
   normalize away semantic differences. A generated, drift-checked inventory
   covers 776 published exports/types/members/configuration entries and records
   overloads. These entries remain missing or unverified until their complete
   behavior/types are evidenced. Declaration inventory is not the entire CLI,
   environment, tooling or modifier-combination contract.
8. Closed an ownership hole: unsupported `vitest/*` imports now produce a real
   compiler issue even when Vitest is installed, instead of compiling its
   controller/Vite graph. This temporary missing adapter is not a permanent
   stable exception. Runtime event timestamps use a captured real clock.
9. Hardened baseline verification: mismatched artifact profiles are rejected
   before launching workers. A stale production-snapshot rejection test was
   corrected. Browser-signal tests distinguish the known Node 26/tsx deprecation
   from execution errors and clean their temporary artifacts. Clean package
   verification now uses workspace-aware packing, converting `workspace:*`
   dependencies instead of creating archives that npm cannot install.
10. Fixed production minification of the inline snapshot callsite marker. Actual
    update/read round trips now cover development and production Node, RSC and
    browser drivers. The application build type-checks the application fixture,
    excluding its outer Jest acceptance harness.
11. Added asynchronous suite collection with context retained across awaits,
    nested-job settlement, and rejection retention. Unchanged async/nested/
    parameterized/skipped bodies match the pinned reference. Concurrent cases
    and the rest of the collection contract remain release work.
12. Added compatible local new-only and CI read-only snapshot modes throughout
    the CLI, broker and worker. Full CI selections fail on obsolete snapshots;
    full explicit updates prune obsolete keys and remove empty managed snapshot
    files. Skipped snapshots remain checked. Partial/focused selections preserve
    unchecked keys conservatively; complete filtered parity is not closed.
13. Added failed-publication recovery for coordinated snapshot writes/deletion.
    A later replacement failure restores earlier writes. A concurrent user edit
    is preserved and recovery bytes retained if rollback is refused. This is not
    a filesystem-wide atomic transaction or a completed crash/concurrency matrix.
14. Hardened blob schema and ownership validation before output publication:
    reject nested run boundaries, duplicate completed attempts/files, incomplete
    files, foreign-shard references, and invalid status/error/output/attachment/
    snapshot payloads. Ten negative merge cases preserve prior report bytes.
15. Added standard JSON snapshot statistics, retaining evidence on failing
    obsolete-snapshot files. Isolated published Vitest 5.0.4, verified by package
    integrity and installed without Next patches, matches creation/read/mismatch/
    CI/pruning/deletion totals. Vitest 5 bundles its own snapshot implementation;
    the earlier workspace reference also retained that upstream behavior.
    Inventory generation now uses the repository's formatter and drift check.
16. Restored implicit-new mixed-profile admission and consolidated identical
    staged snapshot plans before parent publication. Different values, source
    revisions, and owners reject before that batch starts writing. Native mixed
    mode and local/CI/explicit snapshot acceptance pass.
17. Reproduced the process-group EPERM race with 80 owned-child attempts: two
    second SIGKILL calls failed 1–2 ms after successful first signals, with no
    group members remaining. Successful group termination is now idempotent;
    an initial signal failure remains an error. The same 80-attempt probe passed
    with one signal per group and no EPERM after the fix. Regression tests use
    real descendants and cover both duplicate signaling and genuine failures.

## Evidence

Saved validation logs are under `/private/tmp/next-testing-*`; packed consumer
archives and per-command/native-load/type evidence are under
`/private/tmp/next-testing-complete-checkpoint-packed`. Native/source provenance is
paired with the final bootstrap's binary, not an older worktree's binary.

- Final `pnpm build-all`: 18 tasks passed, including native build and declarations.
  Log: `/private/tmp/next-testing-final-paired-bootstrap.log`.
- `pnpm typescript`: passed against the repository configuration and augmentations.
- Changed source ESLint, formatting and compatibility inventory drift check passed.
- Final core rebuild after the native/bootstrap pair passed.
  Log: `/private/tmp/next-testing-idempotent-cleanup-build.log`.
- Integrated unit/reference/public CLI corpus: 28 suites, 533 tests passed.
  Log: `/private/tmp/next-testing-complete-checkpoint-corpus.log`.
- Isolated published-reference corpus: 8 comparisons passed, including JSON
  snapshot statistics; no workspace snapshot patch is in that reference.
- Cross-profile compiled snapshot acceptance: 12 tests passed across development
  and production Node, RSC and browser drivers.
- Final native scheduling acceptance: 10 tests passed, covering serial/parallel
  equivalence, shards, mixed modes, RSC, coverage/snapshots, crashes, cancellation,
  output exclusion, browser/server ownership and actual port/process cleanup.
  Log: `/private/tmp/next-testing-complete-checkpoint-native.log`;
  run with `NEXT_SKIP_ISOLATE=1` against the rebuilt workspace.
- Uninstrumented targeted resource/admission checks: 4 suites, 103 tests passed.
- Clean external installation: 14 commands passed. Actual packed Node, RSC and Chromium driver
  execution passed, with public JS/TS declarations checked in bundler and Node16
  resolution modes. Both installed Node samples exercise Chai/type APIs. This
  validates the Darwin arm64 / Node 26.1.0 installation, not a platform matrix.
  Log: `/private/tmp/next-testing-complete-checkpoint-packed.log` (14 commands).
- Normal development application reference: 3 rendering/request/cookie/hydration
  checks passed. Normal production omission: 3 checks passed, including emitted
  JS/traces, normal rendering and client navigation with a testing cookie.

The observed process-group EPERM race is now reproduced and fixed for duplicate
successful termination (see increment 17). The capture and paired probe logs are
`/private/tmp/next-testing-group-sequence*.jsonl` and `.log`. This does not complete
the long-run/platform/resource stress gate or prove every EPERM has that cause.

A route-bound snapshot probe confirmed that the compiler still rejects route
profiles. It was not promoted to passing acceptance or advertised capability.
Two extra isolated acceptance runs collided while creating a shared package
archive and failed at installation. Workspace-mode reruns passed; clean external
packed verification is separate. An earlier check during a rebuild observed
transitional declarations; completed-build checks passed. Dependent checks must
use completed builds and shared package writers must be sequenced.

## Requirements that remain release work

| Surface                         | Remaining blockers                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports and types               | Public subpath adapters, globals, complete overload/augmentation/helper-package conformance, compiler-backed type-test suites and in-source testing/production removal.                                                                                                                                                                                                |
| Declarations/lifecycle/fixtures | Concurrent/shuffled suites, asynchronous collection timeout/failure interactions, around hooks, worker/builder fixtures, metadata/tags/task introspection, assertion-count timing and failure-listener parity, complete failure/timeout/retry interaction corpus.                                                                                                      |
| Assertions and utilities        | Full matcher/utility/reset/lifetime conformance, real ecosystem matcher packages, remaining clock operations and precise compilation/environment-stub diagnostics.                                                                                                                                                                                                     |
| Module mocks                    | Hoisting/actual imports, dynamic registration/reset, auto/manual/spy mocks, external/CommonJS ESM targets, cycles, other profiles and complete isolation/conformance.                                                                                                                                                                                                  |
| Snapshots                       | Complete filtered/partial/CI/watch policy parity, broader serializers/naming/error snapshots, retry/reset and failed-publication comparisons, cancellation/concurrent-edit/crash publication matrix. The existing retry primitive patch is a Next adaptation requiring maintained upstream assessment; it is not a stable exception approval.                          |
| Environments/browser            | jsdom/happy-dom/options/per-file declarations, actual browser-executed client tests and rendering helpers, browser watch/production mounting, advertised engine/platform acceptance, custom environments and Edge decisions. Node browser drivers are not Browser Mode.                                                                                                |
| Configuration/migration         | Typed executable configuration, automatic Vitest-config translation, precedence/projects/provided context/global setup, environment/reset/snapshot/report/coverage settings and actionable compiler-option mapping. JSON remains the only accepted config.                                                                                                             |
| CLI/watch/CI                    | Defaults, collected-case listing, changed/related selection, bail/timeouts/retries/focus policy, precise reference sharding semantics, incremental compilation/selection, parallel watch/browser execution and full PTY/output conformance.                                                                                                                            |
| Coverage                        | Production-quality statement/branch/function/line metrics, unimported sources, exclusions/thresholds/standard outputs, profile/mocking/watch support and shard aggregation. The existing imported-line metric is not full coverage.                                                                                                                                    |
| Tooling/reports                 | Full JSON/JUnit/empty-suite metadata and failure/publication conformance, watch/custom reporter adapters, Vitest blob adapter and editors/debugging/run/rerun/cancel/snapshot control interfaces.                                                                                                                                                                      |
| Next fidelity                   | Broad independent normal-application comparisons, route/layout/cache contracts, production mounting, prerender/PPR/action decisions and all-profile omission. Existing narrow profile checks are not broader guarantees.                                                                                                                                               |
| Adoption/release                | Representative unmodified downstream suite migrations, clean package-manager/Node/OS/architecture/browser matrix, CI qualification, sustained cleanup/crash/watch/resource stress and further process-ownership failure assessment, release/support/maintenance ownership and downstream canary/rollback. Performance budgets remain deferred by the user, not passed. |

The implementation retains experimental exports and precise unsupported-feature
errors. None of the rows above is closed by documenting a limitation. In
particular, the current unsupported subpaths, snapshot policies, environments,
configuration, mocks and fixtures have not been approved as stable exceptions.
