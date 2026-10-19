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

## Focused verification workflow

Use the saved full-run JSON to group failures by their earliest shared cause.
Select the affected contract names with `--testNamePattern` and include nearby
positive/negative controls; many contracts share one file, so selecting that file
alone reruns unrelated work. Keep captured output and inspect it without another
run. A new failure or code change justifies rerunning its affected selection.

Delegate independent areas to agents with scratch-only edits, guarded patches
and focused evidence. The parent reviews and integrates those patches, owns the
shared watch/build outputs, and builds once for the batch. Verify new behavior
through normal built modules and public commands as well as source proofs.
Reserve a full corpus run for a meaningful integration checkpoint. Keep focused
results separate from historical full counts; do not add them into a claimed
new whole-suite pass rate.

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

18. Added authoritative suite completion events through the compiled runner,
    worker, human evidence collector and machine reports. Empty suites are no
    longer lost, runnable empty suites fail, todo suites count as pending and
    nested after-all errors fail their suite/ancestors independently of passing
    cases. Final retries determine suite results; cancellation does not create
    empty-suite errors. Pristine module-collection failures report zero cases,
    preserving the reference's behavior. Next blob merging retains suite metadata
    and rejects malformed/duplicate/late/incomplete suite evidence before output
    replacement. Complete report/task metadata remains release work.
19. Applied name-pattern selection to todo cases as the pinned reference does:
    unmatched todo declarations become skipped. Added unchanged-body root,
    ancestor-qualified and unmatched regex comparisons, including suite counts.

20. Moved assertion-count verification to setup/body completion, before teardown
    and finished/failed listeners. Cleanup cannot repair a missing body count or
    invalidate a satisfied one; existing body failures and cooperative cancellation
    do not acquire misleading count errors. Pending assertion failures and cleanup
    remain observed. The unchanged-body reference compares both count APIs,
    setup/body assertions, late declarations, listeners, original failures, order
    and retries. A fresh-process cancellation check verifies spy restoration.
    Soft matcher/count failures coexist; rejected body promises bypass counts.
    JSON flattens the reference's one AggregateError level while the Next event
    log retains the original complete diagnostic tree and structured error name.
    Saved async stack headings are preserved in standard JSON failure messages.
21. Applied expected-failure inversion before numeric retry selection. An expected
    failure stops retrying; an unexpected pass retries when configured. The
    pristine corpus compares exact fixture/finished/failed-listener order, attempts,
    repeats and retained error messages from passing retries.
22. Reproduced and fixed a failed-repeat file/publication inconsistency. The CLI
    reference comparison failed because Next reported a passing file after an
    earlier repeat failed. Worker completion and snapshot authorization now use
    the final retry of each repeat and retain any failed/cancelled repeat. Earlier
    failed repeats and interrupted/poisoned runs cannot authorize staged snapshot
    writes. Full failure/timeout/retry/snapshot policy conformance remains open.

23. Added attempt-owned runtime `context.skip()` with boolean conditions, notes,
    the reference pending-error metadata and preserved production class naming.
    Skips from bodies/setup/fixtures/teardown/finished/failed listeners, caught
    skips, soft-error transitions and skips after failed retries/repeats match
    unchanged 5.0.4 bodies in development and production compilation. Standard
    outcomes preserve the reference's skip override while original errors remain
    in Next events. Teardown/fixture timing follows the reference's skip flow;
    framework resources and scope guards retain ownership. Public overloads and
    malformed skip-blob checks are covered. Complete lifecycle/timeout/context
    conformance remains release work.

24. Added structured retry count/delay/condition options, inherited declarations,
    optional defaults and fractional delays. Retry conditions use the last pinned
    processed error after teardown, listeners and expected-failure inversion;
    stateful RegExp state and earlier errors after empty aggregates are retained.
    Captured real timers avoid fake-clock stalls, and owning cancellation releases
    a waiting retry delay. The pinned error primitive ships in an inert separate
    bundle, keeping matcher registries out of collector/host realms. Thrown error
    arrays expand into individual failures; empty arrays still fail setup/body
    without supplying diagnostics or missing-count errors. Standard JSON preserves
    exact bare primitive/stackless messages, including multiline strings.

    The unchanged 25-case public corpus matches pristine published 5.0.4. That
    release's collection callback strips function conditions before RPC and worker
    execution (`vitest/dist/chunks/index.GYMZ12wH.js`, `sanitizeRetryConditions`).
    The public Next file runner retains this measured behavior. Standalone runner
    predicates are implemented separately with serialized names/messages/codes,
    cause/prototype checks, rejection and thrown-predicate cleanup tests. This is
    an exact-target quirk, not an approved exception or a claim that function
    filtering works in the published CLI. Stable range and upgrade policy remain
    undecided. Full timeout/retry/cancellation interactions remain release work.

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

## Continuation evidence: suite results and name filtering

The continuation uses the attached managed implementation worktree at
`/Users/timneutkens/.codex/worktrees/vitest-compatibility/next.js-2`, starting at
local checkpoint `72039134f0`. The main canary checkout remains clean.

- Fresh pinned dependency installation and `pnpm build-all` passed: 18 tasks.
  Log: `/private/tmp/next-testing-continuation-bootstrap.log`.
- Final core rebuild passed after the name-filter change.
  Log: `/private/tmp/next-testing-suite-filter-build.log`.
- Final integrated corpus: 28 suites and 547 tests passed, including real compiled
  snapshots in development/production Node, RSC and browser drivers.
  Log: `/private/tmp/next-testing-suite-complete-corpus.log`.
- Native scheduling acceptance: 10 tests passed after the suite-result change.
  Log: `/private/tmp/next-testing-suite-native-acceptance.log`.
- Final root types, changed-file ESLint and inventory drift check passed.
  Logs: `/private/tmp/next-testing-suite-filter-types.log`,
  `/private/tmp/next-testing-suite-filter-lint.log`, and
  `/private/tmp/next-testing-suite-inventory-check.log`.
- Pristine 5.0.4 comparisons now include module collection failure, empty/skipped/
  todo suite counters, nested cleanup errors and three name-filter selections.
  The reference's module collection failure exposes zero cases, so declared
  cases were not added to the failure report contrary to the initial hypothesis.

The watch process exited during an overlapping clean rebuild with missing
generated Rspack inputs. Completed core builds and acceptance subsequently passed;
no watch process remains. An initial type check overlapped declaration generation
and was replaced by a completed-build check. An accidental broad `test-unit` invocation was stopped;
that log contains unrelated Node environment test failures and is not a passing
verification claim. Subsequent runs explicitly selected paths. A collection
assertion initially matched the error text in its own source excerpt; the
corrected assertion checks the actual error heading and outcomes. The final
corpus above includes the corrected comparison.

This continuation does not rerun the previous clean external packed-installation
matrix or close the remaining release gates. Performance targets remain deferred.

## Lifecycle continuation evidence

The assertion-count, expected-failure retry and repeat-publication increments were
implemented in the same attached worktree; the main canary checkout remains clean.

- Completed core release rebuild passed after the JSON heading refinement:
  `/private/tmp/next-testing-lifecycle-parity-heading-build.log`.
- Final integrated corpus: 28 suites and 555 tests passed, including all pristine
  reference comparisons and cross-profile compiled snapshot acceptance.
  `/private/tmp/next-testing-lifecycle-parity-passing-corpus.log`.
- Native scheduling/coverage/snapshot/RSC/browser/crash/cancellation acceptance:
  10 tests passed against the completed rebuilt workspace.
  `/private/tmp/next-testing-lifecycle-parity-native.log`.
- Inventory drift check passed:
  `/private/tmp/next-testing-lifecycle-parity-final-inventory.log`.
- Final root types and changed-file lint passed:
  `/private/tmp/next-testing-lifecycle-parity-passing-types.log` and
  `/private/tmp/next-testing-lifecycle-parity-passing-lint.log`.
- Fresh-process snapshot checks reject write plans after a failed earlier repeat
  and an expected-failure timeout that poisoned the realm. Cooperative cancellation
  retains cleanup and restores spies. These checks run in the integrated corpus.
- The added repeat comparison reproduced the original bug before the fix: case
  failed, but file status passed. The final reference comparison passes.
  `/private/tmp/next-testing-repeat-result-baseline.log` preserves the reproduction.
- A compiled lifecycle fixture initially expected the old retry/listener counts.
  Its corrected body independently passed all 10 cases on published Vitest 5.0.4;
  the final compiled Next acceptance also passed.
  `/private/tmp/next-testing-collection-reference/compiled-lifecycle.json`.
- The expanded count corpus retained a soft failure and missing-count error, and
  exposed an async JSON stack-heading mismatch. Both are fixed without changing
  the original structured error name or removing event diagnostic evidence.

All watch builds started for these changes were explicitly stopped before final
release rebuilds, avoiding concurrent output writers. The original requirements
files remain unchanged. Previous clean packed-installation evidence is historical;
this continuation does not rerun that matrix or complete stable release gates.
Performance targets remain deferred.

## Runtime skip continuation evidence (October 14, 2026)

The goal remains the full stable requirements; this is another verified increment.
The main checkout remains unchanged and stable readiness remains false.

- Completed core rebuild passed: `/private/tmp/next-testing-runtime-skip-final-build.log`.
- Integrated corpus: 28 suites and 561 tests passed, including the existing
  cross-profile compiled snapshots and unchanged 16-case runtime-skip bodies on
  pristine published Vitest 5.0.4 versus development/production Next compilation.
  `/private/tmp/next-testing-runtime-skip-complete-corpus.log`.
- Native scheduling, mixed-mode, snapshot/coverage, RSC, crash/cancellation and
  browser/server resource acceptance: 10 tests passed.
  `/private/tmp/next-testing-runtime-skip-native.log`.
- Changed-file formatting and pinned inventory drift passed:
  `/private/tmp/next-testing-runtime-skip-format-check.log` and
  `/private/tmp/next-testing-runtime-skip-inventory.log`.
- Root types and changed-file lint passed:
  `/private/tmp/next-testing-runtime-skip-final-types.log` and
  `/private/tmp/next-testing-runtime-skip-final-lint.log`.
- Positive/negative public skip overload checks passed in root type checking.
  Fresh-process tests verify spy restoration, cleanup, and retained skip ownership.
  Report checks preserve superseded errors and reject malformed skip blobs.
- The production harness initially supplied NODE_ENV=development. Its compiler
  diagnostic is retained in `/private/tmp/next-testing-runtime-skip-production-diagnostics.log`.
  The harness now selects the matching environment and retains pre-collection
  diagnostics; production comparisons passed without weakening validation.

All owned watch builds were explicitly stopped before release rebuilds. These
checks do not complete the remaining lifecycle/timeout/fixture/context matrix,
external installation/platform qualification, or the other release requirements.
Performance work remains deferred.

## Structured retry continuation evidence (October 14, 2026)

The scope remains all stable requirements. This increment does not graduate the
experiment or approve any stable exception; the main checkout remains unchanged.

- Pinned primitive regeneration and completed core rebuild passed:
  `/private/tmp/next-testing-retry-final-primitives-build.log` and
  `/private/tmp/next-testing-retry-final-core-build.log`.
- Integrated corpus: 28 suites and 567 tests passed. It includes unchanged
  25-case structured retry bodies compared with the separately installed,
  integrity-checked, unpatched published Vitest 5.0.4 CLI. The corpus covers
  counts/defaults/inheritance, matching/rejecting/stateful conditions, cleanup,
  aggregate/array/primitive/stackless failures, empty errors and retained history,
  expected failures, repeats, fixtures, fractional real delays under fake timers,
  runtime skip and the published function-condition removal behavior.
  `/private/tmp/next-testing-retry-complete-corpus.log`.
- Native scheduling/resource acceptance: 10 tests passed.
  `/private/tmp/next-testing-retry-native.log`.
- Root types, owned source/fixture lint, formatting, inventory drift and unchanged
  original requirements checks passed. Logs:
  `/private/tmp/next-testing-retry-final-types.log`,
  `/private/tmp/next-testing-retry-final-lint-fixed.log`,
  `/private/tmp/next-testing-retry-final-format-check.log`,
  `/private/tmp/next-testing-retry-inventory.log`.
- Fresh external npm installation used newly packed Next/env/browser-adapter
  packages and a locally source-paired native package. Public authoring and
  browser declarations passed in both bundler and node16 resolution modes.
  Node (five cases), RSC (two cases) and browser-driver (two cases) projects passed.
  Node acceptance includes structured retries and typed predicate declarations.
  The installed native fingerprint and shipped inert error entry were checked.
  Artifacts, logs and provenance: `/private/tmp/next-testing-retry-packed/`.
- The first external probe incorrectly packed the registry native binary, which
  lacks test-entry support. The failure remains in `command-10.log`; the corrected
  package uses `packages/next-swc/native/next-swc.darwin-arm64.node`, verifies all
  1,213 recorded native source hashes and checks installed binary identity.
  `/private/tmp/next-testing-retry-packed-corrected.log` records successful Node
  and RSC runs after reinstalling that package.
- The fresh consumer resolved Playwright 1.64.0 and initially lacked its engine.
  Chromium 156.0.8078.4 was installed under the task-local temporary cache.
  Successful browser-driver evidence is
  `/private/tmp/next-testing-retry-packed/browser-final.log`; installation output
  is `browser-install.log`. These remain Node-owned browser-driver tests, not
  qualification of actual client-side Browser Mode or the full platform matrix.

All owned watch builds were stopped before release builds. Cancellation during
retry delay is separately verified as a Next ownership policy; the full reference
cancellation/timeout matrix remains open. Representative downstream migrations,
release/platform qualification and all other remaining requirement rows still
apply. Performance targets remain deferred by the user.

## Increment 25: independent and lazy expectation instances

The user-requested subagent added the runnable stable release gap suite under
`test/unit/app-dir/next-testing-stable-release-gaps`. Its original complete
baseline is 118 probes, 106 failing, 12 passing and none skipped. Every pristine
Vitest 5.0.4 reference has the required outcome. The README and historical
`baseline.json` distinguish observed failures from semantics blocked at a shared
prerequisite and identify external/unsettled release qualification separately.

The assertion runtime now exports `createExpect()` and provides lazy
`context.expect`. Each instance closes over separate matcher state and counters,
while asynchronous assertions and snapshots remain owned by the active attempt.
A bound instance rejects access from another test or a closed/disposed scope.
Fixture context copies retain accessors without reading them or eagerly selecting
local assertion-count state.

Published 5.0.4 resets global counters per try but retains a test-local instance's
counters across retries and repeats. Accessing that instance selects it over
global counts; manual instances are not automatically checked by the runner.
An unchanged eleven-case paired CLI fixture verifies those behaviors, separate
instances, soft/async errors and fixture setup/selection. Positive and negative
public declarations and fresh-process lifecycle ownership checks are included.
The inventory marks the factory export implemented without granting complete
conformance or stable readiness.

Evidence:

- Final core build and root TypeScript passed:
  `/private/tmp/next-testing-local-expect-core-build-final.log` and
  `/private/tmp/next-testing-local-expect-types-final.log`.
- The complete release suite now reports **104 red, 14 green, zero skipped**.
  Both `context-expect` and `create-expect` are newly green, and every original
  green control remains green. The entire 118-probe run was retained in
  `/private/tmp/next-testing-local-expect-tests.json` and per-contract evidence in
  `/private/tmp/next-testing-local-expect-release-evidence`.
- Existing regression corpus: 27 suites passed, with one new diagnostic-helper
  assertion failing because serialized errors can have a null prototype. After
  inspecting message fields directly, the complete 35-test lifecycle suite
  passed its focused rerun, including all 29 fresh-process integration cases.
  The eleven-case unchanged-body comparison against the pristine reference
  passes. Logs: `/private/tmp/next-testing-local-expect-regressions.log` and
  `/private/tmp/next-testing-local-expect-lifecycle-final.log`.
- An initial added paired fixture attempted to depend on `expect` from a fixture
  factory; published 5.0.4 rejects that dependency during collection. The fixture
  was corrected to compare valid fixture setup/global assertions with local body
  selection. The subagent's existing 118 acceptance fixtures were not altered.
- Native scheduling and resource acceptance passed all ten tests, covering
  parallel Node/RSC execution, crashes, cancellation, browser/server leases and
  port cleanup: `/private/tmp/next-testing-local-expect-native.log`.
- Final formatting and corrected diagnostic-test lint passed:
  `/private/tmp/next-testing-local-expect-format-check.log` and
  `/private/tmp/next-testing-local-expect-diagnostics-lint.log`.
- Lint and inventory drift passed:
  `/private/tmp/next-testing-local-expect-lint-final.log` and
  `/private/tmp/next-testing-local-expect-inventory-check.log`.

The full stable release suite remains red. No unsupported prerequisite or external
release gate has been approved as an exception, and performance stays deferred.

## Increment 26: task metadata, annotations, tags and signal lifetime

The runner now constructs stable public task/file/suite graphs for context
introspection. Root tests have no parent suite; nested identities and parent/file
references are real. Live results expose processed errors, hook states,
retry/repeat counters and final outcomes. Task error serialization clones its
input before the pinned serializer mutates diff/cause fields, preserving original
assertion diagnostics. Soft errors update the public task immediately without
being duplicated when finalization records them.

Declaration `tags` and `meta`, project tag definitions/priority and `strictTags`
are supported. Metadata merges tag, parent suite and own values in the published
order; tag inheritance is deduplicated. The worker carries actual metadata to
JSON/Next blob results, and standard JSON omits duration for unexecuted static
skip/todo selections. Public `Assertion` and `AsymmetricMatchersContaining`
interfaces support the reference augmentation form and assertion modifiers.
`TestAPI`, task/context and augmentable `ProvidedContext` declarations are exposed;
provided-context runtime injection and complete fixture overloads still need work.

`context.annotate` supports both overloads, default/custom types, compiled original
locations, inline string/binary bodies, HTTP(S) links and retained local files.
Local files use the reference path-hash/name normalization and are copied to
`attachmentsDir` (default `.vitest/attachments`). Unawaited operations are drained,
publication failures fail their attempt, and explicitly caught failures remain
caught. Annotations retain attempt/revision ownership in worker events and Next
blobs, with invalid/foreign/completed ownership rejected before publication.
The regular-run `bench` context accessor has the pinned diagnostic; dedicated
benchmark/provider execution remains unsupported.

A test owns one signal across its retries and repeats. Ordinary success/failure
leaves it live; timeout/run cancellation still abort it. Async scope sealing and
process/resource ownership remain separate from signal abortion.

Evidence:

- Final core build, root TypeScript, complete changed-file lint and inventory
  drift passed. Logs: `/private/tmp/next-testing-task-metadata-core-build-final.log`,
  `/private/tmp/next-testing-task-metadata-types-final.log`,
  `/private/tmp/next-testing-task-metadata-lint-final.log`, and
  `/private/tmp/next-testing-task-metadata-inventory-final.log`.
- The complete release suite now has **95 red, 23 green, zero skipped**. Nine
  probes are newly green since increment 25: task metadata, annotations, successful
  signal lifetime, regular benchmark diagnostics, configured tags/meta, failure
  listener context, JSON metadata, public context types and matcher augmentation.
  Every earlier green control remains green and every pristine reference has its
  required outcome. Full results:
  `/private/tmp/next-testing-task-metadata-complete-corpus.json`; per-probe data:
  `/private/tmp/next-testing-task-metadata-final-release-evidence`.
- The existing 28-suite corpus has 570 passing tests across the full run and a
  targeted browser rerun. The full combined command incorrectly set the pristine
  Playwright 1.64 cache globally, preventing the repository's 1.61 driver from
  finding its Chromium 1228 executable. All three affected suites (26 tests),
  including development/production inline snapshots and signal/resource tests,
  passed with their normal driver cache. Logs:
  `/private/tmp/next-testing-task-metadata-complete-corpus.log` and
  `/private/tmp/next-testing-task-metadata-browser-regressions.log`.
- The unchanged eleven-case `task-context.case.mjs` body compares task graph
  identity, error/retry/repeat/listener state, tag priority/inheritance, mutable
  metadata, annotation locations and actual retained/inline/URL attachments with
  the pristine published 5.0.4 runner. The fresh-process lifecycle corpus has 31
  passing cases, including unawaited/handled annotation failures, retained files,
  live soft errors and retained-owner rejection. The reporting corpus adds actual
  annotation blob round trips and malformed/forged ownership refusal without
  replacing previous output bytes.
- Native compiler scheduling/resource acceptance passed all ten tests, including
  parallel Node/RSC contexts, worker/compiler crashes, active cancellation and
  browser/server lease/port cleanup:
  `/private/tmp/next-testing-task-metadata-native.log`.
- Final formatting, whitespace and unchanged original requirement documents
  checks passed. `/private/tmp/next-testing-task-metadata-format-check.log`.
- The original type-probe adapter mapped `vitest` directly to a runtime `.js`
  file. TypeScript 6.0.2 resolves that explicit path as untyped JavaScript,
  bypassing the adjacent declarations. The adapter now resolves the shipped
  public wrapper without an extension; the `.txt` inputs, strict settings and
  pristine required outcomes are unchanged. The historical baseline remains
  untouched, and fixture-builder/worker overloads now report their genuine type
  failures rather than an adapter error.
- The first new attachment fixture incorrectly assumed a filesystem error code
  survived the reference's RPC boundary. Its caught-failure assertion now uses
  the actual ENOENT diagnostic. An omitted failure-listener import in the new
  standalone ownership fixture was also corrected. Original release contract
  bodies were not altered.

Full task/controller/context-identity, annotation error-boundary/attachment
matrix, custom artifacts/reporters, benchmark providers and the other stable
release requirements remain open. No supported range or stable exception has
been approved, and performance targets remain deferred.

## Increment 27: executable configuration, globals and provided context

The public CLI now evaluates JavaScript/TypeScript configurations (including
CommonJS, async factories, promise exports and top-level await) in a separate
owned process. Relative helper graphs are transformed with Next's SWC bindings;
configuration helpers are inert adapters, and importing a Vitest/Vite controller
is rejected. Config imports are fresh between sessions. Selection uses explicit
Next-test, Vitest, then Vite precedence and rejects multiple files at the same
precedence level. Compatible discovery/project settings are translated; compiler
aliases receive a specific migration diagnostic naming the affected specifiers.
Unsupported compiler/environment/settings remain explicit errors.

Configuration services remain alive through execution. Global setup runs before
collection, can provide serializable context, and retains teardown functions in
reverse order. Teardown failure, cancellation, transport failure and descendant
cleanup remain owned by the parent. Actual HTTP-service lifetime, Date/Map/BigInt
transport, teardown ordering/failure, cancellation and fresh helper reloads have
observable tests. Optional globals install the same emitted facade used by setup
and spec imports, and restore prior descriptors on file disposal. Both public
`inject` and test-context injection use the file's provided values and the Next facade's public
augmentation types. The supervisor transport uses advanced serialization.

The user-requested test subagent added 32 independently reference-validated
interaction probes, expanding the release suite from 118 to 150. Its historical
baseline and original requirements were preserved. Before implementation, the
added set had 26 red and six green controls; exact mapping and independently
recorded evidence live in the release-gap README and
`added-contract-evidence.json`.

Evidence:

- The complete 150-probe paired run has **104 red, 46 green, zero skipped**.
  All 23 previous passing probes remain green, and 17 more probes pass relative
  to the combined 29-green baseline. New passes cover globals, provided context,
  global setup, executable/migrated configs, all five factory/helper formats,
  promise/top-level-await exports, live config services, structured provided
  values, teardown ordering/failure and precise compiler alias diagnostics.
  Full output: `/private/tmp/next-testing-config-published-release.log`;
  structured results: `/private/tmp/next-testing-config-published-release-results.json`;
  every paired reference/Next observation:
  `/private/tmp/next-testing-config-published-release-evidence`.
- Final existing regression corpus: **28 suites, 584 tests passing**.
  `/private/tmp/next-testing-config-group-existing-corpus.log` and `.json`.
  The native scheduling/real-CLI suite also passed all ten tests after the final
  ownership fix (`/private/tmp/next-testing-config-group-native.log`).
- The first broad regression run exposed an intermittent Darwin group-probe
  failure. Twelve fresh crash probes reproduced it twice: `kill(-pgid, 0)`
  returned EPERM after descendants had disappeared. Cleanup now checks actual
  process membership for that ambiguous probe, retains real permission failures
  or an unavailable membership observation, and avoids repeated successful
  SIGKILL signals. Deterministic empty/live-group tests pass. All twelve actual
  crash/descendant probes then preserved exit 7 and reclaimed the descendants:
  `/private/tmp/next-testing-config-watch-crash-stress-fixed.log`.
  This closes the reproduced race, not the entire platform/resource matrix.
- Final core build/declarations, root TypeScript, changed-file lint, formatting
  and pinned inventory drift checks passed. Logs:
  `/private/tmp/next-testing-config-group-core-build.log`,
  `/private/tmp/next-testing-config-group-types.log`,
  `/private/tmp/next-testing-config-published-lint-final.log`,
  `/private/tmp/next-testing-config-group-lint.log`,
  `/private/tmp/next-testing-config-published-format-check.log`,
  `/private/tmp/next-testing-config-group-format-check.log`, and
  `/private/tmp/next-testing-config-published-inventory.log`.

This increment does not establish full config/helper/default/type parity,
function-valued config transport, external/glob project configs, persistent
Vitest-equivalent global-setup semantics across watch generations, mock/clock
reset and lifetime options, setup/hook sequence options, other environments,
reporter/coverage/snapshot settings or the external acceptance matrix. Watch
configuration realms are owned and fresh per generation; reference parity for
long-lived watch setup is still required. Public compiled `vitest/config` imports
remain a native alias work item. The 104 failing probes remain intact, the stable
range is still undecided, `stableReady` remains false, and the overall goal stays
active.

## Increment 28: per-try resets, file utility lifetime and hook lists

Public compiled execution now owns clocks, global/environment stubs and mocks
for the file lifetime. Ordinary attempt completion preserves those resources;
explicit restore methods and authoritative final file disposal release them.
Assertions, queued failures and retained asynchronous scope guards remain owned
by their attempt. The private assertion integration tests explicitly select
attempt resource ownership to keep verifying immediate disposal independently
of the public Vitest defaults; their assertions were preserved.

Before every retry/repeat, reset settings run in published 5.0.4 order:
restoreMocks, mockReset, clearMocks, unstubEnvs, then unstubGlobals. clearMocks
defaults to true; the other options default to false. Config validation, project
supervision and emitted worker initialization carry all five options. Configured
false values remain false and retain prior call history. Fixture/user setup runs
after these resets.

sequence.hooks now supports stack and list for same-suite after hooks, returned
setup cleanups and finished/failed listeners, while nested suites still tear down
inside-out. Explicit sequence.setupFiles list uses the existing ordered compiled
loader. Parallel hooks and parallel setup loading remain unimplemented and are
rejected when explicitly requested.

Reset and utility methods now return the actual public vi facade, including
async utility results. Promise assimilation sees an ordinary non-thenable object.
Public fluent types retain mock generics and Promise<typeof vi>, and do not
expose the private assertion resource dispose method. Two added unchanged-body
contracts independently verify chaining identity and explicit clearMocks false
with pristine Vitest 5.0.4. The historical baseline is untouched.

Evidence:

- Full release comparison: **152 probes, 60 green, 92 red, zero skipped**.
  Every previous 46-green control remains green, and no pristine reference
  fixture is invalid. Twelve existing probes became green: clearMocks reset,
  setup list order, unstubGlobals, hook list order, default global/env/clock/spy
  persistence, mockReset, restoreMocks, unstubEnvs and retry/repeat clearing.
  The two new fluent-identity/clearMocks-false checks also pass. Full log/results:
  `/private/tmp/next-testing-reset-final-release.log` and
  `/private/tmp/next-testing-reset-final-release-results.json`. Per-probe paired
  observations: `/private/tmp/next-testing-reset-final-release-evidence`.
