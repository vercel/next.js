# Next testing implementation contracts

Internal v1 direction accepted by the coordinator, based on
`602a2aba900e45fb2edd694f463f435430678e1f`. Concrete producer agreements below
are incremental; absent capabilities are not implied. I edits
this document and shared `experimental/testing/contracts.ts`; each producer owns
its implementation and proposes additions through I. These are internal boundaries,
not promises of a shipped public API.

## Ownership

All paths below are relative to `packages/next/src/experimental/testing/` unless
qualified. Existing files outside these areas require coordination with their owner.

| Owner | Implementation reservation                                                                                                           | Consumers        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| A     | `compiler/`, native test entry/bindings and `build/swc` compiler types/setup                                                         | B, E, G, I, J    |
| B     | `execution/`, worker bootstrap/IPC, artifact loading and realm disposal                                                              | C, E, F, G, H, I |
| C     | `runner/`, `vitest.ts`, collector, hooks, attempts, fixture lifecycle                                                                | B, D, F, G, H    |
| D     | `assertions/`, assertion/spy/snapshot primitives and authoring types                                                                 | C, K             |
| E     | `rsc/`, rendering and observations; necessary app-render extraction                                                                  | C, F, H          |
| F     | `request/`, request/cache fixtures and store setup                                                                                   | E, H             |
| G     | `mocking/`, mock graph/runtime protocol (A owns shared compiler edits)                                                               | A, B, C          |
| H     | `browser/`, Playwright browser/server fixtures and instant integration                                                               | C, I             |
| I     | this document, `contracts.ts`, `config.ts`, `discovery.ts`, `orchestrator.ts`, `cli/next-test-runner.ts`, `bin/next.ts` registration | all              |
| J     | `incremental/`, dependency revision selection/invalidation                                                                           | I                |
| K     | `reporting/`, including authoritative `events.ts` result types                                                                       | B, C, I          |
| L     | `test/e2e/app-dir/next-testing-reference/` canonical oracle and uniquely named conformance suites; no production modules             | all              |
| M     | user documentation/examples, compatibility checklist                                                                                 | users            |

Owners reserve their focused generated tests by unique `next-testing-<area>` names.
Package exports/dependencies and existing shared files must be requested through the
coordinator before editing. I owns the config export; C owns the Vitest facade export.

## Profiles and discovery (I → A/B/H)

`TestProfile` contains `id`, `mode: 'development' | 'production'`,
`environment: 'node' | 'rsc' | 'browser'`, `runtime: 'nodejs'`,
`bundler: 'turbopack'`, and optional `route`. Browser means a Node e2e driver with
real Next app/browser fixtures in milestone 1, not browser-realm spec evaluation.
`TestEntry` contains `id`, absolute `file`, and `profile`. IDs are stable per
project-relative file plus profile. Profiles describe intent; A validates and
reports the actual inherited compiler context. No `NODE_ENV=test` translation.

I reads `next.test.config.json` initially (no config code execution/transpiler),
with `compatibility: 'vitest'` and named `projects` containing `environment`,
`mode`, `include`, `exclude`, optional `route`, `setupFiles`, `testTimeout`, and
`hookTimeout`, and `fileTimeout`. CLI selects project and file substrings. Unknown settings fail;
aliases/plugins/defines/environment overrides belong to actual Next config or are
unsupported. TS configuration is a later loader addition, not a custom compiler.
I passes project directory and selected profile; A uses Next's normal config/setup
path for its phase and returns resolved profile metadata. Config is never sent in
events, and secrets/env values are never fingerprinted or logged.

## Compilation and execution (A → B; I coordinates)

A provides a disposable compiler session per directory/mode, with
`compile(entry, { signal }) → CompiledTestArtifact`. The agreed concrete
artifact shape is in `contracts.ts`: an immutable revision, entry/profile identity,
emitted loader entry, manifest/assets/source-map references and diagnostics.
Artifacts must not contain live module objects or React values. A owns revision
retention until all B leases release; compilation failure never returns a runnable
artifact. Project creation must reuse real Next contexts and configuration.
The actual factory is `createTestCompilerSession(projectDir, profile)` in
`compiler/index.ts`, exposing `compile(entry, {signal})` and `dispose()`.
Native compilation cancellation is currently cooperative: A checks the signal
around native operations and disposal awaits pending emission to prevent late
writes into removed snapshots. An unresponsive native operation cannot yet be
interrupted or given a hard deadline; bounded compiler cancellation is not claimed.

