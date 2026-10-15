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