- All **584 existing tests in 28 suites pass**, including the public declaration
  fixture and compiled Node/RSC/browser snapshot/cleanup controls:
  `/private/tmp/next-testing-reset-final-existing-corpus.log` and `.json`.
- All **ten native scheduling/real CLI integration tests pass**:
  `/private/tmp/next-testing-reset-final-native.log`.
- Core build/declarations, repository types, changed-file lint, formatting and
  inventory drift pass: `/private/tmp/next-testing-reset-final-core-build.log`,
  `/private/tmp/next-testing-reset-final-types.log`,
  `/private/tmp/next-testing-reset-final-lint.log`,
  `/private/tmp/next-testing-reset-final-format-check.log`, and
  `/private/tmp/next-testing-reset-final-inventory.log`.

This evidence does not close complete utility/clock APIs, file/worker/builder
fixture interactions, around/parallel hooks, cleanup/error/timeout parity,
context identity across retries, serializers or compiler-inlined environment
stubs. Public config helper/default/types and compiler-dependent migration also
remain incomplete. The remaining 92 release failures and the independent
external/undecided gates remain required; stableReady stays false and the overall
goal remains active.

## Increment 29: pinned standalone fake clock and owned waits

Replaced the partial hand-written scheduler with independently bundled
fake-timers 15.4.0 and the unchanged patch used to build published Vitest 5.0.4.
The Next-owned clock class adapts the pinned source while importing no Vitest/Vite
runner or controller. Raw native timer/promisify modules are supplied to the
standalone package during context capture; the prior bridge descriptor is
restored immediately. Generated declarations, dependency licenses and upstream
Jest/Vitest adapter notices ship with the separate primitive entry. Existing
assertion/spy/snapshot bundles are unchanged by regeneration.

Clock creation is lazy, as in the reference. Fake-time selection/exclusions,
loop limits, advancement, tick modes, microtask draining, async pending/all/next
operations, next-frame advancement, Date-only mocking and real-time observation
use the pinned engine. Project fakeTimers settings cross the real configuration,
supervisor and file-worker paths and merge with per-call settings. Defaults are
loopLimit 10000 and shouldClearNativeTimers true. Child-process identity is
captured before user code; nextTick faking remains rejected in this profile.

waitFor and waitUntil reproduce reference polling, return values, callback/error
and fake-clock advancement behavior using captured real interval/deadline timers.
Their resources are owned by the utility lifetime and cancelled at disposal;
closed-scope polling cannot borrow a later attempt. A regression checks cleanup
after multiple falsy waitUntil callbacks, which must stay registered until a
truthy result, rejection, timeout or disposal. Public generic/negative type cases
check truthy narrowing, timer-name restrictions and advanced options/methods.

Evidence:

- Full paired release suite: **154 probes, 67 green, 87 red, zero skipped**.
  All previous 60-green probes remain green and no pristine fixture is invalid.
  Five existing probes became green: fake microtasks, async timer/microtask
  interleaving, waitFor fake-clock advancement, waitUntil and Date-only mocking.
  Two added unchanged-body controls pass in both runners: lazy Node RAF provider
  capture/next-frame draining and a configured three-timer loop limit. The RAF
  control is a Node provider test, not jsdom or genuine Browser Mode acceptance.
  Log/results: `/private/tmp/next-testing-fake-clock-final-release.log` and
  `/private/tmp/next-testing-fake-clock-final-release-results.json`.
  Every paired observation: `/private/tmp/next-testing-fake-clock-final-release-evidence`.
- Existing corpus plus owned-wait cancellation: **28 suites, 585 passing tests**.
  `/private/tmp/next-testing-fake-clock-final-existing-corpus.log` and `.json`.
  All **ten native scheduling/real CLI tests pass**:
  `/private/tmp/next-testing-fake-clock-final-native.log`.
- Exact dependency/patch installation, licensed primitive regeneration, core
  build/declarations, root types, changed-file lint, formatting and inventory drift
  pass. Logs: `/private/tmp/next-testing-fake-timers-install.log`,
  `/private/tmp/next-testing-fake-clock-primitives-final.log`,
  `/private/tmp/next-testing-fake-clock-final-core-build.log`,
  `/private/tmp/next-testing-fake-clock-final-types.log`,
  `/private/tmp/next-testing-fake-clock-clean-lint-final.log`, `/private/tmp/next-testing-fake-clock-final-format-check.log`
  and `/private/tmp/next-testing-fake-clock-final-inventory.log`.
- A direct standalone primitive check verified 15.4.0, preservation of the prior
  bridge descriptor and inclusion of the Facebook/Jest license notice.

This does not qualify every timer/environment/RSC/browser callback interaction,
unawaited-operation and cancellation matrix, complete public types, worker/builder
fixture ownership or alternate pools. The jsdom/browser frame probe still needs
those actual environments, and compiler-inlined env stubs remain open. All other
87 failing release probes and external/undecided gates remain required. The stable
range is undecided, stableReady stays false, and the overall goal remains active.

## Increment 30: compiled serializer modules and snapshot selection policy

Added thrown-error snapshot matchers, including primitive values and promise
modifiers, while capturing inline locations before asynchronous wrappers. Public
serializer registration now has file lifetime and configured serializers load
before setup in the real Node/RSC compiler graphs. Native test-entry ABI 2 carries
serializer module inputs explicitly. The compiler's inert vitest/config alias
exposes supported configuration helpers; the missing config defaults remain open.

Complete filtered updates preserve skipped/unselected keys and prune obsolete
selected/absent keys, including when selected tests stop calling a matcher. A
reference check corrected an initially invalid expectation: filtered read-only
runs report obsolete keys but exit successfully under published Vitest 5.0.4.
The implementation preserves this distinction from full read-only selection.

Five additional unchanged-body fixtures compare inline error/promise snapshot
bytes, package-import serializers, absent-key pruning, no-call pruning and
filtered read-only preservation. The earlier complete 157-probe run had 75 green
and 82 red with valid references; the subsequent 159-probe run exposed the invalid
read-only expectation, which has been corrected. Its former failure is not
counted as an implementation gap. The expanded full-suite validation is recorded in increment 31 below. Historical requirements and baseline evidence remain unchanged.

Native rebuild and full bootstrap pass, followed by a successful core build for
the read-only correction. A native schema change required clearing only the
compiled acceptance fixture's stale Turbopack cache after an UnexpectedEnd decode
panic. Fresh graphs were unaffected. The old private partial-update expectation
now asserts canonical pruning rather than retaining absent keys.

Evidence available before the additional interaction audit:

- Native build: /private/tmp/next-testing-snapshot-native-build.log;
  full bootstrap: /private/tmp/next-testing-snapshot-bootstrap-build.log.
- Paired 157-probe run: /private/tmp/next-testing-snapshot-new-release.log
  and /private/tmp/next-testing-snapshot-new-release-results.json.
- Existing corpus after the cache/expectation correction: 28 suites, 585 passing
  tests, /private/tmp/next-testing-snapshot-existing-corpus-corrected.log.
- Ten native CLI/scheduling tests pass:
  /private/tmp/next-testing-snapshot-native-acceptance.log.
- Final read-only core correction, root types, changed production/harness lint
  and inventory checks pass: /private/tmp/next-testing-snapshot-reference-correction-
  {core-build,types,lint,inventory}.log. Fixture lint is checked by the test audit.

A subsequent full corpus exposed an intermittent watcher-child natural-exit
failure. After the read-only source correction, the full 28-suite corpus passes
all 585 tests (/private/tmp/next-testing-snapshot-reference-correction-existing-
corpus.log and .json). The intermittent natural-exit observation remains
unresolved rather than dismissed as a compatibility exception.
Durable crash recovery remains red, and complete serializer/environment/watch
interactions remain release requirements. stableReady stays false and the overall
implementation goal remains active.

## Increment 31: remaining-requirement test audit

The explicitly requested test subagent audited every remaining ledger row and
added 23 unchanged-body contracts to the existing generated suite. They exercise
runtime config/reset and import settling, recursive equality extensions, temporary
spy implementations, parallel hooks/setup, external/glob asynchronous project
configs and state isolation, discovery and CLI precedence, serializer order/file
ownership, file and production/browser snapshots, actual compiler transforms,
empty modules/error causes and coverage retry/failure/mock/production/browser
interactions. The audit changed no production implementation.

All 23 pristine Vitest 5.0.4 references have valid outcomes: **16 expose current
Next gaps and seven are passing controls**. Invalid initial fixture assumptions
were corrected against the public reference and are excluded from the final gap
count. Coverage proof retains actual original-source JSON/LCOV, including
statement/function/branch metrics and uncovered-file zeros. Only independent
external/glob project report order is normalized; exact names/counts/outcomes and
setup/provide isolation assertions remain required.

The frozen complete release run now has **182 probes: 84 green, 98 red, zero
skipped, no invalid references**. The corrected filtered read-only contract and
all other prior passing probes remain green. Final log/results:
/private/tmp/next-testing-uncovered-full.log and
/private/tmp/next-testing-uncovered-full-results.json. Per-probe evidence:
/private/tmp/next-testing-uncovered-full-evidence. Original-source coverage proof:
/private/tmp/next-testing-uncovered-coverage-reference-proof.json. The new contract
manifest/evidence and complete remaining-row map are beside the suite README.

Root TypeScript, all new fixture/harness lint and formatting pass. The root-owned
snapshot correction also passes the 28-suite, 585-test existing corpus, core build,
types, changed production/harness lint, formatting and inventory drift checks.
Original stable/remaining requirement files and historical baseline evidence are
preserved; the main checkout remains clean. No commit or push was made.

Tests blocked by shared configuration/environment/coverage/report prerequisites
remain distinguishable from independently reached behavior. This is finite local
acceptance, not exhaustive cross-feature or downstream/platform qualification.
Selected real migrations, additional advertised OS/Node/architecture/package
manager/browser runners, sustained reliability, unsettled cache/action/layout/
editor invocation contracts, release/support/canary/rollback decisions and deferred
performance targets remain open. No arbitrary failing assertions stand in for
those requirements. stableReady stays false; the overall implementation goal
remains active with 98 failing release probes.

## Increment 32: runtime utilities, equality testers and compiler import settling

Exposed the pinned equality tester registry through every expectation instance.
Recursive and asymmetric comparisons use the same registry as custom matchers;
file cleanup removes only owned registrations and preserves earlier entries.
The existing custom-equality-testers contract now passes unchanged.

Added shallow file-owned setConfig/resetConfig with void returns and the original
configuration snapshot captured on first mutation. Fake clock installation,
per-try mock resets, polling and assertion requirements read mutable settings.
Declaration-time test/hook timeout defaults read the same file configuration.
Concurrent/parallel hook execution and complete console/controller/runtime-option
interactions remain release work. The existing runtime-config-reset contract
now passes unchanged. Public positive/negative declarations check void returns,
clock names, equality callbacks and rejection of collection-only retry settings.

Added dynamicImportSettled against the actual compiled entry's Turbopack context.
File-owned loader descriptors track chunks, dev on-demand compilation and native
external ESM. Repeated captured real turns observe asyncModule promises in the
actual module cache, including unreturned nested imports. Exporting an arbitrary
pending CommonJS Promise is not pending evaluation. Cleanup restores owned loader
descriptors and cancels settling turns/waits. Normal application templates do not
install the adapter. Both Node and RSC test templates supply the bridge; older
component-only entries without it retain an explicit missing-runtime diagnostic.

The original dynamic-import-settled contract now passes. An additional unchanged
dynamic-import-settled-tla control passes in both public runners: delayed nested
TLA modules under fake timers, captured real delay providers, a permanently pending
CommonJS Promise export and a void return. The suite now defines 183 probes.
Historical baseline, original fixture bodies and requirements remain unchanged.

Verification available before the full release run completes:

- All four focused paired utility/equality/import comparisons pass.
  /private/tmp/next-testing-runtime-utilities-import-focused.log and
  /private/tmp/next-testing-runtime-utilities-import-focused-results.json.
- Existing corpus: 28 suites, all 585 tests pass.
  /private/tmp/next-testing-runtime-utilities-final-existing-corpus.log and .json.
- All ten native scheduling/real CLI tests pass, including parallel/mixed-profile
  execution, coverage/snapshots, worker/compiler crashes and browser cancellation.
  /private/tmp/next-testing-runtime-utilities-final-native.log.
- Final core build/declarations, root TypeScript, lint, formatting, compatibility
  inventory and whitespace checks pass. Logs use the prefix
  /private/tmp/next-testing-runtime-utilities-final- with core-build.log,
  types-2.log, lint-2.log, format-check.log and inventory.log.
- The first declaration build rejected the broader parallel-hook runtime type;
  the existing unsupported guard now rejects it without executing stack semantics.

The frozen complete release suite passes **88 probes and fails 95 out of 183**,
with zero skips and no invalid references. All 84 previous passing probes remain
green; three former failures are recovered and the delayed-import control adds
one pass. Full results: /private/tmp/next-testing-runtime-utilities-final-release.log
and /private/tmp/next-testing-runtime-utilities-final-release-results.json; all
paired observations: /private/tmp/next-testing-runtime-utilities-final-release-evidence.
The remaining compatibility requirements retain their full scope: no stable
exception is granted by these four controls. Broader RSC/browser import-settling,
external/cyclic/cancellation and runtime-option interactions remain qualification
work; the Node paired cases and native profile corpus do not prove every matrix.
stableReady stays false and the overall goal remains active with 95 red probes.

## Increment 33: parallel hook groups and compiled setup module evaluation

Implemented bounded parallel hook/cleanup/failed-listener groups using the
configured maxConcurrency (default five), retaining nested suite boundaries and
observing remaining owned hook work before file release. Hook modes accept
stack/list/parallel; finished listeners retain the pinned 5.0.4 stack order.
Public setupFiles defaults to list; explicit parallel setup is carried through
Node/RSC compiler templates and setup ABI 3 without a new NAPI argument.
Collection/setup assertions now use a file-owned scope, with collection utility
and serializer ownership retained until file disposal.

Setup modules use compiler-owned ESM namespace wrappers with shared imports of
the original processed modules. Late shared requires await real top-level-await
evaluation without awaiting a CommonJS exported promise. The original RSC
transition and shared component boundaries remain intact. Expanded test entries
also discard their pre-expansion distribution map: that stale map produced a
column beyond the injected setup-loader line and broke native coverage. The
compiler now maps the actual generated harness; application/specification maps
and strict coverage-coordinate validation are preserved. The isolated emitted-map
proof is under /private/tmp/next-testing-coverage-coordinate-maps.

Verified final compiler changes:

- All **13 focused setup/hook reference controls pass**, including default list
  development Node and production Node/RSC, bounded parallel phases, parallel RSC
  development/production, and CommonJS pending-promise exports in production
  Node/RSC. Results: /private/tmp/next-testing-setup-evaluation-final-focused-results.json;
  paired evidence: /private/tmp/next-testing-setup-evaluation-final-focused-evidence.
- All **ten native scheduling/public CLI tests pass**, including coverage and
  resource cleanup: /private/tmp/next-testing-setup-evaluation-final-native.log.
- All **585 tests in the existing 28-suite corpus pass**:
  /private/tmp/next-testing-setup-evaluation-final-corpus.json.
- Native compilation and all 18 bootstrap tasks pass:
  /private/tmp/next-testing-setup-sourcemap-native.log and
  /private/tmp/next-testing-setup-sourcemap-bootstrap.log. Root TypeScript passed
  before the Rust-only map correction; Rust formatting, fixture lint/format and
  the inventory check pass.

The first complete 192-probe checkpoint (all 188 existing probes plus four new
setup-evaluation controls) records **96 passing and 96 failing**, with no skips
and no invalid reference fixtures:
/private/tmp/next-testing-parallel-hooks-release-results.json. It preserves all
88 previous passing probes and recovers the two parallel-hook/setup failures.
Three new RSC controls initially omitted their App Router fixtures; those inputs
were corrected and all 13 relevant final controls now pass. A fresh complete
count is intentionally deferred to the next integrated implementation checkpoint,
rather than rerunning the full suite for every narrow correction. Grouped saved
failures are in /private/tmp/next-testing-compatibility-failure-groups.json.

No existing compatibility contract was weakened, skipped or removed. All stable
requirements remain in scope, performance budgets remain deferred, and
stableReady remains false. Lifecycle, CLI and config-helper fixes continue in
parallel with one shared watch and one owner for final builds.

## Increment 34: around hooks, CLI controls, config helpers and report outcomes

Implemented real aroundEach/aroundAll phases, nested ordering and per-phase
supervision through the Next runner. Suite wrappers suspend and restore the
active assertion scope while their continuation runs; closed or suspended owners
cannot acquire another case's assertions. Failed setup does not retain partial
returned cleanup, and failed after hooks stop the remaining hook/cleanup chain,
matching the pinned reference. Existing cleanup/snapshot assertion checks remain
covered in successful teardown cases.

The public CLI now forwards retry, bail, case/hook timeouts, allowOnly and
passWithNoTests with explicit zero/false precedence. Bail counts final failed
outcomes across files and records unstarted cases separately from runtime skips.
JSON, human summaries and validated merge artifacts preserve that distinction.
JUnit case names and class names now follow the reference's ancestor/source
layout. Added one reference control for globals-based around hooks and assertType.

The vitest/config adapter exposes the eight runtime helpers/defaults from 5.0.4.
External/glob project factories run in independent configuration sessions, with
child setup before root setup, child-owned provided values and ordered teardown.
Same-root project declarations now pass the original contracts; broader project
roots, containers and complete public configuration types remain work. Public
vi.mockObject uses the pinned standalone automocker with Next-owned spy lifetime;
Chai should uses the real primitive with assertion ownership and descriptor
restoration. Neither addition loads a Vitest controller or Vite pipeline.

Verification uses focused tests during repairs and one frozen batch checkpoint:

- **17/17 affected public reference probes pass**:
  /private/tmp/next-testing-increment34-final-focused-results.json.
- The complete checkpoint has **116 passing, 77 failing, zero skipped across
  193 probes**, with no invalid reference fixtures or regressions from the prior
  96 passing probes: /private/tmp/next-testing-increment34-checkpoint-results.json.
  It recovers 19 existing failures (including the three corrected RSC fixture
  controls from increment 33), and the new globals control passes. The grouped
  saved failures are /private/tmp/next-testing-compatibility-failure-groups.json.
- All **ten native scheduling/public CLI tests pass**:
  /private/tmp/next-testing-increment34-checkpoint-native.log.
- Related unit suites recorded 266 passing and two failing checks before their
  targeted corrections. A new config-helper expectation was corrected against
  the pristine reference (class values merge; Date values replace), and the old
  teardown test was split to preserve both failure and successful-cleanup
  assertions. All three helper checks and the full 35-case fresh-process
  lifecycle/assertion integration pass after those corrections:
  /private/tmp/next-testing-config-helper-durable-tests.log and
  /private/tmp/next-testing-increment34-facade-final.log. This does not claim a
  second complete unit-suite run.
- All 54 config-helper differential checks, 19 environment/TTY process controls
  and the ESM shim proof pass; paired external/glob project proofs also pass:
  /private/tmp/next-testing-config-helper-proof.log and
  /private/tmp/next-testing-project-config-proof.log.
- The final core build, root TypeScript, inventory validation and changed-file
  lint/format checks pass. Build and checkpoint logs use the
  /private/tmp/next-testing-increment34- prefix. The clean main checkout remains
  unchanged; all implementation work is in the existing compatibility worktree.

The next independent slices are builder/file fixtures, machine reports for watch
generations, and compiler-owned hoisted helpers/actual imports. Their subagents
work from hashed scratch baselines while checkpoints run. Each slice first runs
its relevant source checks and reference contracts; another complete checkpoint
is reserved for a meaningful integrated batch. No existing reference contract was
weakened, skipped or removed. All stable requirements remain in scope,
performance budgets remain deferred, no stable exception is approved, and
stableReady remains false.

## Increment 35: builder fixtures, watch reports and compiler-owned actual imports

Builder fixtures accept named declarations, direct or asynchronous returned
values, dependency lookup and owned onCleanup callbacks. Extended test APIs bind
fixture-aware hooks; cases and hooks resolve suite overrides at execution time.
File fixtures retain their file lifetime and retry/attempt cleanup remains
separate. Worker scope and cross-file worker reuse remain required work.

Each watch generation now owns a fresh machine reporter. Publication awaits the
parent's sealed result, worker/resource cleanup and snapshot commit; aborted or
superseded generations cannot publish. Exact report targets and their temporary
files are excluded from watch inputs. Empty selections replace stale reports;
this is a Next freshness guarantee, not established upstream parity for deleting
the final file. Configured string/RegExp name patterns and maxWorkers reload with
configuration. Browser execution and complete dependency-based selection remain
open.

The public invocation lock now spans the entire watch session as well as one-shot
runs. Snapshot publication writes an owned journal before replacing any target.
Restart, under that lock, rolls back only recognizable aborted bytes, preserves
concurrent user edits and retains conflict evidence. Prepared and recovery files
have deterministic ownership; cleanup precedes removal of rollback authority.
Cancellation observed after the final rename still rolls back. This qualifies
process-crash recovery; power-loss/directory-fsync durability is not established.

The Next compiler extracts validated hoisted declarations into the pre-spec
registration module and imports the shared bindings back into the specification.
Literal vi.importActual calls use compiler-resolved original graph edges, retaining
namespace identity and real top-level-await evaluation. Both features remain
bounded to development Node/project-local ESM in this increment. Dynamic targets,
setup mocks/hoisting, external/CommonJS targets, cycles and other profiles remain
release requirements; no Vitest controller or Vite runtime fallback was added.

Verification:

- **15/17 affected original public probes pass**:
  /private/tmp/next-testing-increment35-focused-final-results.json and paired
  /private/tmp/next-testing-increment35-focused-final-evidence. This recovers the
  three original builder/scoped-hook probes, two original hoisted/actual-import
  probes, both parent-crash recovery cases and six watch-generation scenarios.
  The two already-passing alias/file-isolation controls remain green. Addition
  still executes an extra existing file; parallel execution has correct outcomes
  but the compared report file order differs. Eight isolated pristine runs later
  produced both orders (six second/tracked, two tracked/second), demonstrating a
  nondeterministic oracle: /private/tmp/next-testing-watch-order-proof/results.json
  and analysis.json. The original equality assertion remains unchanged; no sample
  order is treated as a stable upstream guarantee. Neither assertion was weakened.
- Four additional compiler controls pass pristine 5.0.4 unchanged. Next passes
  **3/4**: importActual without a mock, repeated/TLA namespace identity, and an
  aliased/destructured hoisted spy. The partial-factory control exposes a genuine
  gap: a spread's copied scalar is incorrectly forwarded live. Results:
  /private/tmp/next-testing-increment35-new-mock-controls-results.json. Original
  contract rows remain intact; the suite now contains 197 probes. There has not
  been a complete 197-probe run, so increment 34 remains the last full count.
- **306 checks in the four affected lifecycle/watch/reporting/CLI unit suites
  pass**: /private/tmp/next-testing-increment35-integrated-units.json. Subsequent
  journal/lock followups pass all **15 snapshot-publication checks** and the
  affected generation check: /private/tmp/next-testing-snapshot-journal-all-final.log
  and /private/tmp/next-testing-journal-targeted-final-unit.log.
- All six existing native compiler-mocking integration checks pass across the
  initial five graph/mapping/isolation checks and the targeted public-CLI rerun:
  /private/tmp/next-testing-increment35-static-mocks.log and
  /private/tmp/next-testing-increment35-static-mocks-public-final.log.
- The compiler slice passes 25 standalone Rust parser/map checks and generated
  ESM ordering/TLA/identity proofs. Native compilation and all 18 bootstrap tasks
  pass; final root TypeScript, inventory, changed-file lint and Rust formatting
  pass. Logs use /private/tmp/next-testing-increment35- and
  /private/tmp/next-testing-mocks-next-slice/ prefixes.

The first focused CLI attempt caught a missing .js extension in the new recovery
import before feature execution. It is retained as prerequisite-failure evidence,
not counted as a feature regression. The corrected import passed a direct
lock/recovery smoke check, a core rebuild, the targeted public-CLI rerun and the
17 affected probes above. No complete compatibility suite was rerun for this
narrow repair.

Subsequent context/timeout and built-in-reporter work remains isolated in hashed
scratch patches until integration. All stable requirements remain in scope,
performance budgets remain deferred, no stable exception is approved, and
stableReady remains false.

## Increment 36: stable case context, cooperative timeout and built-in reporters

A case retains its public context, local expectation and signal across retries
and repeats while every internal attempt keeps a unique resource/ALS owner.
Fixture hooks, around hooks and finished/failed listeners receive that facade;
retained asynchronous work and assertion methods still reject closed owners.
Timeout supervision tracks the actual returned work. A cooperatively settled body
can release the following case only after assertions, fixtures and owned cleanup
close. Unbounded work and hook/around deadlines remain poisoned; any timeout
retains the snapshot-publication veto. Broader retry/hook/concurrency timeout
policies still require qualification.

The public CLI accumulates repeated reporter arguments and supports real TAP,
flat TAP, verbose, dot and GitHub Actions renderers alongside separate machine
output. Renderers use collected results, hierarchy, final attempts, failures and
annotations; GitHub commands escape protocol characters and append a summary.
Writer failure remains visible. This establishes the concrete built-in probes,
not complete terminal/UI/custom-reporter parity.

Compiler spread factories now classify all expanded keys as factory-result reads.
Copied scalars remain copied and original evaluation follows factory side effects,
without eager original reexports. Direct returned namespaces remain unsupported
and require a separate lazy/live graph design; this repair does not claim that
broader capability.

Verified:

- **16/16 selected public reference probes pass**:
  /private/tmp/next-testing-increment36-focused-results.json. The original
  context-retry-repeat-identity, timeout-next-case and five built-in reporter
  gates recover. Both original hoisted/actual controls, all four additional
  compiler controls, signal/local-expect identity and retry snapshot controls
  pass unchanged.
- All **317 checks in the four affected unit suites pass**:
  /private/tmp/next-testing-increment36-related-units.json. Independent scratch
  evidence also contains 64 lifecycle source checks and 40 real assertion
  integrations for the context/timeout slice.
- The focused normal-mode public-watch integration passes, including a new
  competing one-shot invocation that must fail while watch owns the public lock,
  followed by fresh configuration/setup generations and complete cleanup:
  /private/tmp/next-testing-increment36-public-watch-lock-final.log.
- That integration initially exposed an existing test observer limitation:
  Module.\_load did not observe native import of CommonJS. The fixture now applies
  one transparent observer at module compilation and load, without double
  wrapping. Require-first and native-import-first identity proofs pass. Mutation
  errors now retain their real cause. Product source was unchanged during this
  fixture repair, so only the affected integration scenario was rerun.
- Native compilation, all 18 bootstrap tasks, root TypeScript, inventory, changed
  file lint/format and Rust formatting pass. Evidence uses the
  /private/tmp/next-testing-increment36- prefix. A shared watch type error in the
  new GitHub summary append was corrected to writeFile with append mode and a
  supported abort signal before the build and acceptance checks.

No whole compatibility suite was rerun for this increment. The last full count
remains increment 34; 197 probes are currently defined. Concurrency, test-registry
addition selection and automatic module mocking continue in independently
verified scratch patches. All stable requirements remain in scope, performance
budgets remain deferred, no stable exception is approved, and stableReady remains
false.

## Increment 37: concurrent ownership, automatic mocks and new-test watch selection

Failure work is grouped by subsystem. Each slice runs its affected source tests
and unchanged public acceptance selectors; passing unrelated groups retain their
evidence. Shared native/core builds are batched. A broad checkpoint follows
several verified slices instead of every small change. Independently prepared
agent patches stay outside live source/dist until the checkpoint is sealed.