B provides `execute(artifact, options) → FileResult`, where options contain run
identity, setup files, case-name filter, timeout defaults, abort signal and event
sink. B owns a fresh process/realm per file and calls C inside the emitted bundle.
B uses the emitted entry bootstrap agreed with A/C below; direct host imports of
uncompiled specs or a second React/collector instance are forbidden. I sequences
compilation/execution initially; no concurrency promise is needed for milestone 1.

## Test API context (B ↔ C ↔ D/E/F/G/H)

C owns one realm-local API instance, initialized before setup/spec evaluation,
then collection closes and C executes selected cases. C supplies stable file/case
identity and zero-based retry/repeat attempt identity. No callbacks/closures cross
IPC. C exposes a per-attempt context with abort signal and LIFO asynchronous
cleanup registration; B supplies file lifetime and an outer hard-stop deadline.
C owns hook/test timeouts, assertion finalization and fixture setup/teardown.
D owns assertion state per attempt and attaches errors before C seals its result.
F/G/H register scoped resources with C; E registers streams with the active attempt.
Late failures remain run failures and cannot mutate an already-passed attempt.
C/D propose exact hook names together before implementing cross-owner imports.

E renders using React/Flight/manifests loaded inside the matching emitted bundle.
Its observation handle distinguishes completion, failures, and client boundaries;
it owns stream disposal. F supplies real request/work stores and explicit cache
scope. H owns server/browser leases; fresh context per attempt, registered fixture
IDs for future component mounting, and the actual `@next/playwright` instant helper.
No arbitrary React values/closures cross the browser/server transport.

## Result boundary (K accepted; B/C/I producers)

Events are JSON-serializable, versioned (`version: 1`) and carry `runId`, `type`,
`timestamp` (epoch milliseconds), optional entry/case/attempt identity and profile.
Initial kinds: `run-start`, `file-start`, `case-start`, `case-end`, `file-end`,
`diagnostic`, `output`, `attachment`, `run-end`. Only C emits case outcomes; B emits
worker/collection failures; A emits compile diagnostics; I owns run lifecycle.
The authoritative payloads and summary counters live in K's
`reporting/events.ts`: `ResultEvent`, `FileResult`, `SerializedDiagnostic`,
`AttemptIdentity`, `CaseResult`, `RunSummary`. `TestEntry` and `TestProfile` live
in I's `contracts.ts`. Attempt identity is `{ id, retry, repeat }`; phase is
configuration/compilation/collection/runtime/cleanup/reporter. Case outcomes are
passed/failed/skipped/cancelled, run outcomes exclude skipped. `file-start` carries
entry/profile and optional revision. Precollection failures emit diagnostics even
when there are no cases. Earlier retry errors remain attached to their attempts;
the latest retry determines the case outcome. Independent error diagnostics and
failed files fail the run. `createTestReporter({write})` consumes events only.
Errors preserve message, stack, phase, original location when known, and causes;
never invent source attribution. Attachments reference owned files, not large
binary payloads. Reporter failure is a run failure, not a swallowed exception.

## Cleanup and integration gates

I owns cancellation and closes acquired top-level sessions in reverse order in
`finally`. B cancels/kills workers on deadlines/crashes and guarantees file disposal.
C awaits attempt teardown even after setup/body failure; teardown errors are
additional failures. H closes contexts/server leases; E aborts/drains streams;
F/G/D reset only their owned scoped state. Cleanup is idempotent. A compiler cache
may outlive attempts but evaluated modules/manifests/request/cache state may not
cross files. Normal Next builds never expose test entries or test transport.

Until A/B/C and K provide accepted concrete producers, discovery/listing and strict
configuration validation may be delivered independently. An execution command
must fail explicitly when a capability is absent; injected test doubles verify
orchestration only and do not count as the integrated unit/RSC/browser milestone.

## Concrete producer agreements

- A/B: native `Project.testEntry({file, id})` reuses existing Endpoint emission.
  Initial support is App RSC/Node/development only. Generic Node, browser, and
  production profiles must reject until their actual contexts are implemented.
  Artifact common fields contain `entryId`, `profile`, `revision`, absolute `rootDir`, and
  `entryPath`/`files`/`manifests` relative to an immutable root plus diagnostics.
  A retains the artifact lease until B's child process closes. Complete immutable
  closure publication remains a validation gate.
- A/B/C: emitted namespace exports `testRunner` from `runner/index.ts`,
  `loadTestModule` as a deferred loader, `ComponentMod` from entry-base and
  `__next_app__` runtime helpers and `setManifestsSingleton`. B installs real
  client/action manifests using `manifestPage` before collection.
  `testRunner.initializeTestFile({fileId,filePath})`
  returns `{api, collect(load), run(options), dispose()}` inside that bundle.
  `collect` loads setup/spec then closes registration. The facade and bootstrap
  must resolve to one C module identity; B cannot load C separately on the host.
  Compiled setup loading remains capability-gated; B rejects setup files until A
  provides it. `ExecuteTestOptions` / `ExecuteTest` are authoritative in
  `contracts.ts`; B exports `execute` from `execution/execute.ts`.
  `projectDir` is required in execution options and is the worker's cwd; never
  infer it from snapshot/distDir paths. B owns a POSIX process group and bounded
  pipe closure; Windows execution explicitly rejects until equivalent ownership
  exists. B invokes the same-bundle `ComponentMod.patchFetch()` before subject
  loading. Request `onClose`/`waitUntil`/`onAfterTaskError` must have a concrete
  awaited owner before request/cache capability acceptance; Flight completion
  alone does not prove this lifecycle completed.
- C/D: attempt context includes stable identity/name, retry/repeat, attempt abort
  signal and `onCleanup(fn)`. `beginAttempt(context)` returns
  `{finalize(), dispose()}`. C finalizes assertions after body/afterEach/user
  cleanup, then disposes before sealing; all errors attach to the attempt.
  Cancellation gets a fresh signal per retry; no cleanup registration after seal.
- E/F: E consumes actual bundled `ComponentMod` renderer and client manifest.
  `rsc/render.ts` exports `renderServerComponent(ComponentMod, manifest,
Component, props, {signal})` returning `{stream, completed, dispose}`.
  Completion means consumed/disposed transport; semantic observations remain
  pending the actual decoder. `request/request-context.ts` exports
  `runWithRenderRequest(inputs, workContext, render)` building real stores inside
  that bundle; render phase remains read-only.
  Fresh request stores do not reset persistent caches. External cache handlers
  require explicit reset/namespace or rejection. E observation uses the matching
  React decoder, never raw Flight parsing.
  F's `createRequestLifecycle()` returns `{renderOpts, close()}`; close dispatches
  the real close signal, drains recursive waitUntil work and retains errors.
  E registers one cleanup before rendering, disposes the stream then closes F in
  `finally`, preserving both failures. B owns the outer hard process deadline.
  A optionally publishes `artifact.requestContext: CompiledTestRequestContext`
  from its already resolved Next configuration. The central type in `contracts.ts`
  carries build/deployment IDs and explicitly selected serializable render options:
  cache-life profiles, static-generation timeout, Cache Components, validation
  level, asset prefix, and experimental auth/use-cache-timeout/durable-cache flags.
  F/E must reject absent metadata for request rendering; ordinary direct-throw
  test artifacts remain compatible without it. No preview signing keys, runtime
  callbacks, request headers, or cache instances cross this boundary. Route-derived
  and cache/prerender capabilities remain separate: use their real runtime setup
  or reject unsupported modes rather than inventing defaults. A owns production
  of this payload, F/E its use, and B preserves it with the immutable artifact.
  `requestContext.incrementalCache` optionally adds actual resolved cache memory
  size, allowed revalidation header names, fetch-cache prefix, disk-flush flag,
  and `customHandlersConfigured`. This marker checks actual configured handler
  values, not the presence of the default handlers object. Request/cache execution
  requires these options plus `manifests.previewProps` and `manifests.prerender`
  (relative paths in the immutable closure). A reuses normal development manifest
  production; preview values stay in files and never enter metadata or logs.
  F uses the real cache constructor; B supplies `{type: 'file', directory}` for
  mutable cache disk storage. Memory/disk sharing is file-scoped, not a cold-cache
  guarantee per case/request. Custom/platform/already-initialized handlers and
  unsupported route/prerender cache modes are rejected until their actual graph
  and lifecycle are integrated.