Concurrent siblings use separate assertion and asynchronous resource owners,
bounded group/case slots, and awaited teardown. AroundAll validates its actual
descendant scopes while allowing unrelated concurrent siblings. Context-local
assertions keep isolated counters; global expectation state follows the pinned
shared behavior. Boolean sequential boundaries recover both original concurrency
probes. The next independently verified ordering slice removes an extra
.sequential modifier that a pristine comparison proved absent in Vitest 5.0.4;
no API parity claim depends on that modifier. Wider concurrent timeout,
snapshot, cancellation and resource-mutation matrices remain open.

Literal automatic module mocks use the pinned standalone mockObject primitive
through the real Next compiler graph. Original and automatic-original source
identities remain distinct, preserving the reference's separate later actual
module evaluation. Four additional unchanged-body controls cover clone behavior,
import targets and default/false-spy options. Manual/spy/dynamic/external/profile
mocking remain separate work. Native compilation initially rejected deprecated
IndexMap::remove under warnings-as-errors; shift_remove fixes that diagnostic.

Watch distinguishes a matching test-registry addition from compiler dependency
evidence. Narrowing requires unchanged existing entry/config/setup/serializer
bytes and effective settings, exact new matching files, and no unknown, deleted,
mixed, symlink or racy inputs. Other changes widen. Compiler dependency evidence
remains incomplete and is never certified by this shortcut. The original new
file watch assertion now passes unchanged.

Verified:

- **15/15 selected public probes pass** in
  /private/tmp/next-testing-increment37-focused-results.json, including original
  concurrency, automatic mock and new-file watch gates plus around/context/
  timeout/fixture/actual-import regression controls.
- **256/256 checks across four affected unit suites pass** in
  /private/tmp/next-testing-increment37-related-units.json. Root TypeScript,
  inventory, changed-file lint/format, Rust formatting, native compilation and
  all 18 bootstrap tasks pass.
- The six existing normal-mode static mock integration scenarios pass across the
  initial five successes and one focused rerun. The old internal spread fixture
  expected a copied scalar to stay live; its exact original also fails pristine
  5.0.4. The corrected fixture passes pristine and Next while adding positive
  actual-state and namespace-identity checks. Public reference assertions are
  unchanged. Evidence: /private/tmp/next-testing-spread-reference-regression and
  /private/tmp/next-testing-increment37-static-mocks-focused-final.log.
- The one broad frozen checkpoint after increments 35-37 reaches **201 probes:
  149 pass, 52 fail, zero skipped**, with no invalid reference fixtures or
  regressions among the previous 116 passing probes:
  /private/tmp/next-testing-increment37-checkpoint-results.json. Twenty-five old
  failures are green and eight new controls pass. One green parallel-watch
  ordering comparison still has the previously proved nondeterministic reference
  array order; this result does not establish deterministic ordering parity.
- The existing broader unit corpus reaches **666 pass / one failed wrapper**
  across 27 suites. The wrapper contains two failing lifecycle checks: a stale
  returned-cleanup expectation after failed teardown (under independent reference
  review), and lost internal attempt identity in a stale-context diagnostic.
  Both remain explicit follow-up work; the other suites will not be rerun for
  those local repairs. Evidence:
  /private/tmp/next-testing-increment37-corpus-results.json.

A scratch-only raw-V8 and real-Next-artifact coverage proof preserves all existing
hash/range/map/source validation. Imported statement/branch maps and hit counts
match pristine, but function locations differ through actual SWC maps. There is
no coverage implementation/dependency change or parity claim from that proof.
Sharding, spy-mode mocks and seeded ordering remain separately verified scratch
patches. All stable requirements remain in scope, performance budgets remain
deferred, no stable exception is approved, and stableReady remains false.

## Increment 38: seeded ordering, exact sharding and spy/manual module mocks

Seeded ordering matches pristine bucket/group behavior, finite numeric seed
values, explicit suite shuffle, configured test defaults, and boolean concurrency
boundaries. File shuffle occurs once at the actual worker-lease boundary. The
extra .sequential modifier is removed: pinned 5.0.4 uses concurrent:false. The
original shuffled fixture gave only Vitest seed 8127; Next now receives that same
existing input. Canonical preservation checks prove all other original fields,
fixture bodies and assertions unchanged.

Sharding uses root-relative physical-path SHA-1 hashes, stable balanced contiguous
partitions, then the pinned fresh-run project/file-size execution order. Duplicate
physical paths in separate projects retain distinct identities. Allowed empty
assignments publish real zero-test reports; excessive shard counts otherwise
fail. Independent evidence contains 1,038 exact pinned comparisons.

Compiler-owned spy mocks preserve function/class/getter behavior and mock state.
Regular local **mocks** ESM files replace graph edges directly, preserving live
bindings, TLA and namespace identity with direct imports. Actual sources keep
separate identities. Last-declaration precedence is covered in both orders.
Dynamic/reset/setup/external/CJS/cyclic/other-profile graphs remain open; manual
files with helper calls and earlier hoisted dynamic imports are explicitly
unimplemented. Five spy and six manual public controls pass, including their
unchanged original gates; nine added contract bodies pass pristine unchanged.

The stale-context diagnostic now retains only its last unique attempt ID string;
public facade identity and ALS access checks remain intact. The original internal
stale-registration assertion is unchanged. A separate concurrent-owner control
rejects borrowing another active attempt. The older returned-cleanup expectation
was disproved against pristine: failed afterEach skips returned beforeEach
cleanup. The internal case now asserts both failed-teardown and successful-
teardown/failed-returned-cleanup variants, with complete error/listener ordering.
The stronger existing Next recursive-global-listener guard is preserved; its
pinned global/context API difference remains unqualified.

Verified:

- **22/24 relevant public probes pass**, with all compiler, mock,
  context/concurrency and second-shard controls green:
  /private/tmp/next-testing-increment38-focused-results.json. The two remaining
  failures are JSON order: shuffled cases execute correctly but serialize in
  execution order; the first shard executes c then b correctly but the reference
  JSON retains original specification order b,c. The original assertions remain
  unchanged. A separate reporter repair will rerun only these two gates.
- The compiled public shuffled execution trace matches exactly in both runners:
  [1,3,5,4,6,7,2,0], recorded in
  /private/tmp/next-testing-increment38-shuffle-execution-proof.json.
- **All six existing normal-mode compiler integration scenarios pass**:
  /private/tmp/next-testing-increment38-static-mocks.log.
- **72 lifecycle checks pass**, including 45 real assertion integrations. The
  previously failed stage-two wrapper now passes **all 19 child cases**. The
  focused CLI group passes 17 checks initially plus its one corrected public
  empty-shard control. Logs/results use the increment38 prefix.
- New manual mock fixtures initially collided in Jest's global mock registry.
  Only the target-runner fixture directory is excluded from that registry; the
  harness continues copying and executing every fixture. A new empty-shard test
  now uses the real CLI child because Jest's VM cannot execute its native import;
  all zero-result assertions remain and the fixture needs no application/compiler.
- Native compilation, all 18 bootstrap tasks, root TypeScript, inventory --check,
  Rust formatting and changed-file lint/format pass. Owned watch writers were
  stopped before native/bootstrap builds; the main checkout remains clean.

No broad suite was rerun after the two local ordering failures. The last full
checkpoint remains increment 37, and 210 probes are now defined. Custom completion
reporters continue as a separate, independently verified slice. Worker lifetime
reference/design evidence proves that file caches cannot substitute for shared
worker/compiler/module/collector ownership; those fixture/type gates remain open.
All stable requirements remain in scope, performance budgets remain deferred,
no stable exception is approved, and stableReady remains false.

## Increment 39: producer-backed report order and owned custom completion adapters

Standard JSON separates declaration/specification order from actual execution.
CLI discovery retains selected specification IDs before sharding/file sequencing,
and run-start events carry that evidence. JSON follows those IDs and numeric
hierarchical declaration paths (including indices 10/11 and nested suites).
Legacy/watch producers keep observed file order when no such evidence exists;
no global lexical watch order is fabricated. Next events retain actual execution
order. Next blob validation/merging preserves the new ordering evidence and
rejects malformed or incomplete identities before publication.

An independent same-body review found a real execution boundary beyond the older
shuffle controls: explicit concurrent:false suites must remain separate from
neighboring leaves whose public concurrent flag is undefined. The three-case
seed8127 trace was before,inside,after in pristine and after,before,inside in Next.
Task metadata and grouping now preserve the exact flags. Scope ownership,
concurrent limits and awaited siblings remain intact; the new control matches
both trace and suite/leaf metadata.

File-backed JavaScript custom reporters evaluate in a separately supervised
process. Initialization finishes before execution; final task trees derive from
retained facts and use the same specification/declaration ordering. Completion
callbacks and owned close callbacks are awaited. Errors in construction, init,
completion or cleanup remain visible; cancellation reclaims an uncooperative
process. A completion publication error preserves truthful passing JSON results
while failing the command, matching the original reference gate. Broader live/
watch/package/TypeScript/custom-context adapters remain release work and receive
explicit diagnostics rather than invented compiler/Vite objects or hook timing.
Capability metadata now reflects the bounded built-in/watch/mock/custom behavior
already verified instead of retaining stale unsupported descriptions.

Verified:

- **6/6 relevant public checks pass**:
  /private/tmp/next-testing-increment39-focused-results.json. Only the two previous
  failures, original custom-reporter/reporter-crash gates and nearby JSON/JUnit
  controls were selected. All original public assertions remain unchanged.
- **96/96 reporting checks**, **five focused lifecycle controls** and **eight
  affected CLI reporter/empty/watch checks pass**, recorded in the increment39
  reporting, lifecycle-focused and cli-reporting result files. Independent
  pristine proofs include nested numeric declarations, duplicate physical paths
  in two projects, original shard/stdout order and actual event replay.
- The package declaration watch and root compiler exposed two type-only issues:
  the IPC error callback needed Error|null, and a compound test filter needed an
  explicit ResultEvent predicate. Both were repaired; runtime checks were not
  rerun for those annotations. Root TypeScript, core build, inventory --check,
  changed-file lint/format and diff checks pass. The owned watch tree was stopped
  before the core build; no native rebuild was needed for this JS-only slice.

No whole compatibility or unit corpus rerun followed these local repairs. The
last full checkpoint remains increment37 (149/201 pass,52 fail,zero skipped),
with 210 probes currently defined; subsequent focused evidence is stored
separately and is not presented as a new full count. Foreign Vitest blob import,
worker/module lifetime and full coverage remain open. Scratch coverage evidence
also independently disproves the current key-only root normalization for nested
Istanbul data.path; its original assertions have not been weakened or modified.
All stable requirements remain in scope, performance budgets remain deferred,
no stable exception is approved, and stableReady remains false.

## Increment 40: fixture declarations, nested focus and foreign blob reports

Fixture declarations preserve replaced field types, previous values for an
extension's own dependency, replaced peer values and file-builder scope safety.
An independent review caught overly broad callable exclusions and missing
contextual inference. The follow-up restores constructor/branded declarations,
uses the pinned reverse callable relation for broad values and supplies the
pinned generic default. No API value is cast to any and no broad index signature
is added. A named AttemptUtilities interface also prevents declaration emission
from replacing recursive fluent returns with elided any; private disposal and
invalid chained calls remain rejected. These annotation changes leave runtime
statements unchanged. The original public consumer is an unchanged byte prefix
with additive controls. The complete original worker fixture type gate remains
unchanged/red; one-element scoped tuples also remain unqualified.

The non-mutating focus selector now lets nested focus narrow describe.only and
records focus beneath skipped/todo ancestors without reviving those cases.
Nineteen pristine comparisons match runnable membership, actual traces and
stable declaration paths. Raw mode/report projection, including the existing
nested allowOnly:false suite-result difference, remains separate release work.

A separate adapter decodes real published 5.0.4 flatted blobs directly, validates
ownership/paths/identities and projects final tasks to JSON. It preserves retry
errors and foreign provenance/raw evidence without inventing Next events,
attempts or compiler history, and never loads a Vitest/Vite controller. All four
captured raw blobs remain byte-identical. Duplicate/ambiguous/mixed/invalid inputs
reject before output replacement. Review also caught a FIFO open that could wait
forever before validation; nonblocking descriptor validation now rejects it, with
an isolated timed probe proving the old hang and owned-child reclamation.
Foreign coverage, pending tasks, other reporters and broader schema conformance
remain open. Two new expected-report JSON files were formatted with parsed-data
equality proved; raw blob bytes and original public assertions were untouched.

Verified with relevant selections only:

- **52 strict consumer checks pass** against normal built package declarations,
  including the entire public consumer, in
  /private/tmp/next-testing-increment40-public-types-results.json. Independent
  source evidence has 51/52 paired inputs matching pristine; the remaining tuple
  qualification and unchanged worker gate are explicitly retained.
- **16 fixture/focus checks** and **11 foreign/native blob checks pass** in the
  increment 40 lifecycle-final and reporting-focused result files.
- **2/2 selected original public checks pass**, including the actual Vitest blob
  merge gate and ordinary helper execution control:
  /private/tmp/next-testing-increment40-focused-results.json. No other public
  probes were rerun for these repairs.

## Increment 41: explicit runtime collection under authoritative cleanup

`--list --json --staticParse=false` opts into real compiled setup/spec collection.
It settles declarations, uses the same focus selector and emits name/file facts
without running hooks, fixture factories or test bodies. Name/file filters can
return an empty list without passWithNoTests. Plain file listing keeps its
existing rules. Collection assertions restore their owned resources while
skipping snapshot setup/finalization/summary/publication and recovery writes.

Versioned collection facts travel separately from execution events. Each worker
and isolated boundary validates entries, revisions and duplicates against real
file-start evidence; successful completion must include every selected file.
Unexpected execution events reject before reaching observers. Facts stay
provisional through worker/group/cache/compiler/configuration/lock cleanup;
nonzero exit, deadline, cancellation and cleanup failure veto publication.

Pinned listing defaults to static AST parsing. The effectful path cannot stand
in for that requirement: default/static JSON collection rejects before loading
application configuration, and the original default public gate stays unchanged
and open. Locations and full project/cross-file metadata remain unqualified.
Forbidden focus with allowOnly:false also rejects explicitly until the pinned
failed-task listing projection is modeled, including hidden focus. Same-body
counterexamples and a static-discovery design are retained in the collected-list
scratch evidence, without claiming those requirements are complete.

Verified:

- **33 collection/ownership checks pass** across four existing suites. The initial
  selected run had 22 passes and 11 coordinator test failures before transport
  startup. Diagnosis proved Jest's native dynamic-import boundary; a test-only
  native Node transport preserves every scenario/payload/assertion and exposes
  startup failure. Only those 11 were rerun, passing in 1.111s. Combined evidence:
  /private/tmp/next-testing-increment41-combined-focused-results.json; initial
  failures and final transport results remain separately recorded.
- Three real native/compiler-backed explicit-false collection comparisons match
  pristine for ordinary async collection, nested focus and an empty name filter.
  Spies restore and invalid existing snapshot bytes remain unchanged. An empty
  file filter avoids even a deliberately throwing compiler config; the default
  static unsupported control exits 1 as intended. Evidence:
  /private/tmp/next-testing-increment41-native-list-results.json. Initial smoke
  harness executable/root setup errors are preserved; correcting the harness did
  not change product code or assertions.
- Increments 40/41 shared **one core build (20.32s)** after stopping the owned
  watch tree. Root TypeScript, inventory --check, changed-file lint/format and
  diff checks pass. The final coordinator change is test-only and needed no
  rebuild. No native source changed, and no whole-suite rerun followed.

The last full checkpoint remains increment 37: 149/201 pass, 52 fail, zero skipped;
210 public probes are currently defined. Later focused evidence remains separate
in /private/tmp/next-testing-compatibility-failure-groups.json. Requirements stay
in scope, performance budgets stay deferred, no stable exception is approved,
and stableReady remains false. The main checkout and both requirements files
remain unchanged.

## Increment 42: worker fixtures, static listing, rejections and debugging

Five unchanged original public release gates now pass against normal built output:
worker-fixture, the complete fixture-overloads consumer, default collected-case
listing, late-unhandled-rejection and debug-individual-test. This is a selected
run, not a new full-suite count:
/private/tmp/next-testing-increment42-public-results.json (5 passed, 205 unselected).

Worker fixtures now have an explicit process owner, independent caches and an
asynchronous scope outside file/attempt lifetimes. File cleanup precedes worker
cleanup; worker teardown failure drains remaining callbacks and vetoes snapshots.
Actual fixture definition/registration identities distinguish derived owners and
preserve suite test-fixture overrides. Worker-to-file dependencies and $worker
public declarations pass unchanged reference consumers. The two-argument builder
form retains option-shaped plain values rather than inventing an empty fixture.
Cross-file isolate:false still needs a persistent worker/shared compiler graph
and cached declaration dispatch; it remains an unchanged failing requirement.

Default JSON listing uses the native SWC syntax parser without executing setup,
specification or global setup. It preserves syntax names, parameter placeholders,
project names, original UTF-16 coordinates and cross-file focus. Errors withhold
public JSON; internal collection facts remain available. Eight actual pristine
CLI comparisons pass. Three astral-character parameter-location counterexamples
remain preserved: the pinned source locator increments code points against AST
UTF-16 offsets. Custom transforms/re-exported declaration helpers and complete
metadata parity remain unqualified. The former unsupported-default unit assertion
was replaced by actual behavioral controls; the original public gate is unchanged.

Unhandled process rejections now reach the file failure sink through cleanup and
terminal IPC instead of exiting before completed case results arrive. Actual
rejections, including primitive reasons, retain their diagnostics while successor
cases finish. The command fails and staged snapshots cannot publish. The JSON task
projection follows the pinned result calculation for rejection-only failures;
case/suite/cleanup/global/cancellation errors still veto it. Explicit inspector
options target the actual serial file worker, with no compiler/coordinator
inspector inheritance; startup failure refuses to execute. Watch/coverage/debugger
break/editor control integration remains separate release work.

A validated JS standard coverage mapper foundation also lands. It validates the
existing complete artifact/capture first, rechecks retained hashes and preserves
actual V8 counts. One-to-one original JS function associations recover sparse SWC
anchors; ambiguous/transformed/TS/JSX inputs reject. Source-only uncovered metrics
never evaluate files. The pure mapper bundle is pinned and reproducible from a
PNPM-generated lockfile. Exact standard-subject/unimported data, a 20-function
corpus and twelve negative controls pass scratch comparisons. Standard public
options/reports/thresholds/profiles remain integration work; no public coverage
gate is claimed green. Existing key-only root normalization still has its proven
nested data.path portability defect; original assertions remain untouched.

Focused validation uses normal built output without source resolver overlays:

- 10 worker lifecycle checks and 2 host disposal/snapshot checks pass.
- 10 static listing checks pass (initial canonical temp-path expectation failures
  were repaired using realpath, with every field/assertion retained).
- 15 rejection/sink/report checks and 21 inspector checks pass.
- 2 standard mapper checks and 52 strict declaration consumers pass, including the
  entire public consumer and earlier positive/negative fixture signatures.
- One shared core build passes in about 22 seconds, including strict declaration
  emission. Changed-file lint/format, root TypeScript and inventory checks pass.

Evidence and source hashes: /private/tmp/next-testing-increment42-integration-evidence.json.
Detailed initial failures and focused reruns are retained. The last full count
remains increment 37 (149/201 passing, 52 failing); later focused fixes are separate
in the failure ledger. No full suite was rerun for these changes. The owned watch
was stopped before the build. Main checkout and both requirements documents stay
unchanged; stableReady remains false, no exception is approved and performance
budgets remain deferred.

## Increment 43: standard coverage, real type tests and terminal defaults

All twelve selected public checks pass against the normal built package and
pristine published Vitest 5.0.4: standard coverage, coverage threshold, recovered
retry coverage, failed-body coverage, compiler-backed typechecking, forbidden
focus under CI, the three original PTY interactions, and three additional
agent/CI/explicit-run terminal controls. Evidence:
/private/tmp/next-testing-increment43-public-results.json (12 passed, 201
unselected, 213 defined). This is not a new full-suite count.

Explicit standard coverage flags now publish JSON and LCOV from real retained V8
hits and original JavaScript statement/function/branch declarations. Source
include/exclude, unimported zero-hit files, global percentage thresholds and
reportOnFailure work through the public CLI. Entire captures validate before
filtering. Parent owners revalidate entry/revision/source facts after child/group
cleanup; publication follows reporter/config/run-lock cleanup and rechecks source
bytes. Cancellation, incomplete capture, changed sources, duplicate facts and
unrelated output directories preserve prior reports. Failed thresholds retain
truthful passing case results and fail the command. Two pristine reference roots
and actual native output match across every standard data field; LCOV bytes match.

The old coverage oracle normalized outer absolute keys while retaining the
runner-specific nested data.path. That cannot compare even two pristine roots.
The separate correction first checks canonical ownership, key/path equality and
unchanged fixture source hashes, then relocates both path representations. Entire
metric/map/count/meta objects and the original comparison remain required; no
field was removed. Raw defect, two-reference and native proofs remain retained.

Type-test discovery and CLI/config controls now invoke the consumer TypeScript
compiler in an owned process. Original AST spans attribute actual diagnostics;
callbacks never evaluate, while ordinary runtime controls still use the native
Next compiler. Outside-test/source diagnostics remain visible. Selected files
excluded from the real compiler Program fail explicitly rather than receiving an
unchecked pass. The parent validates raw selected-source revisions after actual
child/group exit, including a real source edit during delayed cleanup. Pinned
runtime-name-filter behavior is preserved. Focused type-task pending projection,
exact expect-type diagnostic wording, alternate checkers/build/watch/list/debug/
coverage combinations and complete type-tooling conformance remain release work.

Forbidden focus errors are seeded before hooks. Failed focused suites skip their
descendants without copying ancestor errors onto every task; independently
focused leaves retain their own failures. Actual task metadata and hook/body
traces match the pinned reference. Terminal defaults reuse the existing pinned
configuration default: interactive stdin watches outside CI/agent environments;
explicit run, CI and agents execute once. The ordinary-terminal PTY driver
clears inherited agent detection flags for both runners, with original
assertions intact; independent agent/CI/run controls assert real once-only body
execution through a marker file because the pristine agent reporter suppresses
console output.

A persistent worker lease foundation also passes 22 actual-process controls.
It queues requests on one real PID, retains caches and provisional facts through
final process/group/pipe cleanup, and rejects forged/late completions, compiler
root changes, crashes, cancellation and cleanup failures. Even refused requests
transfer and drain cache ownership. This does not enable public isolate:false;
one native module graph, cached declaration dispatch and the actual shared host
remain the next separate integration batch.

Focused validation:

- 12 forbidden-focus lifecycle controls, 22 lease controls, 10 standard coverage
  API controls and 11 typechecking controls pass. The latter includes the new
  source-edit veto; its original diagnostic positive was rerun with that change.
- One core build passes (about 24 seconds), including normal strict declaration
  emission. Normal root TypeScript passes after two test-only callback annotation
  repairs; runtime assertions were unchanged and no extra build was needed.
- All 25 affected formatted files and 24 lint targets pass, with the two repaired
  unit annotations checked separately. Inventory consistency and diff checks pass.

Source/evidence manifest: /private/tmp/next-testing-increment43-integration-evidence.json.
Initial setup/annotation/selector failures and narrowly selected repairs remain
retained. No full compatibility or unit corpus was rerun. The last full checkpoint
remains increment37; focused results are recorded separately. The owned watch
stopped before the build, the main checkout and both requirements documents are
unchanged, stableReady remains false, no stable exception is approved, and
performance budgets remain deferred.

## Increment 44: shared worker lifetime, real environments and in-source entries

All eight affected public gates now pass against the normal rebuilt package and
pristine Vitest 5.0.4: cross-file worker lifetime, jsdom/happy-dom options,
per-file/custom environments, animation-frame timers, React Testing Library, and
in-source tests. Three adjacent normal-mode import/global/helper controls also
pass. The initial eight-case run retained one missing-provider failure; the
corrected consumer setup reran all five affected DOM/ecosystem cases with exact
pinned provider/package identities for both runners. Original fixture bodies,
assertions and contract data are unchanged. Evidence:
/private/tmp/next-testing-increment44-public-results.json and
/private/tmp/next-testing-increment44-pinned-public-results.json.

Explicit isolate:false now uses one native immutable Node graph, one driver and
one actual worker process for serial development files. Cached declaration APIs
resolve the active collector while preserving worker-fixture definition identity;
the original two file bodies create their shared fixture exactly once. Per-file
async owners remain distinct. Earlier-file delayed Error and primitive rejections
retain their original owner and veto publication. Complete emitted-byte SHA256
maps, ordered native membership and source identities validate before execution
and after actual process exit. Shared fixtures, file caches and provisional
snapshots remain retained through final process/group/pipe cleanup.

The parent certifies resource closure from its actual worker lease and successful
cache release. Clean cancellation and source/output vetoes reclaim compiler
allocations without publishing facts or snapshots. Uncertain process/cache
cleanup retains immutable inputs and fails ownership. Child-supplied names or
flags cannot certify the parent resources. Four whole-supervisor controls use
real brokers, real workers and parent-owned allocations; 52 focused lease/host/
API/broker controls cover the adjacent protocol cases. Setup, serializers,
coverage, inspection, collection, realm metadata, in-source tests, module mocks
and broader shared profiles remain unqualified and fail closed; these are open
stable requirements, not approved exceptions.

Real consumer jsdom 30.1.2, happy-dom 21.0.1 and custom environment modules run
before setup/test evaluation and close after file/import/mock cleanup. Globals
and descriptors restore even when provider setup/teardown fails. File pragmas are
discovered without evaluation and bound to the source revision. The harness now
provides only the applicable DOM/ecosystem dependencies from the same pristine
install to the Next consumer, including React/ReactDOM 19.2.0, Testing Library
16.3.3 and jest-dom 7.0.1. Resolver identities, versions, real provider objects,
peer identity and unchanged workspace dependencies are recorded separately.
The passing RTL fixture does not qualify all client resolver conditions, Browser
Mode, browser watch or production mounting.

In-source discovery preserves pinned literal includeSource selection. Ordinary
included current-file marker users also require structural detection, independent
native capability negotiation and a native FileSource SHA256 sidecar. Native AST
substitution affects only the explicit selected Node entry, retaining original
exports, callbacks, spans and a hygienic active facade. Missing/old bindings,
changed source identity and unsupported wrapped/optional syntax fail explicitly;
cohorts reject marker users before native evaluation. Four pristine/native
scenarios plus comment/spaced ordinary forms pass. A normal native production
build imports the unchanged original source: page and API return 42, while 38
runnable JS files and four real nft traces contain neither test callback nor
facade. Ordinary production defines the marker false before tracing. Helper raw
marker-value equality, wrapper forms and other profiles remain open compatibility
work; no reference value was normalized away.

Focused validation and retained failures:

- 130 distinct focused checks in the five changed unit suites pass across the
  initial built run and selected repairs. The lifecycle wrapper includes all 51
  real facade integration cases. Two existing diagnostic checks exposed a
  pre-existing foreign-attempt wording branch; its one-hunk correction preserves
  all assertions and original owner IDs.
- The native binding build, three Rust AST tests, 18-task bootstrap build and
  focused core repair build pass. Normal declaration emission and the repository
  root TypeScript check pass. Two new config-test type errors were repaired by
  loading a genuine finalized config, with no casts or invented required fields.
- Formatting, lint, inventory and diff checks pass. Scratch-loader/setup failures
  remain retained alongside the qualified normal built-package results.

Source/evidence manifest:
/private/tmp/next-testing-increment44-integration-evidence.json.

The first full checkpoint since increment37 records **187/213 passing and 26
failing**, with no probes skipped. It recovers 27 previously failing probes and
adds twelve probes. The pinned Chromium prerequisite was then restored and
only seven browser-related probes were rerun. All seven pristine references are
now valid; all seven Next paths still fail on actual execution, profile, provider
or mounting gaps. The raw checkpoint retains its original prerequisite errors,
and `/private/tmp/next-testing-increment44-browser-results.json` records the
qualified follow-up. The parallel watch comparison also exposed different file
order between two saved pristine runs. Its harness correction orders only file
rows after validating canonical ownership, exact membership and source hashes;
case order and all assertions remain unchanged. Ten real-filesystem/replay
controls and the original focused parallel-watch gate pass. That leaves 25 known
failures after the checkpoint; no new full-suite result is claimed.
No full suite was repeated for the small repairs. Rust formatting-only changes
after this checkpoint are identified separately in the manifest.

The owned watch processes were stopped before each coordinated build. The main
checkout and both requirements documents remain unchanged; stableReady remains
false, no stable exception is approved and performance budgets remain deferred.

## Increment 45: actual module resets, mutable env reads and real RSC routes

Three original failing gates now pass through the built public CLI/native compiler:
`module-reset`, `inlined-env-stub-boundary`, and the real dynamic-route RSC fidelity
test. The four adjacent import/hoist/in-source/shared-worker gates also pass.
Combined with the separate parallel-watch oracle correction, that clears four
failures from the saved increment44 checkpoint and leaves **22 known failures**.
No full corpus was rerun; the raw checkpoint remains 187/213.

- Module reset uses compiler-issued actual factory IDs from the processed graph,
  including split locals/evaluation parts. It evicts authorized evaluated records,
  retains factories and protected framework records, preserves held namespaces,
  and keeps evicted pending evaluations with their real import owner. The original
  gate, three native graph cases, ten rejection controls, and the real metadata /
  25-output-byte closure proof pass. Only direct reset-only isolated development
  Node graphs are qualified; dynamic registration, bare builtins, packages/CJS,
  setup/serializer/coverage, shared cohorts and broader profiles remain open.
- Development Node compilation releases user public/config env keys from both
  actual compiler substitution maps. Exact initial strings seed real process.env
  before setup. The original helper/body, quoted config-only values, unset/typeof,
  internal constants, and shared-worker restoration pass; all recorded workers
  and CLI groups close and their retained artifacts/locks are removed. A native
  unit caught incompatible RcStr lookup hashing; FxHashSet fixes the implementation
  while preserving the original assertions.
- Route-aware development RSC resolves a genuine AppProject page/loader tree and
  compiler-issued route/source sidecar. The real WorkStore uses the selected page,
  decoded URL/root params and inherited config. The synthetic output identity stays
  separate; its verified manifest registers under the actual request route. That
  registration repair follows a retained actual native InvariantError. The original
  normal-app comparison, five positive/request-mismatch cases, three native invalid
  route controls and two real source-revision emissions pass with all groups closed.
  Full HTML/layout execution, production/watch/PPR/Cache Components/export,
  parallel/interception and static-path enforcement remain unqualified.
- Verification: 41 unique native controls, 165 focused built-package unit controls
  (including the existing 51-case fresh-process facade wrapper), normal repository
  types, native build and final 18-task bootstrap pass. No test is rewritten to
  accept a missing feature. Focused harness mistakes and the initial native/type
  failures remain beside the final evidence. Owned watch processes are stopped.

Source/evidence manifest:
/private/tmp/next-testing-increment45-integration-evidence.json.

The main checkout and both requirements documents remain unchanged. StableReady
and the broad route capability remain false; no stable exception is approved and
performance budgets remain deferred. The next active slices are sound changed /
related selection, real custom coverage providers and production client mounting.

## Increment 46: precise selection, real providers and production mounting

Five original failing public gates now pass: changed/related selection, custom
coverage providers, development RSC module mocks and registered production client
mounting. This leaves **17 known failures** in the original corpus. The saved full
checkpoint remains 187/213; no full corpus was rerun. Only affected gates were
repeated after their relevant repairs.

- Selection plans compile actual module graphs in a supervised child without
  evaluating test bodies. Actual module owners, pre-DCE literal requests, final
  resolver options and affecting sources establish source hashes. Real transitive,
  dynamic, alias and dead-import consumers are selected; unrelated bodies do not
  evaluate. The native resolver retains lexical symlink evidence, and a saved plan
  keeps its consumer after real retargeting. Unknown origins, loaders, external
  packages, CommonJS, executable configs and symlinks remain conservative. Actual
  config helpers, opaque loaders, Git unions and empty-selection defaults pass.
- Custom providers use a real parent-owned provider host and fresh file workers.
  Their original opaque payloads reach genuine hooks without metric conversion.
  Exact original bytes/report, storage removal, failed-body report policy, two
  payloads with reportOnFailure, cancellation exit130 and real afterEach cleanup
  failure all pass. Cancellation discards partial payloads only after certified
  closure; forced uncertain cleanup remains an error and retains storage. Initial
  provider imports are bounded to one JavaScript module and Node builtins using
  real synchronous loader hooks; helper services/transforms and broader profiles
  remain unqualified.
- Production mounting uses genuine virtual App Pages through the ordinary native
  production build, static analysis, manifests and traces. The locked built pages
  run in a fresh ordinary production server. The original normal-app comparison,
  SSR, hydration and real button click pass. This is a Node browser driver with
  one-shot Turbopack production fixtures; Browser Mode, Cache Components/PPR,
  export and broader production matrices remain open.
- RSC mocks retain the genuine AppProject context, React server conditions,
  NextServerComponentTransition and immutable compiler-issued mock metadata.
  Actual conditional-package, async JSX render/spy and protected-framework
  rejection controls pass. The sole RSC mock fixture missing a real app now has
  the same minimal layout/page scaffold as neighboring RSC fixtures. The nested
  Git fixture explicitly names the workspace containing its shared Next install.
  Original test bodies, subjects and assertions are unchanged. Route-aware,
  setup/reset/coverage, browser and production mock combinations remain open.
- Verification includes 55 unique focused built-package unit cases, three native
  parser controls, original public gates and separate actual CLI/native ownership
  proofs. Strict source/root types, native build, final18-task bootstrap, lint,
  formatting, inventory and diff checks pass. Failed build/proof outputs are kept
  beside the final evidence; actual proofs exposed and repaired missing admission,
  cancellation and resolver-provenance paths. All owned watches are stopped.

Source/evidence manifest:
/private/tmp/next-testing-increment46-integration-evidence.json.

The main checkout and both requirements documents remain unchanged. StableReady
remains false, no exception is approved and performance budgets remain deferred.
The next active slices are actual browser client execution and snapshot primitives,
dynamic module registration and coverage with module mocks.

## Increment 47: client execution, runtime mocks and static mock coverage

Six original failing public gates now pass: browser execution, browser snapshots,
runtime doMock/doUnmock, Edge runtime, read-only editor discovery and coverage with
static module mocks. This leaves **11 known failures** in the original corpus.
The saved full checkpoint remains 187/213; no full corpus was rerun. Twelve
distinct original gates passed across focused runs, including six existing
regression controls. The browser request adapter now maps the same explicit
Browser Mode flag as the pristine reference; original bodies and assertions remain
unchanged.

- Explicit Browser Mode uses the native Next client resolver and chunker, the
  same pinned assertion primitives, and a real Chromium page. Seven additional
  native/browser controls verify actual global bindings, rejection of Node
  imports, late assertions, source edits during browser closure, unsupported
  declarations and SIGINT cancellation. Six actual browser processes close and
  disappear. This first slice admits one synchronous case without setup, hooks,
  retries, concurrency or asynchronous bodies. React rendering, browser mocks,
  browser coverage and watch remain open.
- Browser snapshots stage parent-owned changes and verify original source,
  emitted output and path ownership again after browser/server closure. The
  original inline/external round trip passes. Actual CLI execution exposed two
  native ESM import suffix errors; both are repaired. Failed/cancelled/source-edit
  controls retain the original snapshots and user edits.
- Runtime mocks retain lazy factory closures, real native module identities,
  original loader calls, held namespaces and reset behavior. Actual native
  positive and negative controls cover factory rejection, pending imports,
  closed origins, aliases, unsupported profiles and graph boundaries. The
  unchanged six-case reference body passes; no source rewrite supplies behavior.
- Static mock coverage certifies generated proxy source identities through the
  same native source-map pipeline as actual emission. Real Inspector ranges,
  immutable metadata and decoded source content establish what can be excluded.
  The original mocked and unimported subjects match all six pristine Istanbul
  fields exactly, including zero original execution counts. Production/browser
  coverage remain separate work. A narrow Git ignore exception exposes the
  product source coverage directory so build inputs can include it.
- Edge execution uses the actual bundled Edge runtime and its globals. Discovery
  uses a parent-owned loopback HTTP server with bounded read-only routes and real
  run observations. Completion and SIGINT proofs close the server, sockets and
  child processes. Full editor controls and additional Edge profiles remain open.
- Verification includes 62 existing focused built-package cases, 11 native URI
  controls and 52 native testing-module checks. Native build, bootstrap, direct
  core build, normal root types, source lint, JavaScript formatting, inventory and
  whitespace checks pass. The final Rust formatting check initially found
  formatting-only drift in four files; it was repaired before publication.
  Failed builds and probes are retained. All owned increment47 watches are
  stopped; no source or native binary changed during the qualified proofs.

Source/evidence manifest:
/private/tmp/next-testing-increment47-integration-evidence.json.

The main checkout and both requirements documents remain unchanged. StableReady
remains false, no exception is approved and performance budgets remain deferred.
The next active slices are compiler-certified CJS named spies and genuine browser
and production coverage.

## Increment 48: native mock identities, browser resources and source coverage

Static direct named imports of CommonJS implementations now use a native export
certificate. Production factory mocks retain immutable source/output evidence;
the compiler no longer recursively asks its production graph for the root while
constructing that same graph. Imported utility aliases and compiled package ESM
targets use actual resolution rather than a node_modules path exclusion.

Ordered setup mocks use separate native input contexts, exact emitted module-ID
aliases and per-input registration ownership. Authored sources and unchanged
compiler-issued mock generations preserve their namespaces; later declarations
retain separate generations. Resolver metadata without a runtime factory cannot
enter the manifest. Only the resolved Next testing runtime transitions to the
shared native context, preserving one registry and assertion owner across inputs.
The original setup-order probe and three new pristine-reference controls pass,
including live cached imports, nested importer resolution and a parallel barrier.

Browser primitives now build for the web, and actual Playwright commands execute
in the parent-owned browser. The parent watch broker validates the discovered
profile and application metadata, retains leases through worker cleanup and
defers snapshot publication. The original browser source-edit watch probe passes.
Browser and production standard coverage retain native source provenance. Exact
concrete bookkeeping types certify mapless generated scripts, including chunks
containing only generated async loaders; real or mixed source chunks cannot
qualify through their path or absence of a map. The original browser/production
coverage probes match the pristine reference. Cancellation during the final
coverage directory rename restores the previous report.

Focused evidence across the coordinated batches, without a new full-corpus claim:

- Batch50 compiler/CLI/coverage/mock component suites: **479/479 pass**.
- Batch51 execution/broker suites: **207/207 pass**; original browser watch passes.
- Batch52 mock/coverage suites: **128/128 pass**, including cancellation rollback.
- Batch53 original setup-order plus all three additional setup controls: **4/4
  pass**. Native build, full bootstrap and normal root TypeScript pass.
- Original CommonJS named-spy, external ESM mock, production mock, browser mock,
  browser React helper, browser snapshot and browser/production coverage probes
  have focused green evidence in batches48–53. Dependency adapters now give both
  consumers the identical pinned Playwright/helper/package artifacts and verify
  actual resolved entries and manifests; original bodies/assertions are intact.

Raw results use `/private/tmp/next-testing-batch{48..53}-*`; the final setup proof
is `/private/tmp/next-testing-batch53-setup-results.json`. The last full checkpoint
remains **187/213** from increment44. Six new reference-qualified setup/browser
controls bring the defined corpus to **219**, without changing an original gate.

Browser continuation work was subsequently integrated and verified in increment49
below. Complete native Promise/thenable fidelity remains unqualified: final
callable-thenable jobs still lose their originating API owner. The complete release
matrix remains work. Both requirements documents and the main checkout remain
unchanged. No exception is approved; performance budgets remain deferred and
stableReady remains false.

## Increment 49: emitted continuations, lazy ESM originals and watch coverage

Browser compilation lowers authored async functions and module awaits while one
exact owned continuation source retains native await. The exact source transition
replaces an ineffective directory condition. Native graph validation checks actual
module options and transformed syntax before certifying the graph. Independent
inspection of actual emitted chunks finds exactly one native async function and
await mapped to that bridge, authored generator continuations, and one shared
owned SWC overload-yield constructor used by both ESM and CommonJS consumers.
The real async-generator adoption, final object getter/identity, Promise ordering
and mapped failure controls now pass. Browser event wrappers preserve Chromium's
null/undefined Window receiver behavior. Parent-mapped failure frames retain their
verified original-source flag and method metadata.

One development Node static mock target can lazily load its compiler-certified
original ESM cycle. ID-only edges retain factory identity without eager evaluation;
a private deferred-require alias maps to the same native original source. Only
that exact certified edge gains CommonJS admission. The native runtime snapshots
already pending ancestors before instantiation and restores the frame
synchronously; newly instantiated members and unrelated dependencies retain their
own awaits. The original partial-factory-cycle probe and three additional pristine
controls pass, covering live bindings, namespace identity, actual completion and
full-mock laziness. Independent review first caught the broader candidate skipping
a fresh member's await; its failing VM proof and corrected boundary checks remain
saved.

Explicit standard coverage flags support development Node and real Chromium
client watch. Parent-owned per-entry facts replace rerun facts, bind current source
and artifact revisions, and broaden selection when retention is unavailable.
The first completed publication and explicit keyboard run-all intent retain
untouched-source expansion; automatic reruns follow the pinned reference's
separate policy. Explicit cleanOnRerun:false retains valid untouched entry facts.
Coverage publication and thresholds precede the single terminal event, machine
report, human watch status and normal quit status. Failed native compilation
preserves the prior complete report. Authored statement spans are recovered only
after complete unique associations with actual mapped V8 statements; counters
remain the actual captured values.

Verification after the relevant repairs:

- Batch55: **636/636** affected component tests, root TypeScript and the native
  module-await span control pass. The emitted-code check caught the original
  bridge recursion before browser acceptance.
- Batch57: native build, 18-task bootstrap, **58/58** native testing controls and
  **141/141** lifecycle/mock component tests pass. Actual emission proves shared
  marker identity; the browser async-generator adoption gate passes.
- Batch58: native build and 18-task bootstrap pass. **416/416** CLI, coverage and
  browser-resource component tests and normal root TypeScript pass. The repaired
  public cycle/mapping/coverage subset is **8/8** green.
- Actual browser watch controls are **4/4** green with complete pristine-reference
  JSON maps and exact source hashes for initial, addition, keyboard rerun and
  retained generations. Initial and rerun threshold failures agree across JSON,
  the single terminal, diagnostic, human status and normal quit exit1. All owned
  PTYs/browser processes close. Evidence is under
  `/private/tmp/next-testing-browser-watch-coverage58/` with source qualification.

The defined suite is now **226** cases (three new cycle and four new browser watch
controls). The last unfiltered checkpoint remains **187/213**; focused green
results do not establish a new full-corpus result. Batch evidence uses
`/private/tmp/next-testing-batch{55..58}-*`; exact actual emission is saved under
`/private/tmp/next-testing-browser-emission57/`.

Three actual Chromium final-return ownership controls remain red for callable
thenables, callable accessors and own Promise.then returns. Getter counts,
identity and native microtask ordering match, but those native resolving jobs
execute outside their originating owner. No descriptor/prototype heuristic was
shipped; the proof and design constraint are saved under
`/private/tmp/next-testing-browser-final-return58/`. Promise subclass/exotic
observability, top-level for-await and broader Browser Mode lifecycle remain
release work. The compiler transform bridge is still in scratch review at this
checkpoint. Neither requirements document changed, no exception is approved,
performance budgets remain deferred, and stableReady remains false.

## Increment 50: retained compiler hooks, imported TypeScript and native maps

Transform-only compiler plugins run in their retained configuration realm. A
parent-owned broker sends exact source/revision requests to that realm; a real
Turbopack loader returns the resulting code and composed maps to normal Next
parsing, resolution, chunking and execution. Configuration helper closures retain
identity. Actual chained MagicString transforms and an exact original-line failure
control pass against the same pristine Vitest configuration. This bridge does not
load the Vite graph or controller. Other plugin hooks and unqualified combinations
retain explicit diagnostics. A helper-only watch edit exposes a separate reference
behavior: pinned Vitest reruns with its old transform closure, while the current
Next session reloads it. That paired behavior remains unqualified; the recorded
reference observation was not rewritten into an expected failure.

The worker's early compiler-option validation initially rejected valid external
project roots before the parent's canonical shared-application-root check. The
repair admits a string root only for parent-owned project configuration realms;
the existing canonical ownership check still rejects independent compiler roots.
Ordinary root compiler overrides retain their migration diagnostic.

Imported type-erasure TypeScript coverage now uses authored ESTree descriptors to
associate actual native declaration, statement and branch maps uniquely. Function
body starts come from authored syntax; all runtime counts remain actual V8 facts.
Missing/ambiguous functions or branches and runtime-generating TypeScript forms
fail explicitly. Development and production public CLI controls produce complete
maps, metadata and counters equal to pristine Vitest after root normalization.
Unimported typed sources and JSX still require compiler-profile-bound analysis;
an independent transpiler cannot substitute for that provenance.

A genuine native source-map defect in ordinary React compilation was traced to
an unreachable hoisted-var block's reserved synthetic span. SWC emits its closing
brace at hi minus one, which previously fell below the reserved range and became
an impossible original coordinate. The producer keeps that position reserved.
The regression parses real source, runs the actual removal modifier and SWC
emitter, checks hoisting/comments and validates raw coordinates and map tokens.
The extracted baseline proof fails on the precise leaked BytePos; the corrected
actual crate test passes. A separate JSX synthetic export-registration/comment
boundary defect remains under producer investigation; coverage validators stay
strict.

Verification and current checkpoint:

- Batch59 unfiltered corpus: **224/227**. Two failures were the project-root
  regression above. Production hydration lacked its required Chromium revision
  in the forced cache; the qualified follow-up passes with the real multi-version
  browser cache. Neither a replacement browser binary nor a revision alias was
  used. The compiler-alias case still tests its migration diagnostic, not full
  alias compatibility.
- The two actual compiler-hook positive controls and the new mapped failure
  control pass. The latter asserts the transformed value before throwing at the
  verified original source line.
- Batch60 native build, all **18** bootstrap tasks, root TypeScript and
  **543/543** affected CLI/coverage/lifecycle/browser resource tests pass. The
  native synthetic-span regression is **1/1** green. ESLint passes across **110**
  retained authored JavaScript/TypeScript files after narrow cleanup.
- Batch60 focused public checks: **6/7**. Both original external/glob project
  cases, the transform mapping control, both TypeScript profiles and an actual
  Chromium async suite/around hook ordering control pass. The new failed-suite
  control exposes a transport bug that discarded a blocked test because its body
  never started, then a shared lifecycle gap that attributed suite setup failures
  to unexecuted tests. Batch62 repairs both: Node and actual Chromium report
  skipped descendants while retaining the failed suite and command. The same
  unchanged failure body gates both profiles. **3/3** public hook controls,
  **107/107** lifecycle and **50/50** browser protocol/resource tests pass. The
  protocol refuses a passing completion for an unstarted case. Internal tests
  now assert the retained suite error and skipped task, matching the pinned
  runner's actual markTasksAsSkipped behavior.

There are **233** defined cases after the transform, typed coverage and browser
hook controls. No new full-corpus green result is claimed by the focused checks.
Evidence is saved under `/private/tmp/next-testing-batch{59..61}-*`,
`/private/tmp/next-testing-coverage-syntax59/` and
`/private/tmp/next-testing-reserved-span59/`. The final-callable-thenable ownership
controls from increment49 remain red. Other lifecycle, compiler mapping, typed/JSX
coverage and clean downstream/platform release gates remain open. Neither
requirements document changed, no stable exception is approved, performance
budgets remain deferred and stableReady remains false.

## Increment 51: native aliases, compiler analysis and serial browser files

String aliases now enter the actual test-owned Next resolver. Plain object and
ordered string mappings preserve exact/slash boundaries and first-match ordering;
protected framework names, overlapping application aliases and unqualified forms
retain explicit diagnostics. The original alias acceptance no longer returns
early on a migration error: its unchanged body executes and passes alongside two
new direct/dynamic/subpath/ordering controls. Native testing checks pass **60/60**
after grouping the internal compiler flags within turbo_tasks' argument bound.
Separate static query/fragment/helper refusal and ordinary-application controls
qualify eight boundaries; three computed-import forms remain unqualified, with
their reached evaluation markers retained rather than described as pre-evaluation
refusals.

Native export registration now contributes explicit source-less source-map
boundaries after upstream composition. Actual core/emitter regressions cover
comment adjacency, normal/minified output, composition and later minification.
They pass without relaxing coordinate validators. Together with increment50's
reserved-span fix, this removes both established malformed-coordinate producers.
Remaining JSX import-helper attribution and TSX branch endpoint differences are
still under investigation; neither receives guessed coordinates.

A separate compile-only source-analysis primitive uses the actual Next compiler
profile, retained generated bytes/maps and exact source hashes. Its artifacts
have a nonexecution role rejected by runtime collectors and executors. The parent
independently authorizes source/project/profile/revision and validates declaration
maps, including complete unique associations and zero-only analysis descriptors.
Actual development/production proofs match pristine full maps without executing
a source containing a deliberate throw. This does not yet enable public
unimported TypeScript: parent broker/coordinator/publication integration remains
in progress. Runtime-generating TypeScript and JSX remain explicit boundaries.

Browser suite setup failures now retain failed suite/file facts while their
unexecuted descendants are skipped, matching pinned Vitest. Async suite declaration
storage follows explicit compiler continuation scopes, including overlapping
collections and closed original tokens. Serial Chromium files send a closed
manifest before execution; the parent recomputes selection and checks immutable
identities, one active attempt, descendant completeness and actual setup-blocking
facts. The two unchanged pristine-qualified browser controls match **4 passed /
3 skipped / 1 todo** and **1 passed / 2 setup-blocked skipped** respectively.
Independent review tightened sticky-RegExp admission, cancellation proof and
contradictory blocked-descendant facts before the next corpus freeze; all
corrected transport and downstream execution checks pass.

The root transform configuration realm now follows the watch service across
ordinary generations when it owns neither global setup nor external project
realms. Helper edits rerun Next with the retained captured closure; direct config
selection/byte changes create a fresh owner. Two actual public PTY controls match
pristine Vitest, including fresh reports/source hashes and normal q exit codes.
A separate mixed failure-then-recovery history exits pristine q with code1 and
remains unqualified; it was not rewritten into a final-green q0 assertion.

Verification since increment50:

- Batch63 native build, all **18** bootstrap tasks, root TypeScript and **703/703**
  affected component tests pass. Focused public checks reach **12/13**; the
  remaining async collection guard is repaired and qualifies in actual Chromium
  in batch64.
- Batch65 browser checks reach **17/18**. The remaining default browser coverage
  watch control times out while exiting. The PTY driver is repaired to retain
  raw bytes and partial facts on that failure, preserving all existing deadlines
  and assertions. Its focused follow-up passes all three publication stages and
  normal exit. The original cleanup cause remains unresolved reliability work.
- Batch66 core build, root TypeScript and **767/767** affected compiler, CLI,
  coverage, lifecycle, browser-resource and watch tests pass. Both newly integrated
  transform watch controls pass through the actual public CLI. ESLint and
  Prettier pass across **124** retained authored paths after a local binding rename.
- A real Chromium149 engine experiment disproves console.createTask/CDP as a
  final-thenable ownership bridge. Ordinary Promise/await/timer continuations
  retain opaque task labels, but shared thenables returned under two different
  owners and an unowned call have indistinguishable parentless native jobs;
  recursive adoption loses the parent from its first job. Values, identities,
  getter counts and ordered traces remain identical with/without task labels.
  No inferred owner is introduced; final-callable-thenable controls remain red.

Batch67 completes the unfiltered corpus at **242/242**, zero skipped, in
543.943 seconds. All **189** authored source hashes and **542** build-output
hashes, including the native binary, are unchanged across that run. The separate
manifest verification is retained. Your main checkout remains clean. The final
corrected browser/lifecycle/execution/broker/mocking checks pass **425/425**, and
root TypeScript, authored lint and formatting pass. This finite green checkpoint
does not close the remaining release requirements. Evidence is retained under
`/private/tmp/next-testing-batch{63..67}-*`,
`/private/tmp/next-testing-coverage-source-shared63/`,
`/private/tmp/next-testing-transform-realm-watch-next-slice/` and
`/private/tmp/next-testing-engine-task64/`. Both requirements documents remain
unchanged, no exception is approved, performance budgets remain deferred and
stableReady remains false.

## Increment 52: new await/coverage audit controls and native JSX endpoints

Three additional controls bring the defined corpus to **245** after the frozen
242-case checkpoint. An actual Chromium RegExp source/flags control passes with
mixed-case nested case names, excluded throwing bodies, explicit skip and todo.
A watch failure-history control keeps the exact task identity while repairing an
assertion: the failed completed generation emits no coverage, the repaired run
passes and publishes only the imported file, and q retains exit code1. Full maps
and counters equal pristine Vitest. The candidate fixes Next's prior q0 while
retaining the latest PASS report; the existing keyboard unit now asserts both
facts rather than forgetting the earlier failed generation.

The proposed unpublished-coverage cache guard is **withdrawn**. Reference evidence
first removed a failed task and observed retained failure metadata, then repaired
the same task to distinguish that effect. The completed failed generation already
consumes initial source expansion even without a published report. A guard that
restores a full untouched-source denominator on repair would change the pinned
reference contract. Parent source-analysis integration preserves the existing
completed-generation/full-rerun intent instead of introducing that guard.

The new await control has four unchanged pristine-qualified browser cases.
Actual Next passes both genuine-Promise own-then/constructor controls and fails
both Proxy cases: an extra prototype operation is observable, and a throwing
prototype trap fails an await that succeeds natively. The acceptance control is
retained red. No expected assertion, skip or exception is substituted. The
separate final-callable-thenable ownership gap remains open. Read-only engine/CDP
experiments have not changed browser launch policy or runtime behavior.

The missing JSX branch endpoint is repaired at its native producer. Before SWC
React lowering, the compiler retains unique original JSX container spans; after
lowering, it restores the span only on a uniquely matched generated props object
with a genuinely dummy span. The original closing JSX token supplies the endpoint.
No authored span, JavaScript byte, counter or consumer coordinate validator is
changed. Four actual crate tests pass, including subsequent minification and
ambiguous/authored-span refusals. The native build and all **18** bootstrap tasks
pass. A fresh actual bundled TSX proof now matches complete pristine maps,
metadata and counters. Ordinary JSX still has the separate import-helper role
problem; import error mappings stay intact and JSX admission remains guarded.

The parent source-analysis chain now has an actual development/production named
generic-function proof: the untouched typed source deliberately throws if
executed, yet both complete coverage outputs match pristine maps and real runtime
counters without evaluating it. The integration patch remains under independent
mutation/publication/cleanup verification. That audit also finds a distinct
TypeScript arrow binding-map defect: counts match, but native declaration starts
refer to arrow parameters while pristine refers to the binding identifier. A
precise authored-location diagnostic prevents those incorrect reports while a
separate generated-AST/provenance association repair is developed. This is an
open requirement, not an approved exclusion.

Batch68's three new public gates reach **2/3**, with only the recorded Proxy gap
red. Root TypeScript, Python syntax, Rust formatting and authored lint/formatting
pass. The component run reaches **772/773**; its sole stale expectation assumes q
forgets earlier failure history. The reference-backed corrected CLI suite passes **271/271**. Batch69 rebuilds
the arrow diagnostic, passes **131/131** coverage controls, root TypeScript and
all **124** authored lint/format checks. The latest full-corpus result remains the immutable
**242/242** checkpoint before these new gates and producer changes; no newer full
green result is claimed. Evidence is retained under
`/private/tmp/next-testing-batch68-*`,
`/private/tmp/next-testing-watch-sticky-exit67/`,
`/private/tmp/next-testing-browser-proxy-await68/`,
`/private/tmp/next-testing-jsx-map64/` and
`/private/tmp/next-testing-coverage-react68/`. Both requirement documents remain
unchanged, performance budgets remain deferred, no stable exception is approved
and stableReady remains false.