- B/H/I: I holds parent browser/server leases until B child closes, and disposes
  in `finally` even after hard kill. B passes serializable browser connection and
  base URL; H creates a fresh context inside the attempt. Server start needs an
  actual immutable app artifact; an arbitrary copied app is not a compiled test.
- J: pure conservative selector consumes `{revision, affectedEntryIds, complete}`
  plus discovery generation. Incomplete/unknown/mismatched generations and global
  config/setup changes run all discovered entries; new IDs are selected and
  deleted IDs removed. Endpoint timing signals do not prove completeness.
- G: private realm-local registry accepts only compiler-issued target identities.
  Registry tests do not enable public mocking: A must provide real graph hoisting,
  original-target retention, and async import bridge before C exposes support.

## Next-profile batch: artifact v2

This schema migration is a separate batch from current v1 render/cache validation.
`CompiledTestArtifact` is an internal version-2 union of
`CompiledRscTestArtifact` (`kind: 'rsc'`, profile environment `rsc`) and
`CompiledNodeTestArtifact` (`kind: 'node'`, profile environment `node` or `browser`).
Both carry the immutable entry/files/diagnostics and requested profile. RSC-only
manifest page, manifests and request context retain their existing shape on the
RSC branch; Node artifacts contain none of those fields, not fake empty values.
Result events remain version 1; their version is independent of artifact format.

A emits v2 from its actual RSC or non-RSC Next context, preserving the requested
profile. B validates version and kind/profile agreement before loading, then
explicitly narrows the RSC setup. Node bootstrap requires only the same-bundle
runner and lazy spec loader; H/B add browser capability only when its real bridge
exists. Workers reject v1 artifacts clearly: these leases are ephemeral and have
no persisted compatibility promise. A/B/I migrate their owned fixture producers
together; this change does not itself claim working Node/browser execution.
For browser drivers only, A publishes optional
`applicationServer: {mode: 'development', lockDistDir: boolean}` using its actual
resolved config. Browser orchestration must reject absent/false locking evidence
before H acquisition and pass it as H's `outputLockEnabled` input. H preserves
normal Next output locking; neither layer reloads config, invents enabled defaults,
overrides configuration, or substitutes a duplicate lock. This evidence does not
replace shutting down the compiler graph.

The staged browser bridge receives `ExecuteTestOptions.browser` with
`wsEndpoint`, `baseURL`, and required absolute `outputDir`. I retains that output
root for reported attachments. B allocates per-attempt descendants using safe
identifiers, rejects path escape, and emits K attachments attributed to the real
C attempt. H's emitted facade delegates through a same-process function binding
to worker-owned browser infrastructure. No live Playwright objects cross IPC and
no untraced mutable infrastructure imports enter the subject graph. This field
does not enable browser execution before the actual A/B/H bridge is integrated.

The initial browser lane serializes writers to the configured app output. I
compiles driver snapshots then awaits A's explicit native graph/watch/cache
shutdown before acquiring H's normal app server, retaining immutable artifacts.
H checks normal output ownership and fails if another process owns it. B driver
closure precedes H server disposal, which precedes A artifact disposal. No copied
app, config override, concurrent output writer, or termination of external servers
is part of this boundary. A's `session.shutdownCompilation()` awaits pending work,
rejects new compilation and shuts down the native graph once, retaining artifact
directories. `dispose()` awaits that shutdown then deletes artifact directories.