## Increment 53: parent-owned typed source analysis and arrow binding provenance

The parent now selects untouched typed coverage sources, assigns each selected
source/profile/revision before compilation, and validates actual retained native
artifacts through a separate broker action. These compile-only artifacts never
enter runtime execution, V8 captures, runtime coverage caches or test counts.
The parent derives zero-only declaration facts from the actual emitted bytes and
maps before their output lease is disposed. Publication requires complete parent
authorization, exact source/profile identities, exact runtime descriptor and
metadata agreement, and unchanged selected source/config bytes. Metadata Maps
remain Maps across IPC and comparison. Existing completed-generation coverage
expansion and failure-history semantics remain unchanged.

Supported config filename inventories include presence and absence, not just
existing hashes. A newly added higher-precedence test/Next config file, a removed
candidate or a changed supported dotenv/default TypeScript/package input vetoes
publication. Native Next config ancestor lookup is included. Arbitrary imported
Next config dependencies and custom TypeScript config paths remain unqualified;
this finite inventory is not a complete effective-config dependency graph.

The TypeScript arrow repair replaces the broad diagnostic only when exact
compiler provenance links a direct variable binding, arrow initializer, every
parameter and its body. A converter-local role map supplies the uniquely authored
binding start and retains actual emitted endpoints. Original compiler stack/error
map bytes are unchanged. Conversion uses the same native code, AST and V8 ranges,
requires identical counter identities, and still rejects absent, foreign or
ambiguous associations. Other arrow forms remain guarded. The deliberately
unqualified original negative control is unchanged.

Batch70 passes **533/533** combined coverage/CLI/broker/watch controls, root
TypeScript and lint/formatting across **126** retained authored JS/TS paths.
The separate arrow suite passes **146/146**. Actual retained native development
and production comparisons cover ten arrow forms with complete pristine
maps/metadata/counters; untouched throwing sources are never evaluated. The seven
new public CLI controls pass **7/7**: named/arrow declarations in both Node modes
match complete pristine coverage, and post-execution source/config-byte/config
addition mutations all refuse JSON/LCOV publication. This brings the defined
corpus to **252**. The unfiltered batch70 run reaches **251/252**, zero skipped,
in 595.088 seconds. Its sole failure is the retained Proxy-await gate: both
genuine-Promise cases pass and both Proxy cases fail. All **678** authored source
hashes and **550** build-output hashes stay unchanged across the complete run;
the separate manifest verification passes and the main checkout remains clean.
The latest entirely green corpus remains the historical frozen **242/242**;
the larger current corpus stays red until the browser repair is qualified.

Two additional public named-TypeScript watch controls pass **2/2**, bringing the
defined corpus to **254** after that frozen run. Both default and retained
coverage match complete pristine maps/metadata/counters across initial execution,
added-file selection and explicit full rerun. Every retained source hash and
absolute canonical path is checked, and each Next generation has one successful
terminal event. All four underlying pristine/Next PTY sessions exit q0 and their
owned transient roots are removed. The driver accepts only the original known
MJS source pair or the explicit known TypeScript pair. No full 254-case run is
claimed yet.

Three actual config-input probes demonstrate the documented remaining fence gap:
an imported Next config helper, a custom TypeScript config and its extended base
can change after analysis while both test assertions pass and coverage still
publishes. An imported Next env define is asserted in actual compiled code, so
these are effective compiler inputs. The repair must observe the existing Next
config load and actual native TypeScript resolver graph, including resolution
absence/package inputs; independently executing a config or using a different
TypeScript resolver would not establish provenance. Those probes remain open;
no complete effective-config dependency fence is claimed. Evidence is retained
in `/private/tmp/next-testing-coverage-config-inputs70/`.

Browser research has a trap-free engine brand predicate at an authenticated
debugger location, and an explicit `current_microtask` heap root distinguishes
the current thenable job from queued jobs. A private lookup recovers exact
closed/unowned/live scopes for known target Promises. These are isolated engine
proofs, not a shipped ownership bridge: hidden Promise field layout, unknown
Promise creation, debugger lifecycle/observability and performance remain open.
The separate JSX import-role investigation preserves all import error mappings.

Evidence is retained under `/private/tmp/next-testing-batch70-*`,
`/private/tmp/next-testing-parent-public70-*`,
`/private/tmp/next-testing-coverage-source-parent64/`,
`/private/tmp/next-testing-arrow-association68/`,
`/private/tmp/next-testing-typed-coverage-watch70/`,
`/private/tmp/next-testing-browser-debugger-brand71/` and
`/private/tmp/next-testing-browser-heap-origin72/`. Both requirement documents
remain unchanged, no stable exception is approved, performance budgets remain
deferred and stableReady remains false.

## Increment 54: engine Promise classification without Proxy observations

Browser await classification now uses a parent-issued startup capability. The
parent authenticates the exact engine function location, source bytes, main-frame
execution context and frame before authored document code runs. An engine remote
object subtype supplies only a primitive Promise-brand decision at the owned
paused frame. Unknown values are never inspected through JavaScript prototype or
instance checks. The captured native prototype intrinsic is consulted only after
the engine certifies a genuine Promise; the existing native bridge and explicit
scope adoption routes remain intact. The runtime captures the capability once,
so authored replacement of Symbol or prototype builtins cannot redirect it.

A persistent breakpoint at the existing private debugger statement is required:
earlier local-variable write variants stopped working around 411 calls. The
retained candidate passes 1,500 genuine-Promise classifications on each of actual
Chromium 149 and 156, plus fourteen zero-trap/accessor shapes and ten startup,
abort, close, realm and disconnection controls. This is bounded qualification;
no engine-wide reliability or performance guarantee is inferred. The capability
carries no test owner and does not solve native final-thenable job ownership.

The coverage collector authenticates this initializer through the actual live
parent-issued script/source/realm/frame fact and exact root execution range. It
checks the issuer before capture and after awaited profiler shutdown. Missing,
duplicate, stale, late or unissued facts refuse publication; there is no generic
URL or matching-source exemption for unknown scripts. Cleanup releases paused
execution, removes debugger ownership, awaits late acquisition and invalidates
closed facts. The Node lifecycle harness has an explicit test-only adapter using
real util.types.isPromise; no shipping Node fallback is added.

The four original Proxy assertion bodies remain unchanged and pass through the
actual native Next browser graph, including real V8 coverage publication. A new
unchanged paired fixture checks captured startup capability after authored builtin
replacement and subclass then ownership against pristine Vitest 5.0.4. It brings
the defined corpus to **255**. The root coverage/lifecycle/browser-resource suites
pass **394/394**; root TypeScript, ESLint and formatting across **129** authored
JS/TS files pass after the paired core rebuild.

The unfiltered frozen batch71 corpus passes **255/255**, zero skipped, in
**647.372 seconds**. Independent manifest verification confirms all **681**
source hashes and **556** build-output hashes stayed unchanged across the run.
The main checkout is clean and both protected requirement hashes are unchanged.
This replaces the historical 242-case green checkpoint as the current complete
corpus checkpoint; it does not close the broader release-work rows below.

Evidence is retained under `/private/tmp/next-testing-batch71-*`,
`/private/tmp/next-testing-browser-engine-brand73/` and
`/private/tmp/next-testing-browser-engine-coverage73/`. Other genuine Promise
constructor/prototype combinations, native final callable-thenable ownership,
other engine/platform behavior and debugger interaction remain unqualified.
Heap-origin research is not part of the implementation. Config imported-module
and native TypeScript input provenance work is still separate and pending;
existing config-input gap probes remain open. No stable exception is approved,
performance budgets remain deferred and stableReady remains false.

## Increment 55: native import coverage roles and broader Promise controls

An explicit default-off compiler option now asks isolated Node endpoints for
native ESM import-initializer coverage roles. The actual native generated
statement carries its role through hoist deduplication; final AST and emitted-byte
checks must uniquely identify the same operation. A private StructuredSourceMap
field transports it after composition, with native codec and cache-hash support.
External JSON and raw or nested vendor map fields cannot recreate this authority.
A separate native sidecar binds exact script and map hashes. The parent checks
real factory/context/target bindings and uniquely authored import locations, then
excludes only that generated descriptor from a cloned converter AST. Actual
JavaScript, maps and V8 ranges remain unchanged; remaining descriptors and counts
must agree. Public JSX admission is still guarded.

The actual crate run caught an incorrect assumption in the initial transport:
existing SourcePos counts a non-BMP character as one column. The private sidecar
now tracks true UTF16 coordinates and CRLF state across section boundaries,
without changing ordinary map serialization. Actual verification passes **12/12**
structured-map tests, **3/3** CodeBuilder transport/authority tests and **4/4**
native producer tests. Native72 builds in 54.46 seconds and bootstrap passes
**18/18** tasks. Root coverage/compiler/broker/CLI/lifecycle/browser-resource
suites pass **864/864**; root TypeScript and lint/format across **130** authored
JS/TS files pass.

Actual JSX and TSX imports in development and production pass **4/4** endpoint
qualifications. For each unchanged fixture, all emitted JS/map hashes are exactly
identical with the private option false and true; only the opted-in native
sidecar grants roles. Real assertions and strict raw-map checks pass, and complete
pristine coverage descriptors/counters agree. An independent fresh unpatched
Vitest 5.0.4 onCoverage reporter retains raw metadata through v8.serialize.
Read-only replay of the exact retained native bytes/captures matches those raw
pristine objects **4/4**, including fnNames Map entries and Infinity endpoints.
This metadata evidence does not rely on JSON erasing either value. Every actual
compiler session is disposed and the temporary app root is removed. Untouched
JSX/TSX compile-only analysis and public admission remain separate pending gates.

A new unchanged thirteen-case Promise fixture passes **13/13** on pristine
Vitest 5.0.4 and **5/13** on actual Next on both Chromium 149 and 156. Eight
failures expose constructor-read order/count, own-then bypass, altered/null/Proxy
prototype results and an unowned then-body API refusal. The original Proxy and
subclass positives remain mandatory. A scratch candidate sending all genuine
Promises to native await fixes the ordinary observations but regresses subclass
ownership; it is rejected and is not integrated. No inferred owner, heap-origin
bridge or ambient fallback is added.

The formatted paired fixture has identical assertions and authored AST to the
sealed initial probe and is registered as the **256th** public acceptance gate.
The normal focused public run reproduces **5 passed + 8 failed** body cases,
zero body skips/todo; its one gate fails with 255 gates filtered. No complete
256-case run is claimed. The historical frozen **255/255** checkpoint in
increment54 remains valid for its exact earlier corpus; the expanded corpus is
known red and stableReady remains false.

Evidence is retained under `/private/tmp/next-testing-batch72-*`,
`/private/tmp/next-testing-import-role70/implementation/native-proof-evidence-QY35Rg/`,
`/private/tmp/next-testing-coverage-metadata72/`,
`/private/tmp/next-testing-browser-promise-conformance77/` and
`/private/tmp/next-testing-browser-promise-repair76/`. Imported Next config helper
and actual native TypeScript config input provenance are still being qualified.
Native resolution research confirms that existing affecting-source lists omit
some attempted absences, including extended JSON candidates; they cannot stand
in for the actual ordered probe graph. Both requirements documents remain
unchanged. No stable exception is approved and performance budgets remain deferred.

## Increment 56: observed Next config imports and parent publication fencing

The existing ordinary Next config load now retains its actual CommonJS/ESM module
bytes and explicit file-import edges. Resolver/load/compile/JSON operations delegate
once; config evaluation is not repeated. The actual config object's cache identity
retains the original graph. Uncaptured cache entries, noncanonical or unsupported
requests, changed hooks, transformed bytes and detected later loader registrations
refuse certification while ordinary config loading preserves its result.

Each source-analysis request independently authorizes the selected config file and
per-profile request ID. A separate artifact sidecar binds the observed module graph
to that request, source, profile, entry, revision and allocated root. The parent
validates it before and after conversion, then rechecks every original profile
receipt before and after report rename. Identical source descriptors cannot erase
a different profile's inputs. A stale graph vetoes publication with rollback.
Config facts remain separate from runtime captures and native import-role metadata.

Actual ordinary-load controls pass **22/22** on Node 20 and **22/22** on Node 26,
including delegated call counts, cached config/module evaluations, cycles and
unsupported loader/cache edges. The actual unchanged built72 baseline publishes
after a helper mutation; the staged and then integrated development/production
repairs execute both assertions successfully, then refuse JSON and LCOV. Those
assertions verify the real imported Next env define in compiled code. Positive
coverage matches complete pristine maps/metadata/counters including untouched
TypeScript sources. The four new normal public gates pass **4/4** after core73
builds in 29.86 seconds. This brings the defined corpus to **260**, with the
Promise gate in increment55 still known red; no full 260-case result is claimed
at this point.

Combined component verification exposed a Node-host isolation leak: the lifecycle
suite runs saved browser code in Node and left EventTarget/MessagePort prototypes
patched across Jest realms, interfering with the new loader's real worker thread.
The test harness now restores its captured host API descriptors in teardown;
shipping browser code and assertions are unchanged. The same combined six suites
then pass **885/885**. Root TypeScript, lint and formatting across **136** authored
JS/TS paths pass, including the cleanup repair. Both requirements hashes remain
unchanged and the main checkout remains clean.

The subsequent unfiltered run passes **259/260** with **zero skipped** in
827.156 seconds. The only failing gate is the genuine Promise matrix from
increment55: **5/13** unchanged bodies pass and **8/13** fail. The frozen manifest
verifies all **696** authored source files and **571** build outputs unchanged
throughout the run, with the same HEAD. The result and verification are retained
in `next-testing-batch73-full-results.json` and
`next-testing-batch73-manifest-verification.json`. The main checkout stays clean
and both protected requirements hashes remain unchanged. This result does not
close the broader remaining requirements or change stableReady.

An additional actual endpoint control uses an emoji-containing project path in
all four development/production JSX/TSX combinations. Each keeps authored
assertions unchanged, emitted JS/map bytes identical and strict native sidecar
validation intact. A read-only replay of its retained real execution bytes and
captures independently matches complete pristine raw coverage metadata **4/4**,
including `fnNames` Maps, `Infinity` coordinates, all maps and counters. The
original sessions are closed; replay is evidence access rather than a new native
artifact or lease. Evidence is retained in `next-testing-batch73-import-role-unicode-root.log`,
`next-testing-import-role70/implementation/native-proof-evidence-KpwJFc/` and
`next-testing-coverage-metadata72/unicode-replay-results.json` under
`/private/tmp/`. Public JSX admission remains guarded.

Evidence is retained under `/private/tmp/next-testing-batch73-*` and
`/private/tmp/next-testing-config-imports71/`. These are loaded-module receipts,
not a complete effective configuration dependency graph. Arbitrary IO, external
preload loader aliases, native custom/extended TypeScript config resolution and
partial watch generations with empty source-analysis plans remain separate work.
The runtime receipt lane and actual native probe/consumer lane are being staged;
neither is claimed complete here. No stable exception is approved, performance
budgets remain deferred and stableReady remains false.

## Increment 57: private leased JSX declarations and genuine Map validation

Private compile-only source analysis now accepts `.jsx` and `.tsx` only when the
session requested native import roles and negotiated both native version1
contracts. The session captures that option once before startup. The parent must
separately authorize an exact lease capability whose check returns synchronously
with `undefined`. Its authority stays outside compiler artifacts and IPC. The
parent validates actual native import inventory before excluding that proof field
from rebuilt metadata comparison, and rechecks the lease after conversion and
before sealing. Existing config-import authorization is preserved. Public source
selection, ordinary runtime standard remapping and default typed admission retain
their existing guards.

The exact core74/native72 proof passes **4/4** development/production JSX/TSX zero
analyses with **72** refusal controls. Unchanged immediate-throw source files are
never executed; complete pristine raw maps, metadata, genuine `fnNames` Maps,
`Infinity` coordinates and all zero counters match Vitest5.0.4. Ordinary/private
JavaScript and source-map bytes stay identical. A delegated genuine conversion
read triggers parent capability revocation and the later lease check refuses it;
the compiler files remain leased until that analysis settles. This is distinct
from the earlier scratch actual-disposal control. All eight native sessions close.

A separate actual runtime proof passes **4/4** unchanged imported cases with real
V8 capture. Complete captures and remap facts, source bytes and artifact bytes stay
exact. Ordinary JSX standard remapping and using a runtime artifact as declaration
authority both refuse. All four sessions and four file workers close, with each
worker exiting0. Exact evidence is independently sealed in
`/private/tmp/next-testing-private-jsx80/` (**386** files); the earlier
`next-testing-private-jsx78/` **513**-file seal remains unchanged. The corrected
snapshot proof preserves null prototypes, Maps and `Infinity`, independently of
wire encoding. Earlier read-only-export and snapshot-host failures remain retained
and are not counted as successful controls.

Standard report validation now checks real `fnNames` Map entries with the
intrinsic Map iterator, including cross-realm Maps, while preserving legacy record
support. Previously `Object.values(Map)` admitted all seven malformed key/count
controls. Those now refuse; valid converter metadata and custom-iterator Maps
remain unchanged. The internal type explicitly includes Map metadata. The core74
build passes in22.06 seconds; the same six component suites pass **913/913** in
50.749 seconds. Root TypeScript and lint/formatting across **137** authored paths
pass. The four relevant existing normal public source/config gates pass **4/4**
(256 filtered,260 defined) in20.749 seconds. The latest unfiltered result remains
the **259/260** frozen run in increment56; no newer full-run result is claimed.

An additional direct engine Promise observer was tested on Chromium149 and156:
five constructor/then/prototype/species controls per engine observe no authored
getter/trap calls. Its remote callback still resumes after a timer that native
`await` runs before, so it is rejected as a runtime repair. No shipping origin
inference, source change or heap query was added. Evidence and closed browser
ownership records remain in `/private/tmp/next-testing-promise-native-observer74/`.
The genuine Promise gate remains open. Further metadata shape checks, runtime
config receipts/watch reload and actual native tsconfig provenance are being
staged separately and are not closed by this increment. No stable exception is
approved, performance budgets remain deferred and stableReady remains false.

## Increment 58: runtime configuration receipts and actual native tsconfig inputs

Runtime configuration receipts now cover actual selected runtime entries even when
compile-only source expansion has no requests. Parent-issued revisions precede
endpoint creation; source and runtime config-module proofs have distinct fields,
request identities and validators. The parent reads the actual loaded graph before
execution, seals only after worker cleanup under its artifact lease, and rechecks
current and retained per-profile receipts at cache and report publication fences.
Retained facts keep their original request IDs/revisions. Stale facts broaden real
execution rather than borrowing a fresh receipt. List/collect/empty selections gain
no compilation. Failed-body generation and sticky quit behavior stay intact.

Actual active config filename reloads start complete source expansion and full
invalidation. Helper-only edits do not receive automatic reload authority; the
pristine helper-only control did not rerun. Both retention modes match complete
pristine public coverage maps/metadata/counters through initial execution, partial
addition, actual config/helper reload and manual full rerun. Empty source-plan
helper mutation executes both unchanged real assertions, then vetoes JSON/LCOV in
both development and production. The eight relevant normal public controls pass
**8/8**, with **264** total gates defined. Earlier helper-watch and host failures
remain retained; none is recast as a parity pass.

The private native tsconfig producer now records actual existing parser, finder,
resolver and option-consumer operations for TypeScript, decorators, JSX and aliases.
Typed collectibles preserve selected config bytes, inherited reads, ordered extends
results, finite candidate alternatives and actual absence/type/realpath probes.
Unsupported or incomplete shapes refuse a complete certificate. The opt-in native
revision is separate from execution role; `sourceCoverage` names only the actual
source-preservation option. The real receipt asset and content hash are returned
in native endpoint inventory. Ordinary unrequested calls preserve their old ABI
and lazy native path.

Whole-crate checking caught private-import/TurboTasks type errors and a test-only
unused import; those were repaired before building. The full Next core/API/NAPI
check passes, genuine Turbopack observation and resolver tests pass, and all four
Next API ordering/deduplication/conflict controls pass. Rust formatting is clean.
Native build passes in54.37 seconds; bootstrap passes **18/18** in36.883 seconds.
The six affected component suites pass **971/971** with no skips; root repository
TypeScript and lint/formatting over **140** authored JS/TS paths pass.

The actual producer proof uses the retained old native72 binary and new native75
binary against identical sealed current dist inputs and one unchanged fixture.
All four development/production and source-preservation false/true profiles keep
**every JavaScript/map byte exact** for old-native versus new-unrequested and
new-unrequested versus requested output. All four genuine returned receipts have
`complete:true`, empty reasons,137 observations, all four consumer roles, exact
script/map hashes and actual custom/base config bytes. All12 compiler owners
close. The281-file evidence seal is independently verified. Native and Session
artifact revisions intentionally differ in this low-level adapter proof, so it
confers **no parent publication authority**. Retained copies are historical bytes,
not new native issuers or live leases.

Those unchanged assertions also expose an existing inherited `jsxImportSource`
limitation: two bodies pass and the inherited JSX body fails in every profile.
The producer truthfully records the compiler's actual behavior; that red body is
not counted as semantic parity. A separate semantic repair and the private parent
native reader/lease integration remain work. Public JSX runtime coverage remains
guarded. Complete import-exclusion metadata preservation and malformed present
metadata rejection are included without changing genuine Maps, coordinates or
counters.

The subsequent full unfiltered run passes **258/264**, with **zero skipped**,
in690.290 seconds. All **713** source files and **9,255** build outputs plus HEAD
verify unchanged. Five new failures are browser-coverage early aborts: the runtime
parent sidecar was appended after native client output inventory was finalized.
The strict native browser closure check correctly refuses this mismatch. A separate
parent-metadata reference correction is being prepared; no repaired full result is
claimed. The sixth failure is the unchanged genuine Promise matrix (**5/13** bodies
pass,**8/13** fail). Full results and verification are retained in
`next-testing-batch75-full-results.json` and
`next-testing-batch75-manifest-verification.json`.

The browser correction keeps parent-authored proof metadata outside native
client files/outputs and pins it by its separate exact reference/hash under the
parent lease. Native browser asset validation stays unchanged. All **326/326**
coverage controls pass, including real HTTP **200** for a native asset and **404**
for the private proof. The rebuilt core76 passes all **13/13** relevant public
config/import/browser gates and **982/982** tests in the same six component suites.
Build completes in21.78 seconds; repository types, lint and formatting pass. The
original full failure and freeze remain intact; no repaired unfiltered result is
claimed here. Correction evidence is in `next-testing-browser-closure76-*` and
`next-testing-runtime-config-browser-closure82/` under `/private/tmp/`.

Evidence is retained under `/private/tmp/next-testing-batch75-*`,
`next-testing-runtime-config-receipts73/` and
`next-testing-native-config-provenance72/`. Both protected requirements remain
unchanged. No stable exception is approved, performance budgets remain deferred
and stableReady remains false.

## Increment 59: inherited JSX semantics and private native parent validation

The native JSX option accessor now follows the actual inherited config chain when
the leaf has no string jsxImportSource. It merges that one override into the
original automatic-runtime, development, refresh, Emotion and RSC defaults.
Explicit child values, including the empty string, retain precedence. Six genuine
Rust tests cover 38 scenarios. Two test-only fixes use the public NextConfig
constructor and a strongly consistent TurboTasks operation; production code and
all scenario assertions remain unchanged.

The rebuilt native77 executes all three original authored assertions in each of
four development/production and coverage-off/on profiles, for both ordinary and
receipt-requested compilation. Every repaired None/Some JavaScript and map byte
matches (18 files in development,12 in production). Four actual listed receipts
remain complete with 137 records and all four consumer roles; all eight compiler
owners dispose. The 199-file evidence seal is independently verified. Native and
runtime Session revisions still differ in this low-level adapter proof, so it
supplies no parent publication authority. Earlier native75 red/no-op evidence is
preserved.

Normal Next Turbopack theme-ui, Emotion SWC and app-dir Emotion development cases
pass 3/3; production app-dir Emotion passes 1/1. The temporary inherited theme-ui
fixture also exposes an existing webpack leaf-only jsconfig loader gap. Its
unchanged passing Turbopack and failing webpack assertions and exact fixture bytes
are retained separately. The shared repository fixture is restored byte-for-byte
to its original direct config, with its test body unchanged; both bundlers pass
that original case. No webpack inheritance repair is claimed.

Private runtime JSX remapping is a separate explicit parent API. It snapshots the
original authority and descriptors before awaiting, pins exact source/profile,
entry/run/revision/artifact identity, validates actual native import metadata and
production source preservation independently, and checks the live lease around
conversion. It retains genuine closed-worker capture and full standard metadata,
Maps, raw maps and counters. The sealed actual JSX/TSX development/production
proof passes 4/4 with 38 real refusal cases and all owners closed; its 238 regular
files and 152 symlink targets were independently verified. This remains private;
ordinary runtime JSX admission stays guarded.

The separate native config reader validates exact native schema and observation
relations, actual script/map inventory and bytes, physical/native path mappings,
source/profile/revision identity, current filesystem facts and synchronous leases.
It stages and seals under the original live authorization, and only its original
frozen locally issued facts can pass later publication-input rechecks. The lease
callback must return synchronous undefined and retains its original receiver.
Historical native fixtures prove schema only; their closed owners and different
revisions cannot grant current origin or publication authority. No Session, IPC,
planner, public coverage or cache wiring is added by this reader slice.

Fresh native build passes in 21.58 seconds and bootstrap passes 18/18 in 38.697
seconds. The six affected component suites pass **1,109/1,109** with zero skipped.
Root repository TypeScript, lint over 142 authored JS/TS paths and formatting over
145 paths pass. The complete unfiltered public corpus passes **263/264**, with **zero skipped**,
in 705.842 seconds. HEAD plus all **720** source files and **9,261** build outputs
verify unchanged. All five browser coverage regressions are repaired. The sole
remaining failure is the unchanged genuine Promise gate (**5/13** bodies pass,
**8/13** fail); it has not been rewritten, filtered or granted an exception.

Stock browser Promise ownership remains open. Primary Chromium/V8 source review
finds no qualifying stock CDP/Playwright owner binding. A conditional custom-engine
capability design records exact native Await/job requirements and unresolved
bootstrap, adoption, cleanup, broader async-flow and distribution obligations. It
is architecture only: no custom browser requirement, implementation or stable
exception is approved. The 62-file research and 5-file design seals are independently
verified. An independent subsequent issuer review found that the existing opaque native
content hash does not itself bind the first on-disk sidecar SHA-256 read. A
receipt-only raw-byte SHA-256 binding is being staged before any genuine Session
issuer qualification. No corrected native binding or actual Session publication
qualification is claimed here.

Evidence is retained in `/private/tmp/next-testing-batch77-*`,
`next-testing-jsx-import-source76/proof-source/repaired-native-evidence-DH0qpr/`,
`next-testing-runtime-jsx81/`, and `next-testing-native-config-reader85/`. Both
protected requirements remain unchanged. All requirements remain open, performance
budgets remain deferred and stableReady remains false.

## Increment 60: genuine native config receipt origin and Session ownership

Native receipt-requested output inventories now carry canonical standard Base64
SHA-256 of the actual raw asset bytes. Ordinary None emission retains its existing
hash behavior and byte output. The receipt JSON schema and v1 capability stay
unchanged; the parent rejects old XXH inventories before issuing any trusted
wrapper. Five genuine Rust tests, Cargo formatting and the core/API/NAPI check
pass.

Private Session runtime and compiler-source operations capture the independent
parent selection and revision before creating the native endpoint, retain actual
factory filesystem/project roots, and bind the original unique native sidecar row
to its first stable canonical file read. Original frozen wrapper identity, exact
role/profile/source/inventory and detached original cancellation/disposal state
control preparation and one-shot sealing. Retained original facts hold bounded
immutable data and grant no current live conversion authority. Legacy standard
and private JSX entries, plus the source-analysis wrapper, refuse own native marker
presence before reading authority or capture fields, including undefined,
non-enumerable and accessor markers. Subsequent review found that the lower
zero-descriptor helper and the separate line-metric entry need their own native
marker guards; those repairs are staged for the next increment.

The direct genuine Session proof passes runtime/compiler-source across development
and production. All four receipts are complete with 137 records, all four native
consumers and exact parent/native/artifact/request revisions. Every ordinary/private
JavaScript and map byte matches (18/20/12/12 files). Four real runtime workers pass
12 original inherited TypeScript/decorator/JSX case bodies with complete original
V8 captures. Compile-only artifacts are never executed. All 37 actual refusal
controls pass, including old native77 before wrapper issuance, original-operation
abort followed by a fresh signal, changed sidecar/map/config bytes, cloned
identities and synchronous disposal. All seven Sessions dispose; all tracked
allocations and actual development/production allocation parents are clean. The
339 regular files and four symlink targets are independently verified, including
original native Base64/raw SHA binding, all paired bytes and unchanged shared
source/dist/native manifests. No adapter, receipt restamp or synthetic origin is
used. This qualifies the bounded original issuer/input slice; runtime JSX
composition, public/planner/watch/IPC admission and report publication remain open.

The native build passes in 15.82 seconds and full bootstrap passes 18/18 in 35.601
seconds. Six compiled component suites pass **1,173/1,173**, zero skipped, in
57.895 seconds. Repository types, lint and formatting of 143 authored JS/TS paths
and diff checks pass. The appended writable Jest facades preserve the real reader
WeakMaps and all original 196 compiler test assertions while allowing controlled
spies on immutable compiled SWC export getters. No production export is changed.

The complete unfiltered public corpus passes **263/264**, with **zero skipped**,
in 709.343 seconds. The actual process is CLOSED; HEAD plus all **721** authored
source files and **9,261** build outputs verify unchanged. The only failing gate
remains the original genuine Promise matrix: **5/13** bodies pass and **8/13** fail.
No case body or assertion was rewritten, filtered or granted an exception.

The reviewed next private composition design requires an original wrapper/fact
link and an independent live, one-shot allocation grant. A cached original input
fact cannot be promoted to runtime authority by equal IDs, paths, revisions or
bytes from a later Session. This is staged work, not current JSX/public coverage
qualification. Static Chromium scheduler.asyncData research also establishes no
qualifying Promise repair: full native attribution restoration and private owner
authority are unresolved. No browser flag, custom engine or exception is approved.
The original Promise failure remains open.

Evidence is retained in `/private/tmp/next-testing-batch78-*`,
`next-testing-native-config-session-proof93/actual-session-evidence-VDvTRJ/`,
`next-testing-native-session-test-facades94/`,
`next-testing-runtime-native-live-grant92/` and
`next-testing-scheduler-async-data91/`. Both protected requirements remain
unchanged. All requirements remain open, performance budgets remain deferred and
stableReady remains false.

## Increment 61: private runtime coverage with original native config authority

The private runtime coverage path can now compose the original Session-issued native TypeScript configuration fact with the independent parent runtime JSX lease. This path requires the original wrapper, artifact and sealed fact from the same live emission. An empty per-emission identity separates otherwise identical allocations; it does not provide a reverse lookup from cached facts to a live Session. A short-lived conversion grant revalidates current inputs, original-operation cancellation and allocation ownership, compares a fresh reader observation to the original fact, then retires in `finally`.

The runtime retainer captures own data descriptors, original pointers, the original signal and the independent runtime JSX capability before its deferred compiler lookup. It binds exact retained artifact/completion/expected copies to the real compiler grant. The existing raw line validator and Standard conversion algorithm remain private and unchanged behind their gates. Standard runtime, private JSX runtime, lower source analysis, source wrapper and bare line entry points all continue to refuse an own native-config marker. Source roles and JavaScript module-configuration authority do not acquire runtime permission through this composition.

The compiled-host check caught seven failures hidden by the source overlay: native `import()` required a Jest VM callback unavailable in the actual built host. A genuine deferred CommonJS lookup fixes that host boundary while preserving pre-await snapshots and all post-await fences. The final lint-required direct `typeof import(...)` cast is erased: all 3,699 emitted runtime JS files were byte-identical before and after that type-only change. Both failed checks and their narrow repairs remain in the evidence.

Verification for the combined core79 build:

- The six original component suites passed 1,228/1,228 with zero pending tests. Repo TypeScript, authored-file lint and formatting passed. The native binary stayed at SHA256 `d0f888de5ddfa7aa60aa379e7d78e03c6b13d8ca38f9ac295662d34024d0d940`.
- The unchanged direct Session origin runner passed all four role/profile cases and all 37 rejection controls. Seven Sessions were disposed; four runtime workers retained 12 original passing bodies; source artifacts were never executed. All 12 tracked allocations were removed, both mode parents were clean, and final source/build/native inputs matched the fresh READY snapshot.
- The separate actual composition run passed development/production JSX and TSX with their original authored fixtures. Nine complete outputs matched pristine Vitest 5.0.4 Standard data, including every location, statement/function/branch map, counter, metadata field, genuine `fnNames` Map and `Infinity` coordinate. Ordinary None and private Some used independent closed-worker captures and had 18/12/18/10 byte-identical JS/map files for the four cases.
- The actual run retained 59 composed operations, 406 original raw-map observations, 148 genuine converter invocations and 54 late actions completed after genuine conversion. All 148 labelled rejection receipts were independently checked: 89 boundary/late refusals and 59 exact retained-copy revocations. Ten genuine native receipts retained 1,370 complete records. The dedicated genuine compiler-source case refused runtime authority and launched zero workers.
- A live old grant was separately minted and checked before disposal. Replacement Session B reused A's full request, source/profile/revision/IDs/root and all 22 artifact files byte for byte. B rejected A's fact with the original-emission diagnostic, the old grant rejected the closed original allocation, and valid B converted successfully without restamping.
- All 14 Sessions and 13 runtime workers closed; worker exits were zero with no signal. All owned allocation roots and both mode parents were clean, original fixture/capture/input bytes were unchanged, and the copied package and its owned resolution alias were removed. A first runner attempt failed before any Session or worker because the isolated copy lacked its `next` resolution alias. Its 32-file failure seal was retained; only that runner packaging was repaired before the successful attempt.

Root and the independent reviewer checked the successful composition seal's 1,364 regular files and eight symlink strings. The seal and its later administrative verification receipt are explicitly outside the sealed member list; the latter is separately hashed. Runtime grant probes on live issues establish revocation. Closed/aborted grant probes use a broader error matcher and establish refusal; they do not independently demonstrate deletion of every private WeakMap entry. The production `finally` retirement/deletion path was also inspected directly.

The unfiltered stable-release-gap corpus passed 263/264 tests with zero pending/skipped tests in 716.793 seconds. Its only failure remains the original browser Promise observability contract: pristine Vitest passed all 13 bodies and Next passed five, with the same eight failures. Original acceptance bodies and assertions were preserved. The pre-run and post-close manifest confirmed all 721 authored files, 9,261 build outputs and HEAD were unchanged throughout the run.

Evidence is retained under `/private/tmp/next-testing-native-session-origin-recheck79/actual-session-evidence-vNCZ6U` (seal `28450f50...`) and `/private/tmp/next-testing-runtime-native-composition-proof103/actual-evidence-5mJ8VG` (seal `40408184...`). Root verification and independent audit receipts retain complete hashes and the bounded conclusions.

This qualifies a private in-process runtime/native-config composition slice. Public admission, reports, planner/cache/watch/IPC integration, compiler-source zero coverage, JavaScript configuration coexistence and the wider stable requirements remain open. All requirements remain OPEN, no stable exception is approved, performance budgets remain deferred and stableReady remains false.

## Increment 62: private native compiler-source zero coverage

The private compiler-source path now composes the original Session-issued native
TypeScript configuration fact with a separate, live source conversion grant.
The grant binds the original wrapper, value, artifact, sealed fact, selection,
source/profile/revision, original compile cancellation and allocation lease.
A fresh reader observation must fully match the original fact; it never replaces
or refreshes that fact. Source and runtime grants use separate private maps and
cannot substitute for one another. Each grant retires after conversion or failure.

The new source retainer captures original pointers and own data descriptors before
its deferred genuine CommonJS compiler lookup. It requires the independent parent
import permission as well as the genuine source grant. Istanbul owns an unexported
zero-conversion scope that can advance only after the complete source validator
succeeds. The full validator runs before and after the unchanged zero algorithm,
followed by the genuine native seal and the final synchronous cancellation and
identity checks. The legacy source validator, source-ID recipe, raw zero algorithm
and Standard conversion algorithm retain their original bytes. Legacy entry points
continue to refuse own native markers and module-configuration authority.

Verification for the combined core80 build:

- Six compiled component suites passed **1,294/1,294**, with zero pending tests.
  The 66 appended controls preserve the complete original test prefixes and all
  original assertions. Repository TypeScript, lint and formatting of all 144
  authored JS/TS paths passed. The native binary remained at SHA256
  `d0f888de5ddfa7aa60aa379e7d78e03c6b13d8ca38f9ac295662d34024d0d940`.
- An independently copied, unpatched Vitest 5.0.4/coverage-v8 installation with
  Vite 8.3.4 produced actual uncovered-source references for both original JSX and
  TSX subjects. Empty tests did not import those subjects, their URLs were absent
  from actual worker V8 coverage, and complete final raw data matched the real
  uncovered-provider conversion result. All original metadata, genuine `fnNames`
  Maps, two `Infinity` statement endpoints and zero counters were retained. A
  separate disposable explicit-import canary triggered the exact evaluation
  detector with a matching raw URL and worker-PID sentinel. The two positive CLIs
  exited zero; the detector CLI exited one with its single assertion passed. Its
  three ordinary pristine workers are counted separately from Next source work.
  All eight oracle processes, the owned group, descriptors and copied roots
  closed; original installed inputs and subject bytes remained unchanged. This
  is an installed-byte pin, not an independent registry-integrity claim.
- The actual native source proof passed development/production × JSX/TSX. All
  nine complete zero outputs (four None, four Some and a valid replacement B)
  matched the independent pristine data after only source-path substitution.
  None/Some JS/map bytes matched in all four cases (20/20/12/10 files). Complete
  raw results were retained before assertions, including baseline converter/map
  observations. No runtime coverage was converted into zero counts, no coverage
  capture was constructed and no source artifact was executed.
- The source proof retained 91 composed source operations, four baseline observer
  scopes, 237 genuine converter inputs/results, 729 original raw maps, 86 completed
  late actions and 165 refusal receipts. Ten actual native receipts contained
  1,370 complete records. Independent checks retained canonical Base64/raw SHA
  binding, source/config lookup and absence relationships, original fact/request
  revisions, original compile abort, final-await cancellation and genuine role
  refusals. Late controls must finish after genuine zero conversion and receive
  the exact captured production API error; observer, persistence, mutation and
  cleanup failures cannot qualify as production refusals.
- The original A grant was active before disposal. Replacement B reused A's full
  request, root, source/profile/revision/IDs and all 15 artifact files byte for
  byte. B refused A's fact, the old grant refused A's closed original allocation,
  and valid B independently sealed its own grant and produced correct full zero
  data. All 14 Sessions disposed, all allocations and both mode parents were
  clean, and all 17 independent parent import operations retired. These import
  operations never claim Session allocation liveness; the genuine source grant
  supplies that check. The source proof created **zero Next workers**.
- The original runtime proof also passed on the current build: nine complete
  pristine comparisons, 59 composed operations, 406 raw maps, 148 converter calls,
  54 completed late actions and 148 independently checked refusal receipts. All
  14 Sessions and 13 genuine runtime workers closed with zero exits and no signal.
  Its original 32 functions, native case/assertion tail and pristine references
  remain unchanged. The bounded parent verified all 13 exact worker records and
  their detached groups; it does not claim ownership certification for an abrupt
  unrecorded-fork window. Such a failure remains explicitly uncertain and CLOSED
  false. No such failure occurred in this actual run.

All actual shared input snapshots remained unchanged. The proof scripts preserve
their prelaunch revisions and the withdrawn source114 readiness-only capture;
source114 created no native Session or worker. The source115 proof was the single
actual source attempt. Successful retained-authority checks and real retirement
delegates demonstrate revocation. Failed-phase checks alone cannot directly prove
private WeakMap deletion; the unconditional production deletion path was also
inspected. Auditor-only diagnostic corrections and their original logs are
retained separately and did not rerun or change actual proof results.

The complete unfiltered original corpus passed **263/264**, with **zero pending or
skipped tests**, in 719.373 seconds. The only failure remains the unchanged browser
Promise observability contract: pristine Vitest 5.0.4 passed all 13 original bodies
and Next passed five, with the same eight failures. The actual process closed
before the final manifest check; all **722** authored source files, **9,264** build
outputs and HEAD remained unchanged. No original acceptance body or assertion was
rewritten, filtered or granted an exception.

Evidence includes the independent oracle under
`next-testing-native-source-zero-oracle-prep111/owner-attempt-R2Ky5U/evidence`
(seal `94751705...`), native source proof115 under
`next-testing-native-source-composition-proof115/actual-evidence-aaDUZ3`
(seal `ccf3af5f...`, 1,822 regular files and eight link strings) and runtime recheck80 under
`next-testing-runtime-composition-recheck80/actual-evidence-JJ9SR4`
(seal `81b4981a...`, 1,473 regular files and eight link strings), all under `/private/tmp/`. Root and independent audit
receipts retain complete hashes and bounded conclusions.

This qualifies the private native compiler-source composition slice and rechecks
the private runtime slice. Public admission, reports, planner/cache/watch/IPC,
module-configuration coexistence and the wider stable requirements remain open.
Both protected requirements remain unchanged. All requirements remain OPEN, no
stable exception is approved, performance budgets remain deferred and stableReady
remains false.

## Increment 63: original config-load provenance and native filesystem utilities

This batch adds a dormant provenance record for the original ordinary Next config
load, a separate native atomic destination no-replace utility, and fresh opaque
compiler/grant identities. The full supervised filesystem service remains
unapplied. None of these utilities grants public compiler, module, coverage or
report admission by itself.

The fixed ordinary config load keeps its original arguments, one load await,
selected config-file read and three returned fields. Its canonical leaf records
only the genuine returned object against the original private observer before
mutable facades escape. Unknown copies, caller graphs and callbacks cannot issue
this origin. The fresh reader reuses the genuinely recorded imports and returns
an explicitly unqualified graph; it does not add an atomic concurrent ESM cut or
module-configuration permission. Original observer/loader and legacy routines
retain their protected bytes. Fresh null-prototype identities use the captured
freeze operation for its side effect and ignore its return, preventing a later
replacement from substituting a reused token. This is a narrow identity fix, not
process or arbitrary-intrinsic isolation.

The native no-replace utility holds directory descriptors, validates canonical
sibling paths and expected physical identity, and uses the platform's atomic
destination no-replace operation. Its separate SWC wrapper captures the original
functions and receiver without querying capability during ordinary binding load.
Unsupported or malformed calls refuse without a replacing Node fallback. The
utility guarantees atomic destination exclusion; source inode comparison is not
an atomic source-inode CAS, and pre/post checks cannot erase intervening namespace
effects. Consumer ownership, supervised cleanup and parent-death recovery remain
separate requirements.

Verification on the matching frozen rebuild:

- The combined native binding rebuild and all 18 bootstrap tasks passed. Seven
  compiled suites passed **1,340/1,340**, with zero skipped or pending tests.
  The complete original 249-test compiler prefix and assertions are unchanged;
  eleven controls were appended and the generated provenance suite adds 35.
  Repository types, lint and formatting of 150 authored JS/TS paths passed.
- Rust formatting and the locked complete NAPI crate check passed. The standalone
  crate test executable failed to link Node's N-API symbols; that failure is
  retained and is not counted as a utility-test pass.
- The fresh actual macOS binding plus compiled wrapper passed six filesystem
  cases: successful publication, existing directory/file/symlink destinations,
  replaced source before the call and wrong original identity. Complete raw
  returns/errors and held identities precede the assertions. All six held
  descriptors, the child process/group, parent descriptors and private root
  closed. This is utility qualification only; concurrent source CAS was not
  demonstrated.
- Two fresh ordinary Node children loaded the exact original named/development
  empty config and named-imports/development helper config. The retained, fresh
  and restored graphs matched the complete expected hashes, with input/edge
  counts 1/0 and 2/1. All 19 actual refusal controls passed, including changed
  files/hooks, unknown/copy/token origins, a replaced getter without invocation
  and original abort identity. Each child loaded config once; both children,
  their parent, groups, output descriptors and fixtures closed. These controls
  created zero native Sessions and zero Next execution workers.

The current frozen footprint has 732 source files, 9,275 build outputs and the
original HEAD. Native SHA256 is
`2cf5c03f5000237de7f8c053e4b363b1787cd793b60b058ac034dc677cddb8d3`.
Root and independent raw audits retain the actual utility seven-file seal
`2d66098e...` and ordinary-load 50-file seal `062f2f3e...`. Original failure/setup
captures and all previous qualified evidence remain intact.

The matching source and runtime composition rechecks also passed with their
original case bodies and assertions preserved. Source coverage matched nine
complete pristine zero-coverage results, including real Map and Infinity
metadata, across 91 composed operations, 237 genuine converter calls and 729 raw
maps. Its 86 completed late mutations produced 165 production refusals. All 14
Sessions disposed; source artifacts executed zero times. Runtime coverage matched
the complete pristine results across all four None/Some pairs and the strict ABA
case, with 59 composed operations, 148 genuine converter calls, 406 raw maps and
54 completed late mutations. Its 148 refusal receipts matched the owner record.
All 14 runtime Sessions disposed and all 13 actual workers closed with exit zero.
The matching source and runtime evidence seals contain 1,784 and 1,364 regular
files respectively, each with eight literal symlink targets. None/Some emitted
JavaScript and map bytes remain exact. Root and independent raw audits compare
the full data rather than selected counters.

The launchers signal only their actual still-unclosed direct child. Runtime
worker PID/group observations are status-only and grant no signal authority;
the outer launcher marks missing normal receipts or remaining processes
uncertain. All recorded processes and groups were independently absent after
normal closure. Execution packages, self aliases and generated allocations were
removed. Original authored fixtures and ordinary compiler caches are retained
and sealed as evidence; their presence is not a cleanup failure. These completed
runs do not establish abrupt unrecorded-fork ownership, a final concurrent ESM
cut, module/configuration coexistence, public admission or report publication.

The unfiltered original acceptance corpus passed **263/264**, with no skipped or
pending tests. The only failed gate remains the original Promise comparison:
pristine Vitest passes 13/13 and Next passes 5/13. All thirteen statuses and full
outcomes are data-identical to the preceding rebuild, including the same eight
failures. No original assertion or acceptance body was changed. The full source,
built output, native binary and HEAD footprint stayed unchanged through all
actual rechecks and full acceptance. This increment was added only after those
owners closed; the earlier ledger bytes and both protected requirement files
remain exact.

The held-directory deletion utility and strict wrapper are separate scratch
candidates. Their isolated controls do not qualify the rebuilt actual binding or
the still-unapplied supervised filesystem service. All requirements remain OPEN,
performance budgets remain deferred, no stable exception is approved and
stableReady remains false.

## Increment 64: native held-directory deletion observation

This increment integrates the previously staged native held-directory deletion
utility and its strict SWC wrapper. The matching actual macOS binding and compiled
wrapper now have bounded utility qualification. The supervised filesystem service
remains unapplied; these utility objects do not grant allocation, compiler,
coverage, module or public admission.

The native factory validates the numeric descriptor and canonical physical
identity, holds its own CLOEXEC duplicate and private event queue, and retains the
original directory referent across pathname changes. It does not reopen a caller
path or close the caller's original descriptor. Polling is nonblocking; sticky
error, revoke or identity uncertainty suppresses a positive deletion result.
Close performs a final poll and independently consumes its two descriptors, with
idempotent repeated closure and an explicit poll-after-close refusal. A close
receipt has no deleted field and cannot substitute for a positive observation.

The SWC wrapper captures the original native functions and receivers without
querying capability during ordinary binding load. It captures the returned
instance's original own or immediate-prototype data methods, rejects accessors
without invoking them, and validates exact synchronous result records. Returned
primitive fields and errors arrays are copied and frozen; fresh null-prototype
wrappers and records ignore the captured freeze operation's return. Every explicit
poll and close calls the original native method. Post-factory validation failure
attempts the captured native close independently and retains any cleanup
uncertainty. Missing or unsupported methods refuse without a Node fallback. This
is not arbitrary-intrinsic or process isolation.

Verification on the matching frozen rebuild:

- The native binding rebuild and all 18 bootstrap tasks passed. Rust formatting,
  the locked complete NAPI crate check and whole-crate test compilation passed.
  The previous standalone crate executable's Node N-API link failure remains
  retained; no new standalone execution pass is claimed. The separate isolated
  native utility controls passed **14/14**: eight groups exercise real filesystem
  operations and lifetimes, and six are explicitly synthetic classifier/error
  delivery controls. Synthetic revoke, saturation and close-error delivery are
  not presented as actual kernel failures.
- Seven compiled suites passed **1,428/1,428**, with zero pending tests. The
  complete original **260-test compiler prefix** remains byte-exact; its 88
  appended synthetic wrapper controls bring that compiler suite to **348/348**.
  These are compiler component counts, not coverage or full acceptance counts.
  Repository types, lint and formatting of 151 authored JS/TS paths passed.
- The fresh actual proof exercised both the original raw NAPI methods and genuine
  compiled SWC `loadBindings` utilities. It retained 88 raw observations before
  assertions, six successful watches and their explicit closure, 30 expected API
  refusals across the native and wrapper paths, and four failed operating-system
  removal attempts. Failed removals, renaming the original directory and deleting
  a foreign replacement did not count as original deletion. Actual removal of
  the held original referent produced the positive observation with its exact
  device/inode, including after the caller closed its original descriptor.
- Actual class constructors and foreign receivers refused; own/prototype method
  descriptors, final-poll closure, repeated close and poll-after-close behavior
  were checked. Raw result shapes and the wrapper's copied null-prototype frozen
  records and errors arrays matched their contracts. Twenty actual CJS modules
  and the single original loaded native binary were pinned. All **11,984** tracked
  inputs stayed exact. The actual child closed with exit zero and no signal;
  parent, child and process group were independently absent, and fixture,
  standard-input, log and parent descriptors closed.

The frozen footprint contains **735** source files and **9,280** build outputs,
with the original HEAD unchanged. Native SHA256 is
`ce248de82262178754e28b5b20164194d16f2f006d72be3603c6616aadf7dd52`.
The immutable build/check record is `a4119486...`, and the source/output freeze is
`805f30d0...`. Root and independent raw audits retain the actual utility evidence
under
`/private/tmp/next-testing-native-directory-deletion-binding-proof82/owner-attempt82-kohkrtqe/evidence`,
seal `e5f593d4...`, with 110 regular files and no symlink entries. Independent raw
audit `c6af29be...` and final seal binding `e6b766...` qualify only these exercised
utility behaviors. Earlier failure captures, ledger bytes and both protected
requirement files remain unchanged.

The matching private source and runtime composition rechecks both closed with
exit zero on this rebuild. Their original case bodies and assertions were
preserved, and complete pristine None/Some JavaScript and source-map inventories
remained byte-exact: 20/20/12/10 files for source and 18/12/18/10 for runtime.
Source retained nine complete zero-coverage oracle comparisons, 91 composed
operations, 729 raw maps, 237 genuine converter calls, 86 completed late actions
and 165 production refusals. Runtime retained 59 composed operations, 406 raw
maps, 148 genuine converter calls, 54 completed late actions and 148 refusals.
Each proof retained ten original native receipts with 1,370 complete records.
Strict ABA controls compared all 15 source or 22 runtime artifact files, their
complete requests and artifacts, a separately active original grant before
disposal, stale-authority refusals and a fresh live positive control.

All 14 Sessions in each proof disposed. Source executed no test artifacts or
workers; runtime's 13 actual workers closed with exit zero and no signal. Root
and independent checks confirmed process/group absence and unchanged tracked
inputs. Authored fixture inputs stayed exact; ordinary compiler caches and their
fixture directories were deliberately retained and sealed. Generated allocations,
execution packages and self aliases were absent. Runtime's outer worker receipts
provide status only and grant no birth identity or worker-signalling authority.
The source evidence seal is `c753ded5...` (1,784 regular files and eight literal
symlinks), bound by independent final receipt `ae4b6cf6...`; runtime seal is
`03f20e3d...` (1,364 regular files and eight literal symlinks), bound by
`2baaae2d...`. These rechecks qualify their private composition slices; they grant
no module/configuration coexistence, public admission or report authority.

The complete unfiltered acceptance corpus passed **263/264**, with zero pending,
skipped or todo tests, in 710.868 seconds. Its sole failure remains the original
browser Promise observability matrix: pristine Vitest 5.0.4 passed all 13 original
bodies and Next passed five. All 13 statuses and complete outcomes in both lanes
were data-equivalent to the preceding rebuild, including the same eight Next
failures. Original acceptance bodies and assertions were preserved. The pre-run
and post-close manifest verified all 735 source files, 9,280 build outputs and
HEAD remained unchanged throughout the run. Root comparison receipt is
`c5aa83be...`. This result retains the known failure; it does not establish full
Vitest compatibility.

This utility supplies no atomic source-inode CAS, proof that moved descendant
contents disappeared, whole-parent-death recovery or preemption of synchronous
kernel calls. Full supervised cleanup, native origin/grants, module/configuration
coexistence, a final concurrent ESM cut, public admission and report publication
retain their separate gates. All requirements remain OPEN, performance budgets
remain deferred, no stable exception is approved and stableReady remains false.

## Increment 65: mocked helper compatibility and private default-policy refusals

This increment integrates the bounded `vi.mocked` identity adapter, the selected
stable mock-type exports and a private default-configuration refusal policy. The
original public production case now exercises the helper-name correction. These
changes grant no public compiler, configuration, coverage or module authority.

`vi.mocked` returns its first argument without inspecting the argument or its
options. The common and client facades preserve the original value, ignore the
receiver and extra arguments, and retain a nonconstructable one-argument helper.
A production run exposed minification of its function name to `S`; the narrow
correction defines the existing helper's name as `mocked`. Its identity and body
remain unchanged. Thirteen selected mock-type names are reexported from the real
bundled `@vitest/spy` symbols. Existing `Mock` and `MockInstance` declarations are
unchanged. The rejected hand-written aliases and their actual type differences
remain retained.

The maintained mock controls retain their three original case bodies and append
one type-only case. In the fresh combined run, five original plain Node TAP cases
and ten ownership observations passed; two original child handles closed with
exit zero and complete stdio. Six existing type programs retained 20 probes, and
eight common/client named-type programs retained 60 probes. All fourteen actual
type programs had zero diagnostics. Complete named inference observations matched
the pinned reference. The earlier isolated reference matrix also retained twelve
programs and 90 probes. These declaration tests do not qualify bare editor,
global or clean installed-consumer resolution.

The private `default-only` configuration policy refuses non-default inputs before
loading arbitrary configuration. For supported plain option objects, it snapshots
own enumerable data fields and refuses inherited policy fields, custom option
prototypes and accessors without invoking those accessors. It requires the
normalized absolute directory and production phase, and refuses unsupported
selectors before and after dotenv loading and before config discovery. Named
configuration, custom configuration, raw configuration, explicit nonsilent
logging, feature-report callbacks and unsupported cache paths refuse. Explicit browser targets, including an empty array, refuse rather
than falling through to a resolver scan. The private native binding path refuses
preloaded or pending ordinary bindings, custom or Wasm selectors and native-load
failure before any fallback/download. A private attempt neither shares nor clears
an ordinary pending load. Ordinary loader behavior remains separately exercised.
This is a refusal-only private boundary, not a configuration sandbox or a public
configuration/compiler grant.