The staged I browser orchestration now uses those actual producers. It compiles
the selected browser project entries before `shutdownCompilation()`, then acquires
H's `createApplicationServer` and `createBrowserHost` per file. Both leases remain
alive until B's driver closes, including cancellation/hard kill; cleanup attempts
browser then server disposal even when either fails, and A snapshot disposal comes
last. Startup-log attachments survive acquisition failures. Parent attachment
roots are unique absolute temporary directories retained for reported file links,
independent of the compiler's snapshot/output directories. Pure cancellation stays
cancelled, while additional acquisition/cleanup errors still fail the run.
I buffers browser worker `file-end` until B has closed and both parent disposal
attempts settle, then emits exactly one terminal file event with a fresh timestamp
and duration including parent cleanup. Cleanup failures fail the owning file even
during cancellation; completed case/attempt outcomes remain unchanged. Worker
failures remain failed, and pure cancellation with successful cleanup stays
cancelled. Missing non-cancelled or duplicate worker terminal events fail the file.
Parent resource disposal failures prevent later server acquisition or compilation
because output ownership may not have been released.
Failed acquisition also stops later owners conservatively, since cleanup may fail
before a lease is returned. Cancellation classification uses bounded guarded
inspection; hostile error properties cannot replace the original diagnostic.

H's emitted `initializeBrowserTesting({getActiveAttempt, createFixture})` binds
the actual C attempt getter to B's worker-owned infrastructure callback. B passes
only connection metadata over IPC and attributes attachments to the actual
attempt. This implementation remains part of the staged v2/browser batch; component
tests of orchestration do not establish real browser-driver acceptance.

## Verified I increment

`next test [directory] --list --project <name> --filter <substring...>` lists
deterministically selected files and requested profiles. No config means one
`default` Node/development project. Defaults include
`**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}`; hidden files/directories,
`node_modules`, and symlinks are not traversed. Setup files must resolve inside
the project and are excluded from test discovery. Each project can provide its
own includes/excludes. Unknown settings and alternative Next/Vitest/Vite test
config files fail explicitly; JSON parsing does not print source contents.
No `.env.test` or other environment loading occurs during listing.

The command's execution path now calls the actual A compiler session, B executor,
and K reporter. I runs selected files serially and retains each session/artifact
until B closes its execution processes, then disposes in `finally`. Compiler,
worker and cleanup failures precede `run-end`; the reporter summary decides the
exit code. SIGINT/SIGTERM abort execution; reporter failure aborts producers and
still disposes leases before propagating the failure. The outer `fileTimeout`
defaults to 120 seconds for the entire file (collection, all cases/hooks, cleanup).
It is configurable and must be at least each declared case/hook timeout; longer
individual budgets require explicitly increasing the outer cap. Multiple
compilation modes in one process and conflicting NODE_ENV
are rejected; application realms never default to NODE_ENV=test.

`--run` and default execution run once; watch and TS configuration remain absent.
This wiring does not widen A/B capability support. Component tests use controlled
compiler/executor seams and the real K reporter; they are not evidence of actual
native compilation/worker acceptance or the integrated unit/RSC/browser milestone.

## Stage two: ordered setup agreement (A2/B2/C2/I2)

`CompileTestOptions` adds optional `setupFiles: readonly string[]` to the existing
`signal`. Discovery supplies absolute, project-contained files in declared order;
I forwards those inputs without sorting. A compiles setup with the same test
context and publishes `artifact.setupFiles` with the exact ordered identities,
including an empty array. An absent field remains compatible only with no setup.
The artifact format remains v2 and result events remain v1.