The sealed private policy preparation used genuine package/root declaration
compilation and unchanged Taskr SWC emission. Its actual private unit run passed
409/409; its loader probe passed 9/9, retaining 604 observed CJS input bindings and
no native execution. Named-config side effects were absent in the private lane
and present in the ordinary control. The first combined core84 run then failed
three new synthetic native-loader cases: 1,490/1,493 passed. Those actual failures
remain unchanged in the archive. A separate test-only repair resolves native mock
targets from the real SWC importer and uses virtual mocks only when the module is
absent. Complete case bodies, factories, counters and the original 348-case
compiler prefix remain byte-exact. The exact Jest resolver cache priming call was
not observed; the source-backed explanation is not presented as a runtime cache
trace.

The repaired fresh combined run passed **1,493/1,493** across nine suites, with
zero pending tests. Repository and package types, focused lint, Prettier CHECK and
diff checks passed. No production rebuild was required after the test-only repair;
all production source and actual package outputs stayed unchanged. The matching
core84 freeze binds **777** source files and **9,285** build outputs at the same
HEAD. Native SHA256 remains
`ce248de82262178754e28b5b20164194d16f2f006d72be3603c6616aadf7dd52`;
its latest actual utility proof remains the separate core82 proof. Core84 root
record is `696e22b0...`, and source/output freeze is `a0013f82...`.

The fresh original two-case Next Node production fixture passed **2/2**, including
all helper identities, option forms, zero-trap observations, name/length,
nonconstructability and the genuine mock chain. The real production CLI exited
zero. Its two distinct original watch/execution workers both spawned and closed
with exit zero and complete stdio; the 14-event journal retained no worker-thread
or forced-drain uncertainty. Input inventories before, after and after cleanup
matched for 174,321 selected regular files and 10,953 literal links. The fixture
was removed and the original owner wait/logs closed in 118.381 seconds. Root raw
verification is retained at
`/private/tmp/next-testing-mocked-name138-production84-root-actual-verification.json`.
This qualifies the fresh production name correction only. Static input inventories
are not observed module-import inventories or arbitrary-import completeness.
A later independent current-inventory audit failed on an absent pinned cache
file after 153,662 matching entries; the symlink loop was not reached. Its OS1
and full raw log remain retained. The deletion producer was not observed. Saved
checks describe the completed row; no current full-inventory equality or reusable
release is claimed. The bounded source/actual/history archive seal is
`50dab441...`.

The original six public rows remain historical: the Next production row was 1/2,
and the Next browser row's three test bodies passed while its owner retained an
unresolved worker-thread/resource HOLD. That original held fixture remains
unchanged. Completion of its original OS waits does not qualify resource closure,
worker origin or all six rows. The earlier full core83 run also remains 263/264,
with the original browser Promise observability failure retained.

The complete unfiltered core84 acceptance corpus passed **262/264**, with zero
pending or todo tests, in 915.199 seconds. All 264 original case names and all
432 frozen corpus source files remain unchanged. The original Promise gate
retained pristine 13/13 and Next 5/13; all thirteen statuses and complete outcomes
in both lanes matched core83 exactly. A second actual failure is retained in
TypeScript watch coverage: after adding a test file, pristine ran only that file,
while Next actually reran both the added and existing file. Its addition report
contained two tests where the unchanged oracle expected one. The cause remains
under investigation, and the unchanged expected count remains one. The full actual result and post-close unchanged 777-source,
9,285-output/HEAD verification are bound by
`/private/tmp/next-testing-batch84-full-root-verification.json`.

Pristine Vitest 5.0.4 Chai discovery passed seven original cases across three
separate actual commands, retaining full namespace/plugin, raw-vs-wrapped
counter/task, should and retained-assertion observations. Both cache directories
were owned by the fresh fixture; the 7,795-file/333-link reference input inventory
stayed unchanged. Its 33 additional cache files relative to the older inventory
were retained explicitly; none of the older 7,762 regular inputs changed. The
worker-exit should observation never arrived, so post-file restoration remains
unqualified. The raw discovery archive seal is `ffea26fc...`.

The unchanged original three-case Chai contract was then run through genuine
Next Node development compilation and execution. It failed during collection at
`chai.use` on original line 30 because `chai` was undefined. The actual report
contains one failed file and zero collected or executed tests; the observation
file is empty. None of the three authored bodies ran, and no passes, skips or
counter observations were manufactured. Both actual watch and execution workers
spawned and closed with exit zero and complete stdio. The CLI exited one; its
separate operational owner closed zero in 116.694 seconds, removed its fixture,
and retained matching before/after/post-cleanup selected input checks for 170,670
regular files and 10,953 literal links. Root actual verification is
`/private/tmp/next-testing-chai141-next-diagnostic84-root-actual-verification.json`.
This records a real missing-namespace collection failure. Chai compatibility
remains unqualified.

No named Chai namespace, raw assertion ownership, Browser Mode, editor/global
bridge, public config/compiler admission or complete stable contract is qualified
by these bounded results. Original acceptance bodies and assertions remain
unchanged. All requirements remain OPEN, performance budgets remain deferred,
no stable exception is approved and stableReady remains false.

## Increment 66: parallel compatibility work and repaired watch/editor integration

Independent browser compilation, Chai ownership, editor declarations and watch
scheduling work now runs in separate owned copies. Shared source application and
normal builds remain coordinated. These bounded results do not close a stable
requirement or replace the original acceptance corpus.

Core85 integrated the guarded Chai assertion constructor prerequisite, explicit
editor type opt-ins and settled watch readiness. Its normal package build passed,
but the complete ten-suite focused run retained **1,536/1,538**, with zero pending
or todo tests. Repository types, lint and formatting passed. The two failures
were the original snapshot keyboard interaction and the installed editor-type
producer. Both actual failures and the unchanged post-run source/output freeze
remain retained at `/private/tmp/next-testing-batch85-red-root-verification.json`.

The Chai prerequisite preserves the original 108-case lifecycle prefix and adds
two constructor/retained-owner cases. It uses the real assertion primitive and
original task scope; it does not export the full namespace. The explicit type
bridge supports bare/config imports, globals and import-meta declarations through
named Next opt-ins. A fresh packed consumer runs eight original compiler programs
without an installed Vitest or Vite package: five succeed and three retain their
expected unresolved errors. The ordinary upstream `types: ["vitest/globals"]`
configuration remains unsupported. No runtime, browser or in-source admission
follows from declaration checks.

The first watch fix publishes terminal readiness only after cleanup, dependency
baseline commitment and cancellation release. A private delay probe reproduced
the extra-run symptom and the repaired ordering avoided it, but the exact cause
of the earlier unmodified full84 watch failure is still unproven. Core85 exposed
a separate snapshot regression: deferred filesystem notifications aborted the
completed writer before its readiness notification. The successor carries a
complete follow-up request through cleanup, publishes the closed generation,
then queues the follow-up even if publication throws. Unsafe cleanup stops before
either action. Three appended controls first produced 43/45 and then passed with
the fix. The unchanged whole 272-case CLI suite plus all 45 watch cases passed
317/317 in the private host after repairing omitted fixture packaging; that
earlier packaging failure remains retained. The watch packet seal is
`7a2ae1aa...`.

The editor producer originally selected pnpm 10 in the repository and pnpm 11
from its fresh consumer directory. The repair pins owned project metadata and
checks the actual dispatcher version for every pack/install operation. Packing
starts from the pinned workspace while retaining each dependency's original
manifest. A subsequent real check correctly exposed that packing strips a
TypeScript metadata field; the installed manifest is now compared with the
actual archive, while both compiler JavaScript files remain byte-exact to their
selected source. All failed attempts remain separate. Genuine Corepack private
verification passed the whole five-case suite, types, lint and formatting. The
sealed helper-only handoff has 1,324 regular files and no links, seal
`57659e35...`. Root's independent final check on the exact core85 host also
passed all eight original compiler expectations, with all 18 operations selecting
pnpm 10.33.0 and all 45 original tool owners closed. Its actual result is
`/private/tmp/next-testing-editor-pnpm-repair85-root-actual02/root-verification.json`.

Core86 applied the reviewed three-file watch successor and one-file producer
repair after exact before/after guards and private patch replay. The owned watch
builder closed before the normal `pnpm --filter=next build`, which exited zero.
The fresh complete ten-suite run passed **1,541/1,541**, with zero pending or todo
tests; all 1,538 preceding case rows and their name multiplicities remain, plus
three appended watch controls. Both original core85 failures now pass. Repository
types, focused lint, Prettier CHECK and diff checks also pass. The post-run freeze
retains all **793** selected source files and **9,285** outputs at the same HEAD,
with the native binary unchanged. Root verification is
`/private/tmp/next-testing-batch86-root-verification.json`. The original whole
264-case acceptance suite has not been rerun for core86.

The full Chai namespace and default native browser creator transform remain
separate, unapplied successors under review. Private native execution passed the
original promise/startup/Proxy cases and additional unchanged browser fixtures;
existing compiler/resource controls also passed. Source review retained an actual labeled-loop failure; a direct-eval callee
wrapper concern is still being tested before promotion. Chai review retained
raw receiver/prototype escape and observable Proxy-trap failures; a private
primitive identity repair is still being verified. Earlier loader-only browser
results, private native results and component Chai comparisons are not a new
combined public or stable qualification.

The original full84 result remains 262/264. The held public134 fixture, its
resource HOLD, older public failures and all original acceptance bodies and
assertions remain unchanged. Both protected requirements files remain unchanged.
All requirements remain OPEN, performance budgets remain deferred, no stable
exception is approved and stableReady remains false.

## Increment 67: normal native browser and Chai integration

The independent browser, assertion and dependency tracks now have a combined
normal build. Earlier red results remain evidence. Core87's normal native and
bootstrap builds passed, but its complete thirteen-suite run passed
**1,555/1,556**: the original immutable startup-classifier case failed, and the
genuine repository Rust formatting check failed on four touched files. The
private native browser positives did not override that whole-root regression.
The red is retained at
`/private/tmp/next-testing-batch87-red-root-verification.json`.

The native successor restores the byte-exact legacy classifier for ordinary
untransformed helpers. The actual Browser compiler resolves its canonical
framework import to a separate engine classifier, requires that module and its
framework issuer in the validated graph, refuses the legacy route, and emits a
route descriptor only after validation. The reader and executor require that
descriptor; an older native artifact refuses before Browser launch. Both routes
use the original single async-context/Scope module. There is no caller-supplied
owner, registration setter or ambient-scope inference. The real root Rust
configuration also fixes the retained formatting failure.

Private native verification retained all thirteen complete pristine Promise
trace/outcome objects across six genuine Browser controls, twenty-one ingress
and semantic refusals, the old-native descriptor refusal, **444/444** existing
compiler/resource controls, **122/122** maintained controls, nine Rust tests and
zero type/lint/format failures. The immutable final archive binds 1,352 regular
files and no links, seal `4cac80ca...`; root independently verified the complete
tree. These private results remain distinct from the normal shared build and
its actual public acceptance results.

Chai's original constructor now supplies an opaque read-only identity for its
raw target and real proxy; the genuine Vitest resolves/rejects factories retain
that same identity. Assertion ownership still comes from an admitted producer
and its original Scope, never merely from a token's existence. Unknown and
revoked receiver lookups cause no traps. The public Chai namespace preserves its
nine-key shape. Earlier receiver/prototype escapes, hostile receiver traps and
hidden-target failures remain archived.

The normal bundle entries also needed a declared direct Chai 6.3.0 build input.
Private alias builds had hidden its absence. The matching Next importer and
patched package references were added; an existing duplicate Storybook mapping
was repaired by removing only its three duplicate lines. Fresh frozen offline
validation retained all 940 copied inputs. Root then performed the real pinned
pnpm installation and the normal Taskr primitive build; both passed, exact
installed patch bytes matched their independently reconstructed package sources,
and direct/transitive Chai resolved to the same file. No private generated bundle
or native binary was copied into the shared implementation.

Core88's normal native build and full bootstrap passed. All **1,568/1,568** tests
in thirteen complete focused suites passed, with all preceding case names and
their multiplicities retained. Types, lint, formatting, Rust formatting and all
nine Rust tests passed. Its post-check and post-public freezes retained **809**
selected source files and **9,291** outputs exactly. The original public Chai CLI
contract passed **3/3** and matched all seventeen complete pristine dictionaries;
both original watch/execution workers exited and closed zero, their stdio closed,
and the owned fixture was removed. Root verification and the public receipt are
`/private/tmp/next-testing-batch88-root-verification.json` and
`/private/tmp/next-testing-chai-public-built88-actual01/owner-result.json`.

A further genuine pristine comparison exposed hidden `assert.strictEqual` and
`should.equal` plugin receivers. The Chai successor keeps the entire upstream
777-line assertion-interface block and 1,899-byte should body literal inside
pure factories. Their only inputs are the genuine admitted constructor and
flag operation. Callback receiver checks remain lookup-only. This repairs real
construction before callbacks without changing zero-count/null-task semantics
or allowing unknown raw factories and closed owners to borrow another file.
The original 111-case prefix and all old three/seventeen fixture predicates are
literal; three appended fresh-process controls retain the six new pristine
dictionaries, nested helpers, original failure payloads and A-to-B tombstones.
The private complete run passed **112/112**, package/root types, lint and
formatting. All earlier harness/type/double-admission failures remain archived.
Its immutable archive has 4,915 regular files and 255 literal links, seal
`5a41f33d...`; neither root nor peer qualifies the link targets by dereferencing
them.

Core89 integrated only thirteen authored files from that successor, preserving
the preceding creator controls and canonical dependency fixes. A new real
frozen offline install, normal Taskr regeneration and normal core-package build
all passed. The normal native binary remains the core88 binary, and the Rust
source hashes are unchanged. All **1,569/1,569** tests in the complete thirteen
focused suites passed; all preceding 1,568 case-name multiplicities remain.
Root types, lint and formatting passed. The freeze binds **812** selected source
files and **9,291** outputs. Root verification is
`/private/tmp/next-testing-batch89-root-verification.json`.

Both core89 public CLI consumers passed independently: the unchanged original
**3/3** cases matched all seventeen complete observations, and the unchanged
pristine-discovered hidden-helper **2/2** cases matched all six observations.
All four original watch/execution workers exited and closed zero with stdio
closed, no intervention, and both owned fixtures removed. Their receipts are
`/private/tmp/next-testing-chai-public-built89-actual01/owner-result.json` and
`/private/tmp/next-testing-chai-hidden-public-built89-actual01/owner-result.json`.

The unchanged unfiltered original whole acceptance suite now passes
**264/264**, with zero pending or todo tests, in 730.904 seconds. All original
case-name multiplicities are exact. Both full84 failures now pass: genuine
Browser Promise await semantics and compiler-source TypeScript watch coverage
with default retention. The complete Promise outcome objects match pristine;
both runners' watch stages have the original `[1, 1, 2]` counts. All **812**
selected source files and **9,291** outputs remain exact after the original owner
closed zero. The whole-run record is
`/private/tmp/next-testing-batch89-full-root-verification.json`. A complete
passing finite corpus does not close the remaining functional/release matrix.

The unchanged six Browser fixtures were also replayed against the actual normal
core89 package and native binary, with no private binary selection or substitute
outputs. All thirteen complete pristine Promise trace/outcome objects compare
with `deepStrictEqual`, the two startup and four Proxy cases pass, both additional
adoption/return controls pass, and the intentional mapped failure remains at
`contract.case.mjs:9:9`. All twenty-one original ingress bodies/reasons refuse.
Twenty-seven compiler Sessions disposed; all six original Chromium handles
exited/closed zero with stdio closed, twenty-eight owned roots are absent, and
the owned browser temporary directory is empty. The selected root input hashes
remain exact. The independent normal replay is
`/private/tmp/next-testing-browser-creator-normal89/evidence/verification.json`,
with a 245-file/no-link archive, seal `d5f87748...`. It does not establish a
complete descendant/module inventory or borrow the separate 264-case outcome.

Another fresh Node lifecycle component found a remaining actual assertion
lifetime bypass. An authored replacement of global `Proxy` can intercept a raw
constructor target during genuine public `chai.expect` construction. After
restoring the builtin and disposing the original runtime, that raw target's
method and flags remain accessible outside A and inside B. The initial probe
that retained only the opaque presentation failed closed; both attempts remain
at `/private/tmp/next-testing-chai-proxy-builtin-probe89*.cjs` with their raw JSON
results. This is a real normal-package component observation, not a public CLI
worker origin qualification. The user clarified that this is functional
compatibility work, not security work. No builtin hardening change or additional
release gate is being pursued from that observation; ordinary pristine behavior
must be preserved.

The normal bootstrap's generated-output comparison also retained an unrelated
font declaration's `fallbackFont` precision change from `string` to `any`; its
cause is not established, and semantic equivalence is not claimed. The detailed
bounded inventory review is
`/private/tmp/next-testing-batch88-freeze-independent-review/review.json`.

The old held public134 fixture and resource HOLD remain untouched. Ordinary
Chai `addLengthGuard`, `proxify` and event compatibility, broader types/editor
integration, fixture/lifecycle behavior, platform/downstream/stress and release
requirements remain work. Independent implementation tracks continue. Both
protected requirements documents remain unchanged. All requirements remain OPEN,
performance budgets remain deferred, no stable exception is approved, and
stableReady remains false.

## Increment 68: normal Chai utility and matcher-type compatibility

October 17, 2026. Core90 first integrated genuine `addLengthGuard` delegation,
with all 124 lifecycle cases and repository types/lint/style passing. Core91 then
combined `proxify`, registration events and the public `MatcherResult`,
`SyncMatcherResult` and `AsyncMatcherResult` aliases. Proxified assertions,
methods and `.resolves`/`.rejects` inputs retain their normal assertion behavior
and file lifecycle. Events preserve caller callbacks and native listener
semantics while removing file listeners during disposal. Event targets retain
file-owned wrapper methods; complete native object-shape parity is not claimed.
The matcher aliases reexport the pinned primitive result types, with no runtime
JavaScript addition.

A real frozen offline dependency installation, normal primitive regeneration and
normal Next package build all pass. The native binary remains the normal core88
binary. All **1,573/1,573** cases in the thirteen focused suites pass, with zero
pending or todo tests; all previous 1,569 names and multiplicities remain.
Repository types, ESLint and formatting pass. The installed-package checks also
exercise the three matcher aliases through a real helper package and preserve
missing-opt-in/unsupported-import diagnostics. The focused record is
`/private/tmp/next-testing-batch91-root-verification.json`.

The original unfiltered acceptance suite passes **264/264** in 745.870 seconds,
with no pending or todo tests. All original names/multiplicities and all 432
release-gap source inputs remain unchanged. The complete inventory of **825**
source files and **9,294** outputs is exact after the full owner closes zero.
Full and focused validation ran in parallel; an intermediate inventory snapshot
recorded the full suite's live temporary fixture tree, and the final complete
comparison passes after cleanup. No test bodies or assertions were filtered to
obtain the passing result. The whole-run record is
`/private/tmp/next-testing-batch91-full-root-verification.json`.

Three independent public `next test` consumers also close zero: the unchanged
original Chai three-body/seventeen-record contract, the hidden-helper
two-body/six-record contract, and all three utility bodies with all six complete
pristine observation records. Actual dictionaries compare exactly with genuine
Vitest 5.0.4. Original CLI/worker handles and stdio close normally, temporary
fixtures are removed, and selected source/build inputs remain unchanged.
Records are in `/private/tmp/next-testing-chai-public-built91-actual01/`,
`/private/tmp/next-testing-chai-hidden-public-built91-actual01/` and
`/private/tmp/next-testing-chai-utilities-public-built91-actual01/`.

Work continues on ordinary functional gaps: `vi.when`/`isWhenChain`, real
compiler-backed `vi.importMock`/`vi.unmock`, Browser `chai`/`should`, and Chai's two
legacy static settings aliases. Scratch/reference results are not normal shared
integration claims. The user-directed scope remains functional compatibility;
no builtin tamper-hardening work or additional security release gate is added.
The protected requirements files remain unchanged, performance work remains
deferred, no stable exception is approved, and stableReady remains false.

## Increment 69: conditional mocks, Browser output and mock-import cache ordering

October 18, 2026. Core92 integrated `vi.when`/`isWhenChain`, Browser
`chai`/`should`, and Chai's `includeStack`/`showDiff` static aliases. Its normal
package/primitive builds, 1,576 focused cases and repository types/lint/style
passed. Public Node consumers matched all six conditional-mock bodies and both
static-settings bodies, including their complete pristine observations. The
Browser consumer passed its three bodies but initially emitted no console rows;
that comparison remained red against four pristine dictionaries. Core92 did not
rerun the original full264 corpus. Its record is
`/private/tmp/next-testing-batch92-root-verification.json`.

Core93 integrated literal compiler-backed `vi.importMock` and hoisted
`vi.unmock` for the bounded development Node ESM lane, ordinary Browser console
forwarding, and `toHaveBeenExhausted`. Normal native compilation and bootstrap
both exited zero; no private native binary or generated substitute was copied.
The three public mock consumers passed **18/18** cases and all eighteen complete
dictionaries: original five, additive seven and six identifier-collision cases.
They cover factory/manual identity, fresh automock without registration,
source-order unmock, setup-held namespaces and authored/escaped helper names.
The independent comparison is
`/private/tmp/next-testing-import-mock-public93-independent-review.json`.

The unchanged Browser Chai public consumer now passes **3/3** with all four
complete pristine dictionaries, preserving the earlier missing-output red.
The matcher public consumer passes **6/6** and all twenty-six complete pristine
observations. Original CLI waits and ordinary fixture cleanup pass. Across the
complete fifteen focused suites, **1,793/1,793** cases pass: 1,577 in the prior
thirteen suites plus 216 in the complete mocking/execution suites. Root types,
Prettier and Rust formatting pass. One ESLint `no-shadow` callback-parameter
error remains recorded; its local rename is corrected and verified in core94 below.

The unchanged unfiltered whole run is **233/264**, with thirty-one coverage or
coverage-watch failures, zero pending/todo, in 614.955 seconds. All 264 original
names/multiplicities and 432 release-gap source files remain exact; selected
source/build bytes are unchanged after all readers close. Runtime remapping
reports `Coverage mapping coordinate exceeds source content`; compiler-source
analysis reports `Compiler coverage analysis coordinate exceeds retained content`.
Focused/public greens do not replace this red. The consolidated actual record is
`/private/tmp/next-testing-batch93-red-root-verification.json`.

An actual compile-only standard-coverage diagnostic retained the native chunk
and maps before disposing its Session. Among eight maps and 137,846 mappings,
exactly two generated positions exceed their line lengths. Both are removed
inline `@ts-expect-error` comment ends in `assertions/when.ts`; both original
positions are valid. The raw diagnostic is
`/private/tmp/next-testing-coverage93-coordinate-diagnostic/all-invalid-02.json`.
The core94 workaround moves those comments above their whole calls, preserving
comment text and runtime syntax; package types and formatting pass privately.
No decoder bounds are relaxed; the normal regenerated-map result is recorded below.

A separate genuine pending setup-factory case observes B/spec first, then late
A/setup, with later calls returning A while held B remains B. Normal93 instead
returns B for the pending A call and later reads. Both actual results remain.
The core94 cache-order repair reads the existing cache before awaiting factory
resolution, matching Vitest's ordering; its complete maintained suite is 38/38.
The same batch adds `expect.unreachable` and genuine Browser console argument
formatting; the private red/green histories remain separate from normal results.

Core94 normal package/declaration build, repository types, ESLint and Prettier
all exit zero. All **1,802/1,802** cases across sixteen complete focused suites
pass, retaining all 1,793 prior focused names and multiplicities. The native
binary and primitive inputs are unchanged from their verified normal builds.
Normal public comparisons pass all original eighteen mock cases/rows plus the
pending-factory case and its complete identity dictionary; all three unreachable
bodies/nine rows; all six exhaustion bodies/twenty-six rows; and all three
Browser Chai bodies/four rows. Browser formatting passes both original bodies
and all seven exact payloads/streams without duplicates, covering objects,
arrays, substitutions, errors, warnings and error output. Original CLI waits
and fixture cleanup pass. The interim record is
`/private/tmp/next-testing-batch94-interim-verification.json`.
The actual normal94 compile-only scan checks eight maps and **137,875**
mapping points with **zero invalid coordinates** in either domain. It disposes
the Session and removes its artifact/fixture; the comparison predicates are
unchanged. Its retained result is
`/private/tmp/next-testing-coverage94-coordinate-diagnostic/attempt-01/coordinates.json`.
The unchanged unfiltered acceptance run now passes **264/264**, with zero
failed, pending or todo cases, in 816.522 seconds. All 264 original names
and multiplicities and all 432 release-gap source files remain exact.
After all readers close, every selected source and build-output byte is
unchanged. This includes the thirty-one coverage and coverage-watch cases
that failed in core93. The complete normal94 record is
`/private/tmp/next-testing-batch94-root-verification.json`.

The protected requirements documents remain unchanged. Remaining ordinary
functional, downstream, platform and release work stays OPEN; performance budgets
remain deferred, no stable exception is approved, and stableReady remains false.

## Increment 70: Browser global stubs and assertion helper callsites

October 18, 2026. Core95 composes the Browser global-stub/fluent-facade repair
with `vi.defineHelper` and its Node diagnostic presentation. The normal package
and declaration build exits zero in 22.917 seconds, including the actual package
`generate_types` task. The verified native binary and bundled primitives are
unchanged and reused; this batch does not claim another native compilation.

The genuine Browser global-stub consumer previously produced one passing and
two failing cases in normal94, with false bulk-method return identities in its
raw rows. The same three literal bodies now pass, and all five complete pristine
observations match. The implementation reuses the actual backend for descriptors,
aliases, absent and symbol properties, explicit restoration and cross-case
lifetime. Stable forwarding methods return the public Browser `vi` facade,
including a detached clear call, bulk resets/restoration and subsequent chains.

The unchanged helper consumer previously failed normal94 collection because
`vi.defineHelper` was absent. Normal95 now matches all five expected outcomes:
two successful cases and three deliberate assertion failures, with the expected
CLI exit one. All five complete semantic dictionaries match the actual reference,
including receiver/argument/value identities, object and function thenables,
rejection values and the real soft-assertion return object. The three mapped and
human failure locations match the exact outer, async and soft callers at
`helpers.test.mjs:130:3`, `135:3` and `139:18`. Each JSON failure message equals
the retained complete raw helper stack. Common and client declaration consumers
preserve the exact generic, receiver, overload and async function types.

All **1,915/1,915** cases pass across seventeen complete focused suites, retaining
all 1,802 prior focused names and multiplicities. This includes all 111 reporting
cases with actual normal Jest controller exit zero. The earlier private harness
failure after passing case bodies remains recorded and is not counted as a
private controller success. Repository types and ESLint exit zero. The existing
Browser Chai consumer still matches all three bodies/four complete rows, and the
Browser console consumer matches both bodies/all seven payloads and streams.
Every public consumer completes its original CLI wait and fixture cleanup.

The unchanged unfiltered acceptance run passes **264/264**, with zero failed,
pending or todo cases, in **727.256 seconds**. All original names/multiplicities
and 432 release-gap source files remain exact. After all acceptance and public
readers close, all 860 selected sources and 9,303 build outputs remain unchanged.
The complete actual checkpoint is
`/private/tmp/next-testing-batch95-root-verification.json`.

An expanded formatting check exposed three older reference fixtures. The
follow-up keeps the executable Chai reference bytes exact in a `.mjs.txt` fixture
and updates only its copy-source path; the copied executable filename is the
same. The two JSON files change whitespace only, with identical parsed values.
The complete lifecycle suite passes **129/129**, changed-loader lint exits zero,
and the broader formatting selection passes all 83 eligible authored files.
Framework source, all build outputs and the full acceptance corpus are unchanged
by this unit-fixture follow-up. Its separate result is
`/private/tmp/next-testing-reference-format-followup95/verification.json`.

The protected requirements documents remain unchanged. Browser helper diagnostic
parity, Browser mock integration, artifact/report callbacks and the wider release
matrix remain open. Performance budgets remain deferred, no stable exception is
approved, and stableReady remains false.

## Increment 71: Browser imports and Node artifact records

October 18, 2026. The integrated Browser `vi.importMock`/`vi.unmock` path uses
Next’s actual native loader and per-file alias/cache lifetime. The unchanged
public consumers match all fifteen Browser bodies and twenty complete observation
rows, plus the separate autospy body and row. The Node consumers retain all
eighteen original bodies and the separate pending-thenable body. Completed
asynchronous imports keep their original file backend; unfinished imports are
not drained. URL presentation still differs between Next and Vite, and broader
Browser profiles remain unqualified.

The named Node `recordArtifact(task, artifact)` API now retains serializable
artifact data and original started-task attribution for the file lifetime,
including late records for a completed case. Its four unchanged public bodies
match the genuine complete dictionaries, task completion artifact counts
`[3, 0, 0, 1]`, event ordering, and all retained attachment bytes. The returned
clone and task entry preserve the measured identity behavior. The standard JSON
assertion result gains no artifacts field. Live custom reporter hooks, Browser
artifact parity and collected-but-unrun tasks remain open.

Artifact locations use retained source-map content and parsed call/token
locations. All seven measured call forms now match genuine coordinates,
including the optional call’s actual opening parenthesis at `15:29`. The earlier
`15:27` observation and the distinct fixture output-asset resolution failure
remain recorded. The operational replacement changed only the observer output
path, retained all seven call lines literally, and was measured against the
genuine reference before the Next run.

Normal100 passes all **1,931/1,931** focused cases, retaining all prior 1,915
names and multiplicities, and the unchanged full acceptance suite passes
**264/264** in **717.706 seconds**. All 432 release-gap sources remain exact.
Types, lint and formatting pass; all selected sources and build outputs remain
unchanged after the readers close. The complete checkpoint is
`/private/tmp/next-testing-batch100-root-verification.json`.

Normal101 also passes all **1,931/1,931** focused cases on the pinned Node 26
runtime, with repository types, lint and formatting passing. The first launcher
accidentally used the shell’s Node 20 and produced 33 runtime-dependent failures;
that complete output is retained, and the corrected full-suite launch changes
only the runtime/environment selection. All source and build outputs remain
exact after the public and regression readers close. Its actual checkpoint is
`/private/tmp/next-testing-batch101-root-verification.json`.

Normal101 additionally removes the compiler’s blanket rejection of ordinary
nested function declarations while preserving normal SWC declaration emission
and the separate try/finally scope restriction. All ten focused Rust transform
controls pass, and actual native and bootstrap builds exit zero. The unchanged
Browser helper consumer now reaches all five bodies and matches the two passes,
three intentional failures and all five semantic dictionaries. Its three
presented caller locations still differ from the reference, so Browser helper
diagnostic parity remains open. The next full acceptance run follows that
repair; the normal100 full result is not attributed to the changed native build.

The protected requirements documents remain unchanged. Performance budgets are
deferred, no stable exception is approved, and stableReady remains false.

## Increment 72: Browser real waits and helper diagnostics

October 18, 2026. Development Chromium now preserves the measured real-timer
`vi.waitFor`/`vi.waitUntil` behavior across test boundaries and `afterAll`.
The fifteen unchanged public bodies match all twenty-one complete observation
rows, including immediate values, detached calls, asynchronous polling, original
errors, timeout and thenable behavior. Unused waits stop at file cleanup without
being forced to settle. Bare/extracted `expect` follows the current common test
state, while held `context.expect` retains its local state; completed assertion
counts are checked at their original boundary.

Browser progress reports now queue without waiting for a network response at
each test boundary, and drain before terminal completion. Each payload is
serialized when queued, preserving the event's original data. Ordered delivery,
transport and serialization failures, and cleanup have focused regression
controls. The earlier extra-poll failures remain recorded; the unchanged public
replay now matches the reference counters exactly.

The native creator transform preserves strict block function declaration names
without converting declarations to expressions or changing hoisting, mutable
recursion, identity or ordinary function-body declarations. All thirteen Rust
controls pass. The original three public cases and five additional declaration
cases match their complete reference observations on the actual native build.

Browser helper diagnostics now use retained source-map content and parsed await
call locations to present the actual outer caller. All five unchanged helper
bodies match, including their two passes and three intentional failures. The
three diagnostic locations are exactly `130:3`, `135:3` and `139:18`; raw helper
stacks remain intact. The thirty-five module-mocking regression bodies also
retain their complete observations.

Normal105 passes all **1,940/1,940** focused cases across the same seventeen
whole suites, retaining every prior 1,915 baseline name and multiplicity. The
unchanged full acceptance suite passes **264/264** in **727.614 seconds**;
all 432 release-gap sources remain exact. Repository types, lint and formatting
pass, and the selected sources and build outputs remain unchanged after all
readers close. Normal105 adds only the scoped capability metadata over the
normal104 public Browser runtime and normal103 native declaration transform.
The complete checkpoint is `/private/tmp/next-testing-batch105-root-verification.json`.

Qualification remains bounded to the measured development Chromium profiles.
Browser numeric retry/repeat admission, fake timers and broader late assertion,
snapshot and plugin interactions remain open. The protected requirements
files are unchanged, performance budgets remain deferred and stableReady
remains false.

## Increment 73: Serial Browser retries and repeats

October 18, 2026. Development Chromium client files now use the existing runner
for numeric project retry defaults and suite/test retry and repeat counts.
Each logical test keeps its published context, task, signal and local expect
identity through its attempts, within the same file page. Retry completion
replaces an earlier failed attempt for the final logical outcome; a failed
repeat remains failed. Earlier attempt diagnostics and original error stacks
remain in the report. Hook and file failures remain independent of a recovered
test.

The fourteen-case genuine corpus now matches all four complete observation
dictionaries, final case statuses, error headings and counts, and every attempt
sequence. It includes recovered and exhausted retries, failed and successful
repeats, combined retries/repeats, inheritance and explicit overrides, runtime
skip, blocked suites, hook failure and the held local-expect afterAll case.
The genuine and Next CLIs both exit one for the intentional failures. All
twenty-four starts and twenty-seven ends retain their actual IDs and ordinals.
The earlier normal106 mismatch in context/local-expect wrapper identity remains
recorded; normal107 matches the unchanged inputs and expectations.

The thirty-five module-mocking regression bodies, fifteen real-wait bodies and
twenty-one complete wait observations, and five helper/diagnostic bodies also
retain their expected results. All public owners and fixtures close normally.

Normal108 passes all **1,951/1,951** focused cases across the same seventeen
whole suites. Every prior 1,915 baseline name and all 1,940 normal105 cases
remain, with exactly eleven additions. The unchanged full acceptance suite
passes **264/264** in **726.596 seconds**; all 432 release-gap sources remain
exact. Repository types, lint and formatting pass. All selected sources and
build outputs remain unchanged after the readers close. Normal108 adds only
the scoped capability metadata over the normal107 runtime. The complete
checkpoint is `/private/tmp/next-testing-batch108-root-verification.json`.

Object retry, concurrent Browser execution, deadline/cancellation breadth,
exact URL-bearing stack presentation and other Browser profiles remain
unqualified. The protected requirements files are unchanged. Performance budgets
remain deferred, and stableReady remains false.

## Increment 74: Browser clocks, project defaults and real runner timing

October 18, 2026. Serial development Chromium uses the existing pinned fake-clock
algorithms for public timer operations. The unchanged eight-case reference
matches all twelve complete observations, including Date-only system time,
synchronous and asynchronous advancement, nested callbacks, real waits advancing
the active clock, cross-case clock persistence, held local expectations and
explicit restoration that discards pending timers.

Project fakeTimers settings reach the Browser runtime before collection. The
four-case corpus matches every complete dictionary and raw case outcome for
numeric now, selected toFake arrays, loopLimit and shouldClearNativeTimers.
Per-call options shallowly override project settings and replace timer arrays.
The ordinary native-clear warning and original raw stacks remain recorded.

Two integration defects found by these unchanged inputs are repaired. The
Turbopack fallback Refresh signature returns the callback it annotates, so a
valid afterAll callback containing useRealTimers stays callable. Case and suite
durations use the runner's captured real clock, so a retained fake Date cannot
produce negative durations. Maintained controls exercise actual fallback module
execution and real lifecycle results through the unchanged Browser result
collector. The earlier collection and retained-clock failures remain recorded.

The fifteen real-wait cases and twenty-one observations, fourteen retry cases
and four dictionaries, thirty-five mocking cases and five helper cases all
retain their expected outcomes and ordinary cleanup. Final normal113 passes
**1,958/1,958** cases across the same seventeen complete suites. All prior
1,951 cases remain with exactly seven additions. Repository types, lint and
formatting pass. The unchanged full acceptance suite passes **264/264** in
**749.018 seconds**, with all 432 release-gap sources unchanged. All selected
source and build outputs remain exact after readers close. The complete
checkpoint is `/private/tmp/next-testing-batch113-root-verification.json`.

Separate read-only observations also match four animation-frame/performance
cases and five complete rows. The Date-valued executable-project comparison
retains the pinned reference's one pass and three epoch-validation failures.
These additional observations do not broaden the capability declarations.
A separate five-case next-timer/pending corpus records one raw-row mismatch in
public extra-argument handling; the current public adapter forwards steps that
the pinned reference ignores. That bounded adapter repair remains next work.

Broader timer options, tick modes, Browser profiles and stable-release
requirements remain open. The protected requirements files are unchanged,
performance budgets remain deferred and stableReady remains false.

## Increment 75: Pinned public next-timer argument behavior

October 18, 2026. The two public next-timer methods and their declarations now
match the pinned zero-argument Vitest 5.0.4 surface. Extra JavaScript arguments
are ignored, so each call advances one deadline without coercing an argument.
The internal clock's step-aware algorithm remains unchanged.

The original five-case timer corpus now matches all five complete dictionaries,
raw case and file outcomes, totals and output streams. A separate two-case
reference matches six sync/async snapshots for extra zero, two and coercible
object arguments. The earlier normal113 one-row mismatch remains recorded.
A maintained fresh-process control also checks extracted method return identity,
unchanged scope errors, unused throwing argument coercion and restored globals;
repository type checking verifies the actual public zero-argument tuples.

Normal114 passes **1,959/1,959** cases across the same seventeen whole suites.
All previous 1,958 names and multiplicities remain with exactly one addition.
Repository types, lint and formatting pass. The unchanged public timer8,
animation-frame4, project4, retry14, wait15, mocking35 and helper5 corpora retain
their expected complete observations and outcomes. The executable Date-valued
project comparison still matches one pass and three epoch-validation failures.
All original owners and streams close normally, owned fixtures are removed,
and all selected source and build outputs remain unchanged after readers close.

The full acceptance baseline is normal113's **264/264** in **749.018 seconds**,
before this six-line public-adapter repair. It was not rerun for this bounded
change; the current verification uses the complete component suites, public
reference corpora and repository types. All 432 release-gap source files remain
unchanged. The checkpoint is
`/private/tmp/next-testing-batch114-root-verification.json`.

Broader timer option combinations, profiles and stable-release requirements
remain open. The protected requirements documents remain unchanged, performance
budgets remain deferred and stableReady remains false.

## Increment 76: Browser mutable clock configuration

October 18, 2026. The Browser facade now admits the existing shared
vi.setConfig and vi.resetConfig methods. The two-line production change preserves
their void return types and existing file-owned configuration implementation.
The measured scope is fake-timer configuration; broader RuntimeOptions
combinations remain unqualified.

The genuine four-case Browser reference and normal115 now match all four complete
dictionaries and raw case/file outcomes. It covers cross-case defaults, shallow
per-call overrides, saved project defaults, inherited loop limits and the fact
that changing or resetting configuration does not replace an installed clock.
The earlier unchanged normal114 run retains all four unsupported-method failures.
A maintained control executes the same literal bodies through the real Browser
assertion backend, checks full observations and preserves failure cleanup.

Normal115 passes **1,960/1,960** cases across the same seventeen whole suites,
retaining all previous 1,959 names and multiplicities with one new control.
Repository types, lint and formatting pass. Public timer15/21-row, mocking35,
project4 and retry14 regressions retain their complete expected observations.
The executable Date-valued project still matches one pass and three expected
epoch-validation errors. All original readers and output streams close normally,
owned fixtures are removed and the selected source/build inventory remains
unchanged after completion. The checkpoint is
`/private/tmp/next-testing-batch115-root-verification.json`.

The last full acceptance baseline remains normal113's **264/264** before the
bounded normal114 and normal115 facade repairs; it was not rerun for these
changes. All 432 release-gap sources and both protected requirements documents
remain unchanged. Broader release requirements stay open, performance budgets
remain deferred and stableReady remains false.

## Increment 77: Browser provided values and project mock resets

October 18, 2026. The serial development Chromium lane now forwards project
provided values to named inject before collection, using the measured JSON
projection. Three literal JSON cases and one rich-value projection case match
all seven complete reference dictionaries and raw outcomes. TestContext.inject,
arbitrary serialization and wider Browser profiles are not claimed.

The same normal116 build forwards clearMocks, mockReset, restoreMocks and
unstubGlobals into the existing shared file initializer. It does not change
reset algorithms or defaults: Vitest 5.0.4's clearMocks:true default remains,
while explicit false preserves earlier call histories. Five two-case project
configurations match all ten full reference dictionaries, including original
implementations, spy-property identity and global restoration. unstubEnvs and
broader flag combinations remain unqualified. The unchanged normal115 explicit
false mismatch and truthy-option refusal before collection remain retained.

Normal116 passes **1,962/1,962** cases across the same seventeen whole suites,
retaining every previous 1,960 name and multiplicity with exactly two new
controls. Repository types, scoped lint and formatting pass. Public clock-config4,
project4, retry14, timer15/21-row, mocking35, next-timer7, waits15/21-row and
helper5 regressions retain their measured observations. The helper keeps its
two passes and three intentional failures; executable Date-valued project config
keeps one pass and three expected epoch errors. Raw URL/path stack presentation
remains unqualified. Ten initial operational evidence-parent errors occurred
before CLI launch and remain retained alongside the corrected public sequence.

All original readers and output streams close, temporary fixtures are removed
and the selected 897-source/9,318-output inventory remains unchanged after
completion. The checkpoint is
`/private/tmp/next-testing-batch116-root-verification.json`.

The last full acceptance baseline remains normal113's **264/264**, before the
bounded normal114 through normal116 changes; no normal116 full acceptance run
is claimed. All 432 release-gap sources and both protected requirements
documents remain unchanged. Broader release work stays open, performance
budgets remain deferred and stableReady remains false.

## Increment 78: Browser globals and resolved ESM parsing

October 18, 2026. The serial development Chromium lane now supports project
`globals: true`, loading the Browser facade before collection. Both runners
install all nineteen measured globals, including `chai`, and retain the existing
property ownership and descriptor restoration rules. The public globals type
adapter includes the same Chai binding.

The native parser now uses resolved ESM grammar before resolver for Browser
creator instrumentation, including no-import `.mjs` and package-type-module
`.js` files. Ordinary parser callers keep their existing signatures and grammar.
Two actual parser controls and all thirteen existing creator controls pass.
The unchanged normal116 Node missing-Chai failure and Browser script refusal
remain retained, alongside the initial compile and new-control failures resolved
during this increment.

Normal117 passes **1,964/1,964** cases across the same seventeen whole suites,
retaining all 1,962 prior names and multiplicities with exactly two appended
globals controls. Repository types, scoped lint and formatting pass. Five public
globals cases match all eleven full rows and raw outcomes. The existing sixteen
Browser mocking cases retain all twenty-one measured rows; their known URL
layout difference remains explicit and unqualified.

The full unchanged acceptance suite also passes **264/264** on this normal117
native build in 725.815 seconds, retaining every normal113 case name and
multiplicity. All readers close and owned fixtures are removed. The complete
898-source/9,318-output inventory is unchanged after validation; all 432 release-gap
sources and both protected requirement documents remain unchanged.

The actual normal native build and full bootstrap pass. The current checkpoint
will be `/private/tmp/next-testing-batch117-root-verification.json`. Broader
release requirements stay open, performance budgets remain deferred and
`stableReady` remains false.

## Increment 79: Browser artifact records and ordered completion output

October 18, 2026. The serial development Chromium lane now supports data-only
`recordArtifact`, preserving the measured task and attempt ownership, synchronous
location mutation, deferred JSON cloning, returned object identity and parent
artifact history. Existing named and `vi` facade differences and plain-object
transport rejection behavior remain literal. Accepted operations may finish after
file disposal; new calls still follow the existing lifetime rules.

Browser callsite mapping uses the existing standalone Acorn parser and shared
AST traversal. The Node wrapper retains its original Babel parsing and stack
selection. Browser TypeScript and JSX retain conservative mapped-point fallback.
Native console events arriving after the stop marker now wait for older queued
RPC output and all cleanup owners, preserving their original text, stream and
timestamp before file completion.

Normal118 attempt03 passes **1,970/1,970** cases across the same seventeen whole
suites, retaining all 1,964 normal117 names and multiplicities with six appended
controls. Repository types, scoped lint and formatting pass. All seven unchanged
public Browser artifact cases match eleven full ordered observation rows, all
six parent artifact payloads and histories, and complete raw case/file outcomes.
The initial Browser compilation failure and the later output-order mismatch are
retained alongside the final passing results; no expected rows were reordered.

The core package build passes using the unchanged normal117 native binary. The
latest full unchanged acceptance run remains **264/264 on normal117**, before
this artifact change. All readers close and owned fixtures are removed. The
complete 907-source/9,324-output inventory is unchanged after validation; all 432
release-gap sources and both protected requirement documents remain unchanged.
The next file-format baselines retain two passing Browser `.cjs` cases and
the actual precollection failure for package-type-commonjs `.js`.

The checkpoint is `/private/tmp/next-testing-batch118-root-verification.json`.
Attachments, rich artifact transport, cross-file targets and live custom reporter
callbacks remain open. Broader release requirements stay open, performance
budgets remain deferred and `stableReady` remains false.

## Increment 80: Browser module entries, async hooks and environment stubs

October 19, 2026. The serial development Chromium lane now applies ESM grammar
and module treatment to the exact processed Browser test entry, including plain
`.js` and package-type-commonjs `.js`. The corrected control uses the real
`ModuleAssetContext.process` path and parent-directory options; the earlier
leaf-only control missed that seam. Ordinary dependencies and Node contexts keep
their existing module policy. Browser `.cjs` was already passing before this fix;
no general CommonJS compatibility claim is added.

`vi.dynamicImportSettled` uses the actual entry's import tracker and independent
cleanup. Browser per-test hooks, bodies and listeners share the same public test context
and local expectation. Suite-hook result settlement consumes genuine async work
and preserves beforeAll cleanup functions before ordinary assertion returns leave
the bound invocation. Native Promise adoption may read an absent `then` on a
known live noncallable Chai assertion without changing its payload identity.
Present protocol properties, assertion methods, disposal and Node behavior retain
their existing checks. The template injection marker now survives ambient type
declaration erasure; the actual emitted-template expander controls retain both
original failures and repaired empty/registered injection results.

Watch filtering excludes the configured output root, including its development
subdirectory's parent. Aborted standard-coverage generations honor the actual
coordinator cancellation signal even when the child summary says failed; ordinary
missing coverage and unsafe cleanup still fail. The full normal119 run remains
**263/264**, with the retained-watch addition selecting two cases instead of one.
Later isolated default and retained flows match the measured coverage fields,
source bytes, LCOV and **1/1/2** stage counts using the existing file-key/path
projection. The default result required a saved-data-only
comparator correction: its genuine addition map contains only the subject source.
No CLI was rerun for that correction, and the original selection cause remains
unattributed. [Saved watch comparison](/private/tmp/next-testing-watch-output-root121-normal120-attempt03-saved-reanalysis01/result.json).

Browser project `env`, `unstubEnvs`, `vi.stubEnv` and `vi.unstubAllEnvs` now share
one mutable file record. A generic optional Turbopack request/export descriptor
resolves its runtime getter without embedding Next paths in Turbopack. The actual
client template seeds compiler-derived defaults and configured strings before
initialization and authored evaluation. Direct and aliased reads remain mutable;
stubbing before the first authored reader preserves saved configured and Boolean
originals. Node's existing process.env implementation remains unchanged.

Earlier compiler/control, template-injection, hook-settlement and unsupported-env
failures remain retained; the fixed public fixtures and oracles stay literal.
Normal122 attempt05 passes both actual native env-binding controls, a fresh
`55b83cfc…` native build, the normal bootstrap with a fresh core build and genuine
declaration emission, and repository type checking. Its recorded input set is 921 sources and
9,327 outputs; this is the build freeze, not a final post-reader inventory claim.
[Actual build record](/private/tmp/next-testing-batch122-attempt05-normal-build-verification.json).

The unchanged primary seventeen public groups match **41 cases**, **69 complete
records** and **six parent artifact payload/completion records**, retaining one
intentional failing case and its expected CLI exit 1. Separate env groups match
the original four cases/five rows and two fresh cold-reader cases/two rows.
All original public owners and streams close naturally, temporary fixtures are
removed and selected inputs remain unchanged. Raw URL/stack and stamped-import
layout differences remain explicit and unqualified.
[Primary public proof](/private/tmp/next-testing-browser-public122-attempt05-verification.json),
[env public proof](/private/tmp/next-testing-browser-env122-normal122-attempt05-actual01/ACTUAL-REVIEW.json).

The attempt05 focused run records **1,983/1,984** across the same seventeen whole
suites. Its sole failure is an obsolete helper assertion expecting `stubEnv` to
remain unsupported. That raw result is retained; two unit-test adapter expectations
are corrected to check callable, stable identity without changing the genuine bodies or expected rows.
[Retained focused result](/private/tmp/next-testing-batch122-attempt05-components-results.json).

The attempt06 whole-suite rerun passes **1,984/1,984** across all seventeen suites; original process 7720 closes with exit 0 in 169.283s. Every prior 1,980 name and multiplicity remains, with four new environment controls, and all names from the failed attempt05 remain. Repository TypeScript, scoped ESLint and formatting checks pass. Only the two obsolete unit-test adapter assertions changed from attempt05; all implementation, Rust and 9,327 built outputs remain byte-identical, so its actual build and public proofs remain applicable. Attempt06 does not claim a new native/package build. [Focused verification](/private/tmp/next-testing-batch122-attempt06-focused-independent-data-verification.json).

The fresh, unfiltered attempt06 regression run passes **264/264**; original process 11214 closes with exit 0 in 755.043s. Names and multiplicities match both the normal117 green baseline and the retained normal119 failure. The original full command, coverage/watch fixtures and expectations are unchanged. This current pass does not identify the cause of the historical normal119 addition selecting two cases. [Full result](/private/tmp/next-testing-batch122-attempt06-full-results.json).

The post-reader audit verifies all **921 sources / 9,327 outputs**, all **432 protected release-gap sources**, both requirement-document hashes, the exact native binary, closed original owners/streams/fixtures, and the clean main checkout. The status ledger is then the sole authored-source update; a separate post-ledger inventory binds that documentation update without changing the implementation or built outputs. [Final verification](/private/tmp/next-testing-batch122-attempt06-final-verification.json), [post-ledger inventory](/private/tmp/next-testing-batch122-attempt06-post-ledger-verification.json).

Broader Browser profiles, production/watch/concurrency interactions, environment
configuration and stub combinations, complete module/lifecycle/utility parity,
artifact attachments and live reporter callbacks remain open. The protected
requirements and release-work table are not relaxed. Performance budgets remain
deferred and `stableReady` remains false.

## Requirements that remain release work

| Surface                         | Remaining blockers                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports and types               | Public subpath adapters, globals, complete overload/augmentation/helper-package conformance; full type-tooling beyond the bounded one-shot compiler tests in increment43; in-source helper-value/wrapper/other-profile conformance beyond the bounded Node and production-removal evidence in increment44.                                                                                                                                         |
| Declarations/lifecycle/fixtures | Concurrent/shuffled suites, asynchronous collection timeout/failure interactions, complete around-hook failure/timeout conformance, cross-file worker lifetime beyond the bounded serial development Node cohort in increment44 and remaining builder/fixture conformance, complete task/context identity and metadata/report interactions, assertion-count timing and failure-listener parity, complete failure/timeout/retry interaction corpus. |
| Assertions and utilities        | Full matcher/utility/reset/lifetime conformance, real ecosystem matcher packages, remaining clock operations and precise compilation/environment-stub diagnostics.                                                                                                                                                                                                                                                                                 |
| Module mocks                    | Hoisting/actual imports, dynamic registration/reset, auto/manual/spy mocks, external/CommonJS ESM targets, cycles, other profiles and complete isolation/conformance.                                                                                                                                                                                                                                                                              |
| Snapshots                       | Complete filtered/partial/CI/watch policy parity, broader serializers/naming/error snapshots, retry/reset and failed-publication comparisons, cancellation/concurrent-edit/crash publication matrix. The existing retry primitive patch is a Next adaptation requiring maintained upstream assessment; it is not a stable exception approval.                                                                                                      |
| Environments/browser            | Full DOM/custom-provider/client-condition conformance beyond the bounded real Node environment evidence in increment44, actual browser-executed client tests and rendering helpers, browser watch and broader production mounting, advertised engine/platform acceptance, custom environments and Edge decisions. Node browser drivers are not Browser Mode.                                                                                       |
| Configuration/migration         | Full typed/public config APIs and helper/default conformance beyond increment 34, broader function-valued/external/glob project roots and containers, watch setup lifecycle parity, environment/reset/ordering/snapshot/report/coverage settings and complete compiler-option mapping. Executable configs, compatible translation, precedence, globals/provided context and one-shot global setup have the bounded evidence in increment 27.       |
| CLI/watch/CI                    | Defaults, complete static/transform/location and dynamic metadata/forbidden-focus projections, changed/related profiles and precision for opaque graphs beyond bounded development Node, complete bail/timeout/retry/focus interaction conformance, precise reference sharding semantics, incremental compilation/selection, parallel watch/browser execution and full PTY/output conformance.                                                     |
| Coverage                        | Full production-quality coverage beyond increment43 syntax-preserved JavaScript standard metrics/reports: TypeScript/JSX recovery, additional provider services and transforms, additional reporters/threshold modes, profiles/mocking/watch and cross-shard aggregation. Bare imported-line coverage remains a separate metric.                                                                                                                   |
| Tooling/reports                 | Full JSON/JUnit/empty-suite metadata and failure/publication conformance, watch/custom reporter adapters, complete foreign Vitest coverage/pending/output adapters and editor/run/rerun/cancel/snapshot control interfaces beyond explicit serial worker inspection.                                                                                                                                                                               |
| Next fidelity                   | Broad independent normal-application comparisons, route/layout/cache contracts, broader production mounting, prerender/PPR/action decisions and all-profile omission. Existing narrow profile checks are not broader guarantees.                                                                                                                                                                                                                   |
| Adoption/release                | Representative unmodified downstream suite migrations, clean package-manager/Node/OS/architecture/browser matrix, CI qualification, sustained cleanup/crash/watch/resource stress and further process-ownership failure assessment, release/support/maintenance ownership and downstream canary/rollback. Performance budgets remain deferred by the user, not passed.                                                                             |

The implementation retains experimental exports and precise unsupported-feature
errors. None of the rows above is closed by documenting a limitation. In
particular, the current unsupported subpaths, snapshot policies, environments,
configuration, mocks and fixtures have not been approved as stable exceptions.