The emitted namespace exports `loadSetupModules(): Promise<void>`, sequentially
awaiting compiled setup imports. B validates requested setup identities against
artifact metadata before evaluation and requires the loader for nonempty setup.
After all bundle-local runtime initialization, B uses one
`file.collect(async () => { await loadSetupModules(); await loadTestModule() })`.
The runner initializes assertions before this callback and closes registration
after it; setup can register hooks, declarations, custom matchers and spies in
the same file context. Setup has no case/attempt identity. Setup failure prevents
spec loading and follows existing collection failure and disposal ownership.
B checks cancellation before/after setup and before the spec. Cancellation between
individual setup modules is not claimed; the outer worker deadline still applies.
Host imports of setup source and a separate collector/React identity are forbidden.

## Stage two: snapshot transport agreement (B2/C2/I2)

`ExecuteTestOptions.updateSnapshots?: boolean` is explicit opt-in, with omitted
and false values read-only. It is not a configuration default. The first CLI
increment is one-shot `--update`; `--watch --update` and `--list --update` reject.
B forwards the transport to C's bundle-local snapshot policy. C stages a
serializable write plan and preserves unchecked entries even on full updates;
the worker must not modify source snapshots. B owns committing that plan only
after authoritative successful worker exit and complete cleanup. A passing worker
payload followed by a nonzero exit must leave snapshots unchanged. No collection,
final-case, file, cleanup, late failure, or abort may commit. Browser parent resources are
owned outside the worker, so browser snapshot updates remain unsupported until
commit can follow successful parent disposal. These types do not by themselves
enable updates: the concrete C/B producer is a separate integration gate.

## Stage two: conservative watch ownership (A2/B2/I2/J2)

J's `createWatchSession` schedules serialized generations from discovery and
compiler evidence, retaining superseded work until cleanup finishes. I passes
fresh discovery (`projects`, stable entry IDs and a non-secret discovery revision)
and returns `runTests`' terminal summary plus `unsafeCleanup`. Failed parent
acquisition/disposal or compiler disposal sets that marker and permanently stops
the session. Unknown filesystem changes call `invalidate()` without evidence and
rerun all selected entries; no narrow dependency selection is advertised.

The async `watchTestFiles` source owns native filesystem subscriptions. I awaits
creation, configuration-driven update and final close. Startup/error/unexpected
closure fails closed. Actual Next configuration supplies watched roots, output
exclusions and compiler snapshot exclusions through A's `resolveTestWatchOptions`.
Initial invalid configuration fails before watching starts; configuration failures
after startup remain recoverable on the next observed change.

Each metadata lookup and run uses a fresh Next-owned orchestration process, so
normal Next config imports and environment loading cannot retain an earlier
run's cached values. This is process isolation, not a replacement loader/compiler.
Node/RSC watch is the first target; browser watch rejects until parent-owned
application/browser resources are included. Snapshot updates reject in watch.

The watch parent owns the generation POSIX process group and inherited native
loader descendants. B's execution broker runs file workers in the parent, using
B's existing per-file supervisor and the compiler child's privately transported
resolved environment. No environment values are reported or fingerprinted. Normal
cancellation waits for B's terminal response; unexpected child exit closes the
broker before generation-group reclamation. I defers `run-end` until authoritative
child exit and parent cleanup; process failure cannot preserve a passing run.

`TestCompilerSessionOptions.allocateArtifact(parentDir)` lets the parent allocate
and record exact staging/final sibling paths before native emission. A validates
those paths against its actual output directory. The allocator's caller retains
all deletion ownership: compiler disposal/error paths must not delete supplied
paths, including after IPC disconnection. I removes only those recorded paths,
after broker workers and the generation group close. Default one-shot compilation
continues to allocate/delete its own artifacts. This ownership keeps a surviving
parent worker's immutable closure available if the compiler child crashes.

## Stage two: capability publication and static mocks

`capabilities.ts` and `next test --capabilities` publish a versioned executable
inventory separately from requested/discoverable profiles. The pinned Vitest
reference identifies a bounded compatibility target, never the full API. A false
feature includes an actionable unsupported reason and cannot enable execution.
Ordered setup and explicit one-shot Node/RSC snapshot updates have integrated
producer and actual compiler/runtime checks. Static mocks and watch remain
gated pending their combined integration and independent acceptance. Internal
watch lifecycle tests do not by themselves enable the public command.

The compiler may publish `artifact.moduleMocking: {version: 1}` only when it has
emitted the corresponding static factory graph bridge. B requires the same-bundle
`mockTesting.initializeModuleMocking({onLateFailure?})` namespace before setup/spec
loading and disposes the returned file resource. User execution options cannot
manufacture this marker. The initial proposed scope is development Node specs with
literal targets and inline factories; setup combined with static mocks rejects
until ordering is proven. Private registry tests alone do not enable this feature.

## Stage three agreements (I3-COV-1 and I3-FIXTURE-1)

These internal seams do not enable public capabilities. Actual compiler/worker,
App Page/browser, remapping, and packed-consumer evidence must precede capability
publication. Stage-two mocking, snapshot-update and watch limits remain unchanged.

Production keeps artifact version 2 and the `node`/`rsc` discrimination, with the
actual requested compilation mode. `requestContext.mode` is required resolved
metadata; A3 produces it and E3 rejects absent, invalid or mismatched mode before
request/cache execution. `applicationServer` carries actual mode, normal output
locking evidence and resolved absolute `distDir` (required for production). I3
compiles drivers, awaits compiler shutdown, then H3 owns normal application build
and server startup. Driver snapshots remain leased through worker and server
closure. Isolated production tests, an explicitly instrumented production
`instant()` application and ordinary production are independent acceptance lanes.
Production RSC retains route-less dynamic-subtree scope. No production mocks,
production snapshot updates, prerender/PPR or action transport are implied.

A development browser project may register `browserFixtures` as an array of
`{id,module,exportName?}`. IDs are unique safe names, exports default to `default`,
and discovery resolves real project-contained modules and excludes them from spec
discovery. Exported wrapper components can supply providers; no separate provider
protocol or application route/layout context is implied. H3 generates a private
route prefix and threads `BrowserFixtureHost {routePrefix,fixtures}` through its
owned worker/start-server/router/setup-dev-bundler plumbing. A3 owns hot-reloader,
SWC and native registration of actual standalone App Pages in that sole live
application compiler, after driver compiler shutdown. E3 validates JSON props and
uses bundle-local React to create the statically bound fixture element. H3 admits
only registered IDs and JSON data and consumes normal SSR/client hydration assets.
Browser input never names a module or carries closures/React objects. Ordinary
application compilation/startup receives no host registration and exposes no
fixture route. `componentHost` transports only prefix and admitted IDs to B3.

Coverage is opt-in one-shot development route-less Node line coverage. CLI
`--coverage` rejects listing/watch, snapshot updates, broader profiles, and mocked artifacts. No
provider selection, thresholds, branch/function parity or unimported-file
expansion is promised. `TestCoverageRequest {version:1,kind:'node-line'}` reaches
A3 and B3. A3 publishes K3's exact emitted script/map/source identities only when
requested. K3's worker collector starts before emitted bundle loading and captures
through execution/cleanup; actual loaded script bytes are attested in the worker.
B3 owns one versioned `TestCoverageCompletion`, with run/entry/revision identity,
complete capture data or an explicit serialized error. Missing, duplicate,
mismatched or incomplete completion cannot be accepted. B3 validates actual
worker exit and cleanup, including interrupted attempts, before awaiting the
parent-only `onCoverage` callback. It never serializes that callback over IPC.

The final I3-COV-1 agreement uses **one parent remapping step**: I3 calls K3's
`remapCoverage(artifact,capture)` inside the awaited callback before execution
returns and before artifact disposal. Worker-side remapping proposals are
superseded. K3 owns remapping, source hashes, line sets, aggregation and report
serialization; I3 owns invocation and run lifecycle. Clean assertion failures may
still have complete coverage; crash, cancellation, cleanup or late failures may
not produce a successful report. I3 accounts for every selected entry, finalizes
JSON and text into retained unique output files, and reports errors before
`run-end`. Missing captures, remapping/report writes and ownership cleanup errors
fail the run. Reports cannot retain a success percentage when incomplete.
